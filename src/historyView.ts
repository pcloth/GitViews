import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { layoutGraph } from './core/graph';
import type { Commit, CommitDetails, GitRef } from './core/types';
import { GitDocuments } from './documents';
import { isChinese, t } from './i18n';
import { Repositories, type Repository } from './repositories';

export interface RevealCommitArgs { repositoryUri: string; commit: string; filePath?: string; line?: number; }
interface BrowseState { ref: string; search: string; author: string; commits: Commit[]; selected?: string; more: boolean; }
interface Comparison { base: string; target: string; }

export class HistoryView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private repositoryId?: string;
  private readonly states = new Map<string, BrowseState>();
  private readonly subscriptions: vscode.Disposable[] = [];
  private refs: GitRef[] = [];
  private details?: CommitDetails;
  private comparison?: Comparison;
  private comparisonBase?: string;
  private previous?: BrowseState;
  private contextHash?: string;
  private loading = false;
  private error = '';
  private historyAbort?: AbortController;
  private detailAbort?: AbortController;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private requestGeneration = 0;
  private detailGeneration = 0;
  private navigationGeneration = 0;

  constructor(private readonly extensionUri: vscode.Uri, private readonly repositories: Repositories, private readonly documents: GitDocuments, private readonly output: vscode.OutputChannel) {
    this.subscriptions.push(repositories.onDidChange(id => {
      if (id && id !== this.repositoryId) return;
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => {
        if (!this.view?.visible) return;
        void this.refresh();
      }, 350);
    }));
  }

  get repository(): Repository | undefined { return this.repositoryId ? this.repositories.get(this.repositoryId) : undefined; }
  private get state(): BrowseState {
    const id = this.repositoryId ?? '';
    let state = this.states.get(id);
    if (!state) { state = { ref: '', search: '', author: '', commits: [], more: false }; this.states.set(id, state); }
    return state;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] };
    view.webview.html = this.html(view.webview);
    this.subscriptions.push(view.webview.onDidReceiveMessage(message => {
      void this.handleMessage(message).catch(error => this.fail(error));
    }), view.onDidChangeVisibility(() => {
      if (view.visible) void this.refresh();
      else { this.historyAbort?.abort(); this.detailAbort?.abort(); }
    }), view.onDidDispose(() => { this.view = undefined; this.historyAbort?.abort(); this.detailAbort?.abort(); }));
  }

  async open(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.gitViews');
    await vscode.commands.executeCommand('gitViews.history.focus');
  }

  async refresh(): Promise<void> {
    if (!this.view?.visible) return;
    const current = this.repository;
    if (!current) {
      const active = vscode.window.activeTextEditor?.document.uri;
      this.changeRepository((active && this.repositories.forUri(active))?.id ?? this.repositories.all[0]?.id);
    }
    await this.load(false);
  }

  private changeRepository(id?: string): void {
    if (this.repositoryId === id) return;
    this.historyAbort?.abort(); this.detailAbort?.abort();
    this.requestGeneration++; this.detailGeneration++;
    this.repositoryId = id; this.refs = []; this.details = undefined; this.comparison = undefined;
    this.comparisonBase = undefined; this.previous = undefined; this.contextHash = undefined;
    this.loading = false; this.error = '';
  }

  async reveal(args: RevealCommitArgs): Promise<void> {
    const navigation = ++this.navigationGeneration;
    const repository = this.repositories.get(args.repositoryUri);
    if (!repository) throw new Error(t('Repository is no longer open.', '仓库已关闭。'));
    const hash = await repository.git.resolveCommit(args.commit);
    if (navigation !== this.navigationGeneration) return;
    await this.open();
    if (navigation !== this.navigationGeneration) return;
    this.changeRepository(repository.id);
    this.historyAbort?.abort(); this.requestGeneration++;
    this.loading = false;
    const found = this.state.commits.some(commit => commit.hash === hash);
    if (!found) {
      if (!this.previous) this.previous = { ...this.state, commits: [...this.state.commits] };
      this.contextHash = hash;
      this.state.ref = ''; this.state.search = ''; this.state.author = '';
      this.state.commits = [];
      await this.load(false);
    }
    if (navigation !== this.navigationGeneration) return;
    await this.select(hash);
    if (navigation !== this.navigationGeneration) return;
    if (args.filePath && this.details) {
      const file = this.details.files.find(item => item.path === args.filePath || item.oldPath === args.filePath);
      if (file) await this.documents.openDiff(repository, this.details.parent, hash, file, args.line);
    }
  }

  async compareFromCommand(): Promise<void> {
    await this.open();
    if (!this.repository) await this.refresh();
    const repository = this.repository;
    if (!repository) return;
    const base = await vscode.window.showInputBox({ prompt: t('Base commit hash', '比较起点提交 ID'), value: this.comparisonBase });
    if (!base) return;
    const target = await vscode.window.showInputBox({ prompt: t('Target commit hash', '比较目标提交 ID'), value: this.state.selected });
    if (!target) return;
    await this.compare(await repository.git.resolveCommit(base), await repository.git.resolveCommit(target));
  }

  private async load(append: boolean): Promise<void> {
    const repository = this.repository;
    if (!repository) { this.publish(); return; }
    this.historyAbort?.abort();
    const abort = this.historyAbort = new AbortController();
    const generation = ++this.requestGeneration;
    this.loading = true; this.error = ''; this.publish();
    const state = this.state;
    const pageSize = vscode.workspace.getConfiguration('gitViews').get<number>('history.pageSize', 200);
    const limit = append ? pageSize : Math.max(pageSize, state.commits.length);
    try {
      const [commits, refs] = await Promise.all([
        repository.git.history({ ref: this.contextHash ?? (state.ref || undefined), search: state.search, author: state.author, skip: append ? state.commits.length : 0, limit: limit + 1 }, abort.signal),
        repository.git.refs(abort.signal)
      ]);
      if (generation !== this.requestGeneration || abort.signal.aborted) return;
      state.more = commits.length > limit;
      state.commits = append ? [...state.commits, ...commits.slice(0, limit)] : commits.slice(0, limit);
      this.refs = refs;
      this.loading = false;
      this.publish();
      if (state.selected && !this.comparison) await this.select(state.selected, undefined, false);
    } catch (error) {
      if (generation === this.requestGeneration && !abort.signal.aborted) { this.loading = false; this.fail(error); }
    }
  }

  private async select(hash: string, parent?: string, reveal = true): Promise<void> {
    const repository = this.repository;
    if (!repository) return;
    this.detailAbort?.abort();
    const abort = this.detailAbort = new AbortController();
    const generation = ++this.detailGeneration;
    this.state.selected = hash;
    this.comparison = undefined; this.details = undefined;
    this.publish(reveal);
    try {
      const details = await repository.git.details(hash, parent, abort.signal);
      if (generation !== this.detailGeneration || abort.signal.aborted) return;
      this.details = details; this.publish(reveal);
    } catch (error) { if (!abort.signal.aborted) this.fail(error); }
  }

  private async compare(base: string, target: string): Promise<void> {
    const repository = this.repository;
    if (!repository) return;
    this.detailAbort?.abort();
    const abort = this.detailAbort = new AbortController();
    const generation = ++this.detailGeneration;
    try {
      const [commit, files] = await Promise.all([repository.git.commit(target, abort.signal), repository.git.changes(base, target, abort.signal)]);
      if (generation !== this.detailGeneration || abort.signal.aborted) return;
      this.comparison = { base, target }; this.details = { commit, parent: base, files };
      this.state.selected = target; this.publish(true);
    } catch (error) { if (!abort.signal.aborted) throw error; }
  }

  private async handleMessage(value: unknown): Promise<void> {
    if (!value || typeof value !== 'object') return;
    const message = value as Record<string, unknown>;
    const type = message.type;
    if (type === 'ready') { await this.refresh(); return; }
    if (type === 'repository' && typeof message.id === 'string' && this.repositories.get(message.id)) {
      this.changeRepository(message.id); await this.load(false); return;
    }
    if (type === 'refresh') { await this.refresh(); return; }
    if (type === 'filter' && typeof message.ref === 'string' && typeof message.search === 'string' && typeof message.author === 'string') {
      if (message.ref && !this.refs.some(ref => ref.name === message.ref && ref.name !== 'HEAD')) return;
      this.contextHash = undefined; this.previous = undefined;
      Object.assign(this.state, { ref: message.ref, search: message.search.slice(0, 1000), author: message.author.slice(0, 1000), commits: [], selected: undefined });
      this.details = undefined; this.comparison = undefined; await this.load(false); return;
    }
    if (type === 'more' && !this.loading && this.state.more) { await this.load(true); return; }
    if (type === 'back' && this.previous) {
      this.states.set(this.repositoryId!, this.previous); this.previous = undefined; this.contextHash = undefined;
      this.details = undefined; this.comparison = undefined; await this.load(false); return;
    }
    if (type === 'locate') { await vscode.commands.executeCommand('gitViews.revealCommit'); return; }
    if (type === 'select' && typeof message.hash === 'string' && this.state.commits.some(commit => commit.hash === message.hash)) {
      await this.select(message.hash); return;
    }
    if (type === 'parent' && typeof message.hash === 'string' && this.details?.commit.parents.includes(message.hash)) {
      await this.select(this.details.commit.hash, message.hash); return;
    }
    if (type === 'copy' && this.details) { await vscode.env.clipboard.writeText(this.details.commit.hash); return; }
    if (type === 'setBase' && this.state.selected) { this.comparisonBase = this.state.selected; this.publish(); return; }
    if (type === 'compare' && this.comparisonBase && this.state.selected) { await this.compare(this.comparisonBase, this.state.selected); return; }
    if (type === 'file' && Number.isInteger(message.index) && this.details && this.repository) {
      const file = this.details.files[message.index as number];
      if (file) await this.documents.openDiff(this.repository, this.details.parent, this.details.commit.hash, file);
    }
  }

  private publish(reveal = false): void {
    if (!this.view?.visible) return;
    const state = this.state;
    void this.view.webview.postMessage({
      type: 'state', repositories: this.repositories.all.map(repository => ({ id: repository.id, name: repository.name, path: repository.uri.fsPath })),
      repositoryId: this.repositoryId, ...state, refs: this.refs, graph: layoutGraph(state.commits, !!state.search || !!state.author), details: this.details,
      loading: this.loading, error: this.error, contextHash: this.contextHash, comparison: this.comparison, comparisonBase: this.comparisonBase, reveal
    });
  }

  private fail(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
    this.output.appendLine(this.error);
    this.publish();
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('hex');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'));
    return `<!doctype html><html lang="${isChinese ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${style}"></head><body><div id="app"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
  }

  dispose(): void {
    clearTimeout(this.refreshTimer); this.historyAbort?.abort(); this.detailAbort?.abort(); this.subscriptions.forEach(item => item.dispose());
  }
}
