import * as vscode from 'vscode';
import { Repositories, type Repository } from './repositories';
import type { FileChange } from './core/types';
import { t } from './i18n';

export class GitDocuments implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'git-views';
  constructor(private readonly repositories: Repositories) {}

  uri(repository: Repository, hash: string | undefined, filename: string): vscode.Uri {
    // A readable path keeps language detection and editor titles useful.
    return vscode.Uri.from({ scheme: GitDocuments.scheme, path: `/${filename}`, query: JSON.stringify({ repository: repository.id, hash: hash ?? '', filename }) });
  }

  async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
    const data: unknown = JSON.parse(uri.query);
    if (!data || typeof data !== 'object') throw new Error('Invalid Git document.');
    const { repository: id, hash, filename } = data as Record<string, unknown>;
    if (typeof id !== 'string' || typeof hash !== 'string' || typeof filename !== 'string') throw new Error('Invalid Git document.');
    if (!hash) return '';
    const repository = this.repositories.get(id);
    if (!repository) throw new Error(t('Repository is no longer open.', '仓库已关闭。'));
    const abort = new AbortController();
    const subscription = token.onCancellationRequested(() => abort.abort());
    if (token.isCancellationRequested) abort.abort();
    try { return (await repository.git.file(hash, filename, abort.signal)).toString('utf8'); }
    finally { subscription.dispose(); }
  }

  async openDiff(repository: Repository, base: string | undefined, target: string, file: FileChange, line?: number): Promise<void> {
    if (file.binary) { void vscode.window.showInformationMessage(t('Binary file: {0}', '二进制文件：{0}', file.path)); return; }
    const left = this.uri(repository, file.status === 'A' ? undefined : base, file.oldPath);
    const right = this.uri(repository, file.status === 'D' ? undefined : target, file.path);
    const title = `${file.path} (${base?.slice(0, 8) ?? '∅'} ↔ ${target.slice(0, 8)})`;
    await vscode.commands.executeCommand('vscode.diff', left, right, title, {
      preview: true,
      ...(line ? { selection: new vscode.Range(Math.max(0, line - 1), 0, Math.max(0, line - 1), 0) } : {})
    });
  }
}
