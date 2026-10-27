import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, renameSync, unlinkSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitService } from '../src/core/git';

let root: string;
let service: GitService;
let first: string;
let second: string;
let renamed: string;
let removed: string;
let merge: string;
const unusual = process.platform === 'win32' ? '中文 空格 file.txt' : '中文\tfile.txt';
const execute = promisify(execFile);
async function git(...args: string[]): Promise<string> { return (await execute('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' })).stdout.trim(); }
async function commit(message: string): Promise<string> { await git('add', '-A'); await git('commit', '-qm', message); return git('rev-parse', 'HEAD'); }

before(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'gitviews-test-'));
  service = new GitService('git', root);
  await git('init', '-q', '--initial-branch=main'); await git('config', 'user.name', 'Test Author'); await git('config', 'user.email', 'test@example.com'); await git('config', 'core.autocrlf', 'false');
  writeFileSync(path.join(root, 'file.txt'), 'alpha\nbeta\n'); first = await commit('Initial commit\n\nBody with <script> & Markdown [link].');
  writeFileSync(path.join(root, 'file.txt'), 'alpha\nbeta changed\n');
  writeFileSync(path.join(root, unusual), '你好\n'); writeFileSync(path.join(root, 'image.bin'), Buffer.from([0, 1, 2, 3]));
  second = await commit('Add binary and Unicode files');
  renameSync(path.join(root, 'file.txt'), path.join(root, 'renamed.txt')); renamed = await commit('Rename tracked file');
  unlinkSync(path.join(root, unusual)); removed = await commit('Delete Unicode file');
  await git('checkout', '-qb', 'feature', second); writeFileSync(path.join(root, 'feature.txt'), 'feature\n'); await commit('Feature branch');
  await git('checkout', '-q', 'main'); await git('merge', '--no-ff', '-qm', 'Merge feature', 'feature'); merge = await git('rev-parse', 'HEAD');
  await git('tag', '-a', 'v0.1', '-m', 'Annotated tag', second);
});
after(() => rmSync(root, { recursive: true, force: true }));

test('history parses full messages, parents and authors', async () => {
  const commits = await service.history({ skip: 0, limit: 100 });
  assert.equal(commits.length, 6);
  assert.equal(commits[0].hash, merge);
  assert.equal(commits[0].parents.length, 2);
  assert.equal(commits.find(item => item.hash === first)?.message, 'Initial commit\n\nBody with <script> & Markdown [link].');
  assert.equal(commits[0].author, 'Test Author');
  // Every loaded child precedes each of its loaded parents.
  const indexes = new Map(commits.map((item, index) => [item.hash, index]));
  commits.forEach((item, index) => item.parents.forEach(parent => assert.ok(indexes.get(parent)! > index)));
});

test('history pages have no overlaps and filters search full history', async () => {
  const page1 = await service.history({ skip: 0, limit: 2 });
  const page2 = await service.history({ skip: 2, limit: 2 });
  assert.equal(new Set([...page1, ...page2].map(item => item.hash)).size, 4);
  const search = await service.history({ skip: 0, limit: 10, search: 'initial COMMIT' });
  assert.deepEqual(search.map(item => item.hash), [first]);
  assert.equal((await service.history({ skip: 0, limit: 10, author: 'missing-author' })).length, 0);
  assert.equal((await service.history({ skip: 0, limit: 10, ref: 'refs/heads/feature' })).length, 3);
});

test('refs peel annotated tags and include HEAD', async () => {
  const refs = await service.refs();
  assert.equal(refs.find(ref => ref.name === 'refs/tags/v0.1')?.hash, second);
  assert.equal(refs.find(ref => ref.name === 'HEAD')?.hash, merge);
});

test('hash resolution validates actual commit objects', async () => {
  assert.equal(await service.resolveCommit(first.slice(0, 8)), first);
  const blob = await git('rev-parse', `${first}:file.txt`);
  await assert.rejects(service.resolveCommit(blob));
  await assert.rejects(service.resolveCommit('--help'));
  await assert.rejects(service.resolveCommit('abcdefg'));
  await assert.rejects(service.resolveCommit('f'.repeat(40)));
});

test('root commit compares against empty content', async () => {
  const details = await service.details(first);
  assert.equal(details.parent, undefined);
  assert.equal(details.files.length, 1);
  assert.deepEqual(details.files[0], { status: 'A', oldPath: 'file.txt', path: 'file.txt', binary: false, additions: 2, deletions: 0 });
});

test('file changes preserve Unicode and tab names and identify binary data', async () => {
  const details = await service.details(second);
  assert.equal(details.files.find(file => file.path === unusual)?.additions, 1);
  assert.equal(details.files.find(file => file.path === 'image.bin')?.binary, true);
  assert.equal(details.files.find(file => file.path === 'file.txt')?.deletions, 1);
});

test('renames, deletions and endpoint comparisons use correct paths', async () => {
  const renamedFile = (await service.details(renamed)).files[0];
  assert.equal(renamedFile.status, 'R');
  assert.equal(renamedFile.oldPath, 'file.txt');
  assert.equal(renamedFile.path, 'renamed.txt');
  assert.equal((await service.details(removed)).files.find(file => file.path === unusual)?.status, 'D');
  const comparison = await service.changes(second, merge);
  assert.equal(comparison.find(file => file.path === 'renamed.txt')?.status, 'R');
  assert.ok(comparison.some(file => file.path === 'feature.txt'));
  assert.equal((await service.file(first, 'file.txt')).toString(), 'alpha\nbeta\n');
});

test('merge comparison allows each parent and rejects unrelated bases', async () => {
  const details = await service.details(merge);
  assert.deepEqual(details.files.map(file => file.path), ['feature.txt']);
  const other = await service.details(merge, details.commit.parents[1]);
  assert.ok(other.files.some(file => file.path === unusual));
  await assert.rejects(service.details(merge, first));
});

test('blame uses unsaved document contents and original rename paths', async () => {
  const lines = await service.blame('renamed.txt', 'inserted\nalpha\nbeta changed\n');
  assert.equal(lines.get(1)?.uncommitted, true);
  assert.equal(lines.get(2)?.hash, first);
  assert.equal(lines.get(2)?.originalLine, 1);
  assert.equal(lines.get(2)?.filename, 'file.txt');
  assert.equal(lines.get(3)?.hash, second);
  assert.equal(lines.get(3)?.author, 'Test Author');
});

test('blame decodes unusual filenames', { skip: process.platform === 'win32' ? 'Windows disallows quotes and control characters in filenames.' : false }, async () => {
  // This file still exists in feature, while it was deleted in main.
  const name = 'name\n"quote".txt';
  writeFileSync(path.join(root, name), 'content\n');
  await commit('Add unusual filename');
  const lines = await service.blame(name, 'content\n');
  assert.equal(lines.get(1)?.filename, name);
});

test('queries can be cancelled and reject files outside repository', async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(service.history({ skip: 0, limit: 100 }, abort.signal));
  assert.throws(() => service.relativePath(path.resolve(root, '..', 'outside.txt')));
  await assert.rejects(service.file(first, '../outside.txt'));
});

test('empty repository returns empty history and refs', async () => {
  const empty = mkdtempSync(path.join(os.tmpdir(), 'gitviews-empty-'));
  try {
    await execute('git', ['init', '-q'], { cwd: empty });
    const git = new GitService('git', empty);
    assert.deepEqual(await git.history({ skip: 0, limit: 200 }), []);
    assert.deepEqual(await git.refs(), []);
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

test('SHA-256 root commits work without a hard-coded empty tree hash', async () => {
  const sha256 = mkdtempSync(path.join(os.tmpdir(), 'gitviews-sha256-'));
  try {
    await execute('git', ['init', '-q', '--object-format=sha256'], { cwd: sha256 });
    const git = async (...args: string[]) => (await execute('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: sha256, encoding: 'utf8' })).stdout.trim();
    writeFileSync(path.join(sha256, 'file.txt'), 'hello\n'); await git('add', '.'); await git('commit', '-qm', 'Initial');
    const hash = await git('rev-parse', 'HEAD'); const service = new GitService('git', sha256);
    assert.equal(hash.length, 64);
    assert.equal(await service.resolveCommit(hash.slice(0, 10)), hash);
    assert.equal((await service.details(hash)).files[0].additions, 1);
    assert.equal((await service.blame('file.txt', 'hello\n')).get(1)?.hash, hash);
  } finally { rmSync(sha256, { recursive: true, force: true }); }
});
