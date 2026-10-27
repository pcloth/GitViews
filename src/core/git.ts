import { spawn } from 'node:child_process';
import * as path from 'node:path';
import type { BlameLine, Commit, CommitDetails, FileChange, GitRef, HistoryQuery } from './types';

const COMMIT_FORMAT = '%H%x00%P%x00%an%x00%ae%x00%aI%x00%cI%x00%B%x00';
export const HASH_PATTERN = /^[0-9a-f]{7,64}$/i;

export class GitError extends Error {
  constructor(public readonly args: readonly string[], public readonly stderr: string) {
    super(stderr.trim() || `Git failed: ${args[0]}`);
    this.name = 'GitError';
  }
}

export class GitService {
  constructor(public readonly executable: string, public readonly root: string) {}

  run(args: string[], input?: string, signal?: AbortSignal): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, ['--no-pager', '--no-optional-locks', '-c', 'color.ui=false', '-c', 'core.quotepath=false', ...args], {
        cwd: this.root, windowsHide: true, shell: false, signal,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', LC_ALL: 'C' }
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let size = 0;
      let limitError: Error | undefined;
      const timer = setTimeout(() => { limitError = new Error('Git query timed out (30s).'); child.kill(); }, 30_000);
      child.stdout.on('data', (data: Buffer) => {
        size += data.length;
        if (size > 32 * 1024 * 1024) { limitError = new Error('Git output exceeds 32 MiB. Narrow the query.'); child.kill(); }
        else stdout.push(data);
      });
      child.stderr.on('data', (data: Buffer) => { if (stderr.length < 100) stderr.push(data); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => {
        clearTimeout(timer);
        if (limitError) reject(limitError);
        else if (code !== 0) reject(new GitError(args, Buffer.concat(stderr).toString('utf8')));
        else resolve(Buffer.concat(stdout));
      });
      child.stdin.on('error', () => { /* An early git exit can close stdin before input finishes. */ });
      child.stdin.end(input);
    });
  }

  async resolveCommit(candidate: string): Promise<string> {
    if (!HASH_PATTERN.test(candidate)) throw new Error('Use a commit hash of 7–64 hexadecimal characters.');
    const hash = (await this.run(['rev-parse', '--verify', '--end-of-options', `${candidate}^{commit}`])).toString().trim();
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(hash)) throw new Error('Invalid commit object.');
    return hash;
  }

  async history(query: HistoryQuery, signal?: AbortSignal): Promise<Commit[]> {
    const args = ['log', '--topo-order', `--format=${COMMIT_FORMAT}`, `--skip=${query.skip}`, `--max-count=${query.limit}`];
    if (query.search) args.push('--fixed-strings', '--regexp-ignore-case', `--grep=${query.search}`);
    if (query.author) args.push('--fixed-strings', '--regexp-ignore-case', `--author=${query.author}`);
    if (query.ref) { this.assertRevision(query.ref); args.push(query.ref); }
    else args.push('--all');
    args.push('--');
    return parseCommits((await this.run(args, undefined, signal)).toString('utf8'));
  }

  async refs(signal?: AbortSignal): Promise<GitRef[]> {
    const raw = (await this.run(['for-each-ref', '--format=%(objectname)%00%(*objectname)%00%(refname)%00', 'refs/heads', 'refs/remotes', 'refs/tags'], undefined, signal)).toString('utf8').split('\0');
    const refs: GitRef[] = [];
    for (let i = 0; i + 2 < raw.length; i += 3) {
      refs.push({ hash: raw[i + 1] || raw[i].trim(), name: raw[i + 2] });
    }
    try {
      const head = (await this.run(['rev-parse', '--verify', 'HEAD'], undefined, signal)).toString().trim();
      refs.push({ name: 'HEAD', hash: head });
    } catch (error) { if (signal?.aborted) throw error; /* Unborn repository. */ }
    return refs;
  }

  async commit(hash: string, signal?: AbortSignal): Promise<Commit> {
    this.assertRevision(hash);
    const commits = parseCommits((await this.run(['show', '--no-patch', `--format=${COMMIT_FORMAT}`, hash, '--'], undefined, signal)).toString('utf8'));
    if (!commits[0]) throw new Error('Commit not found.');
    return commits[0];
  }

  async details(hash: string, parent?: string, signal?: AbortSignal): Promise<CommitDetails> {
    const commit = await this.commit(hash, signal);
    const base = parent ?? commit.parents[0];
    if (base && !commit.parents.includes(base)) throw new Error('Invalid parent commit.');
    return { commit, parent: base, files: await this.changes(base, hash, signal) };
  }

  async changes(base: string | undefined, target: string, signal?: AbortSignal): Promise<FileChange[]> {
    this.assertRevision(target);
    if (base) this.assertRevision(base);
    // diff-tree --root supports root commits without assuming a SHA-1 empty tree ID.
    const common = base ? ['diff', base, target] : ['diff-tree', '--root', '--no-commit-id', '-r', target];
    const [names, stats] = await Promise.all([
      this.run([...common, '--name-status', '-z', '-M', '--no-ext-diff', '--no-textconv', '--'], undefined, signal),
      this.run([...common, '--numstat', '-z', '-M', '--no-ext-diff', '--no-textconv', '--'], undefined, signal)
    ]);
    return parseChanges(names.toString('utf8'), stats.toString('utf8'));
  }

  async file(hash: string, filename: string, signal?: AbortSignal): Promise<Buffer> {
    this.assertRevision(hash);
    this.relativePath(filename);
    return this.run(['show', `${hash}:${filename}`], undefined, signal);
  }

  async blame(filename: string, contents: string, signal?: AbortSignal): Promise<Map<number, BlameLine>> {
    const relative = this.relativePath(filename);
    const raw = await this.run(['blame', '--line-porcelain', '--contents', '-', '--', relative], contents, signal);
    return parseBlame(raw.toString('utf8'));
  }

  relativePath(filename: string): string {
    const relative = path.isAbsolute(filename) ? path.relative(this.root, filename) : filename;
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || relative.includes('\0')) {
      throw new Error('File is outside this repository.');
    }
    return relative.split(path.sep).join('/');
  }

  private assertRevision(revision: string): void {
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64}|refs\/[^\s\x00]+)$/.test(revision)) throw new Error('Invalid revision.');
  }
}

export function parseCommits(raw: string): Commit[] {
  const fields = raw.split('\0');
  const commits: Commit[] = [];
  for (let i = 0; i + 6 < fields.length; i += 7) {
    const message = fields[i + 6].replace(/\n$/, '');
    commits.push({ hash: fields[i].trim(), parents: fields[i + 1].split(' ').filter(Boolean), author: fields[i + 2], email: fields[i + 3], authorDate: fields[i + 4], commitDate: fields[i + 5], message, subject: message.split(/\r?\n/)[0] });
  }
  return commits;
}

export function parseChanges(namesRaw: string, statsRaw: string): FileChange[] {
  const fields = namesRaw.split('\0');
  const changes: FileChange[] = [];
  for (let i = 0; i < fields.length && fields[i];) {
    const status = fields[i++];
    const oldPath = fields[i++];
    const filename = /^[RC]/.test(status) ? fields[i++] : oldPath;
    changes.push({ status: status[0], oldPath, path: filename, binary: false, additions: 0, deletions: 0 });
  }
  const stats = statsRaw.split('\0');
  const byPath = new Map(changes.map(change => [change.path, change]));
  for (let i = 0; i < stats.length && stats[i];) {
    const entry = stats[i++];
    const match = /^([^\t]+)\t([^\t]+)\t([\s\S]*)$/.exec(entry);
    if (!match) continue;
    let filename = match[3];
    if (filename === '') { i++; filename = stats[i++]; }
    const change = byPath.get(filename);
    if (change) {
      change.binary = match[1] === '-' || match[2] === '-';
      change.additions = Number(match[1]) || 0;
      change.deletions = Number(match[2]) || 0;
    }
  }
  return changes;
}

export function parseBlame(raw: string): Map<number, BlameLine> {
  const result = new Map<number, BlameLine>();
  let current: Partial<BlameLine> | undefined;
  for (const line of raw.split('\n')) {
    const header = /^([0-9a-f]{40}|[0-9a-f]{64}) (\d+) (\d+)(?: \d+)?$/.exec(line);
    if (header) {
      current = { hash: header[1], originalLine: Number(header[2]), finalLine: Number(header[3]), uncommitted: /^0+$/.test(header[1]) };
    } else if (current) {
      if (line.startsWith('author ')) current.author = line.slice(7);
      else if (line.startsWith('author-mail ')) current.email = line.slice(12).replace(/^<|>$/g, '');
      else if (line.startsWith('author-time ')) current.date = new Date(Number(line.slice(12)) * 1000).toISOString();
      else if (line.startsWith('summary ')) current.subject = line.slice(8);
      else if (line.startsWith('filename ')) current.filename = decodeGitPath(line.slice(9));
      else if (line.startsWith('\t')) { result.set(current.finalLine!, current as BlameLine); current = undefined; }
    }
  }
  return result;
}

function decodeGitPath(value: string): string {
  if (!value.startsWith('"')) return value;
  // Git uses C-style quoting and octal UTF-8 bytes for unusual filenames.
  const bytes: number[] = [];
  const text = value.slice(1, -1);
  for (let i = 0; i < text.length;) {
    if (text[i] !== '\\') {
      const point = text.codePointAt(i)!;
      bytes.push(...Buffer.from(String.fromCodePoint(point))); i += point > 0xffff ? 2 : 1;
    } else {
      const octal = /^\\([0-7]{1,3})/.exec(text.slice(i));
      if (octal) { bytes.push(parseInt(octal[1], 8)); i += octal[0].length; }
      else { const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"' }; bytes.push(...Buffer.from(escapes[text[i + 1]] ?? text[i + 1])); i += 2; }
    }
  }
  return Buffer.from(bytes).toString('utf8');
}
