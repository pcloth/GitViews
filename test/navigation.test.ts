import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type * as VSCode from 'vscode';
import { Repositories, type GitAPI } from '../src/repositories';
import { HistoryView, type RevealCommitArgs } from '../src/historyView';
import { commandUri } from '../src/core/commandUri';
import { GitDocuments } from '../src/documents';
import { TerminalCommits } from '../src/terminal';
import { calls, createView, EventEmitter, inputs, Uri, warnings } from './vscodeMock';

let root: string;
let hashes: string[];
let repositories: Repositories;
let history: HistoryView;
let documents: GitDocuments;
let view: ReturnType<typeof createView>;
let id: string;
const logs: string[] = [];
before(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'gitviews-nav-中文 space %25 ()-'));
  const execute = promisify(execFile);
  const git = async (...args: string[]) => (await execute('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' })).stdout.trim();
  await git('init', '-q', '--initial-branch=main');
  hashes = [];
  for (let i = 0; i < 25; i++) { writeFileSync(path.join(root, 'file.txt'), `line ${i}\n`); await git('add', '.'); await git('commit', '-qm', `Commit ${i}`); hashes.push(await git('rev-parse', 'HEAD')); }
  const api = {
    git: { path: 'git' }, repositories: [{ rootUri: Uri.file(root), state: { onDidChange: new EventEmitter<void>().event } }],
    onDidOpenRepository: new EventEmitter<unknown>().event, onDidCloseRepository: new EventEmitter<unknown>().event
  } as unknown as GitAPI;
  repositories = new Repositories(api); id = repositories.all[0].id;
  documents = new GitDocuments(repositories);
  history = new HistoryView(Uri.file(root) as unknown as VSCode.Uri, repositories, documents, { appendLine: (line: string) => { logs.push(line); } } as VSCode.OutputChannel);
  view = createView(); history.resolveWebviewView(view as unknown as VSCode.WebviewView);
});
after(() => { history?.dispose(); repositories?.dispose(); if (root) rmSync(root, { recursive: true, force: true }); });

test('jumping beyond the loaded page reveals target details without opening a diff', async () => {
  await history.refresh();
  assert.equal(view.messages.at(-1)?.commits.length, 20);
  calls.length = 0;
  await revealFromLink({ repositoryUri: id, commit: hashes[0].slice(0, 8) });
  const message = view.messages.at(-1)!;
  assert.equal(message.selected, hashes[0]);
  assert.equal(message.contextHash, hashes[0]);
  assert.equal(message.commits[0].hash, hashes[0]);
  assert.equal(message.details?.files[0].path, 'file.txt');
  assert.equal(calls.filter(call => call.id === 'vscode.diff').length, 0);
});

test('returning from context restores history and later jumps can open a file diff', async () => {
  view.received.fire({ type: 'back' });
  await until(() => !view.messages.at(-1)?.loading && view.messages.at(-1)?.commits.length === 20);
  assert.equal(view.messages.at(-1)?.contextHash, undefined);
  calls.length = 0;
  await revealFromLink({ repositoryUri: id, commit: hashes[24], filePath: 'file.txt', line: 1 });
  const diff = calls.find(call => call.id === 'vscode.diff');
  assert.ok(diff);
  const [left, right] = diff.args as [Uri, Uri];
  assert.equal(JSON.parse(left.query).hash, hashes[23]);
  assert.equal(JSON.parse(right.query).hash, hashes[24]);
  assert.equal(view.messages.at(-1)?.loading, false);
});

test('comparison command uses two endpoint snapshots', async () => {
  inputs.push(hashes[0], hashes[24]);
  await history.compareFromCommand();
  const message = view.messages.at(-1)!;
  assert.deepEqual(message.comparison, { base: hashes[0], target: hashes[24] });
  assert.equal(message.details?.files.length, 1);
});

test('virtual documents read historic content and use empty sides for root additions', async () => {
  const repository = repositories.get(id)!;
  const token = { isCancellationRequested: false, onCancellationRequested: new EventEmitter<void>().event } as VSCode.CancellationToken;
  const uri = documents.uri(repository, hashes[0], 'file.txt');
  assert.equal(await documents.provideTextDocumentContent(uri, token), 'line 0\n');
  assert.equal(await documents.provideTextDocumentContent(documents.uri(repository, undefined, 'file.txt'), token), '');
  await assert.rejects(history.reveal({ repositoryUri: id, commit: 'ffffffff' }));
});

test('terminal links validate commits, reveal details and report invalid hashes', async () => {
  const provider = new TerminalCommits(repositories, history);
  const terminal = { shellIntegration: { cwd: Uri.file(root) } } as unknown as VSCode.Terminal;
  const links = provider.provideTerminalLinks({ line: `${hashes[8].slice(0, 8)} Commit 8`, terminal });
  calls.length = 0;
  await provider.handleTerminalLink(links[0]);
  assert.equal(view.messages.at(-1)?.selected, hashes[8]);
  assert.equal(calls.some(call => call.id === 'vscode.diff'), false);
  warnings.length = 0;
  const invalid = provider.provideTerminalLinks({ line: 'ffffffff invalid', terminal });
  await provider.handleTerminalLink(invalid[0]);
  assert.match(warnings[0], /not found|ambiguous/);
});

test('a newer navigation wins when commit lookups finish out of order', async () => {
  const repository = repositories.get(id)!;
  const resolve = repository.git.resolveCommit.bind(repository.git);
  repository.git.resolveCommit = async candidate => {
    if (candidate === hashes[0]) await new Promise(done => setTimeout(done, 30));
    return resolve(candidate);
  };
  try {
    await Promise.all([
      history.reveal({ repositoryUri: id, commit: hashes[0] }),
      history.reveal({ repositoryUri: id, commit: hashes[24] })
    ]);
    assert.equal(view.messages.at(-1)?.selected, hashes[24]);
    assert.equal(view.messages.at(-1)?.details?.commit.hash, hashes[24]);
  } finally { repository.git.resolveCommit = resolve; }
});

async function revealFromLink(args: RevealCommitArgs): Promise<void> {
  const link = commandUri('gitViews.revealCommit', [args]);
  const query = decodeURIComponent(link.slice(link.indexOf('?') + 1));
  const [decoded] = JSON.parse(decodeURIComponent(query)) as RevealCommitArgs[];
  await history.reveal(decoded);
}

async function until(predicate: () => boolean): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 5000) throw new Error(`Timed out. ${logs.join('\n')}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
