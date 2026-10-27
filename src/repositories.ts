import * as vscode from 'vscode';
import * as path from 'node:path';
import { GitService } from './core/git';

interface GitRepository {
  rootUri: vscode.Uri;
  state: { onDidChange: vscode.Event<void> };
}
export interface GitAPI {
  git: { path: string };
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
  onDidCloseRepository: vscode.Event<GitRepository>;
}
export interface Repository { id: string; uri: vscode.Uri; name: string; git: GitService; }

export class Repositories implements vscode.Disposable {
  private readonly items = new Map<string, Repository>();
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly watchers = new Map<string, vscode.Disposable>();
  private readonly changes = new vscode.EventEmitter<string | undefined>();
  readonly onDidChange = this.changes.event;

  constructor(api: GitAPI) {
    const add = (repository: GitRepository) => {
      const id = repository.rootUri.toString();
      this.items.set(id, { id, uri: repository.rootUri, name: path.basename(repository.rootUri.fsPath), git: new GitService(api.git.path, repository.rootUri.fsPath) });
      this.watchers.get(id)?.dispose();
      this.watchers.set(id, repository.state.onDidChange(() => this.changes.fire(id)));
      this.changes.fire(undefined);
    };
    for (const repository of api.repositories) add(repository);
    this.subscriptions.push(api.onDidOpenRepository(add), api.onDidCloseRepository(repository => {
      const id = repository.rootUri.toString();
      this.items.delete(id); this.watchers.get(id)?.dispose(); this.watchers.delete(id);
      this.changes.fire(undefined);
    }));
  }

  get all(): Repository[] { return [...this.items.values()]; }
  get(id: string): Repository | undefined { return this.items.get(id); }
  forUri(uri: vscode.Uri): Repository | undefined {
    return this.all.filter(repository => {
      if (uri.scheme !== repository.uri.scheme || uri.authority !== repository.uri.authority) return false;
      const relative = path.relative(repository.uri.fsPath, uri.fsPath);
      return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    }).sort((a, b) => b.uri.fsPath.length - a.uri.fsPath.length)[0];
  }
  dispose(): void {
    this.subscriptions.forEach(item => item.dispose()); this.watchers.forEach(item => item.dispose()); this.changes.dispose();
  }
}
