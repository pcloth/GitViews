import * as vscode from 'vscode';
import type { BlameLine, Commit } from './core/types';
import { Repositories } from './repositories';
import { isChinese, t } from './i18n';

export class BlameController implements vscode.Disposable {
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('gitViews.blameForeground'), margin: '0 0 0 3em' },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly cache = new Map<string, Map<number, BlameLine>>();
  private readonly commits = new Map<string, Commit>();
  private timer?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;
  private generation = 0;
  private editor?: vscode.TextEditor;

  constructor(private readonly repositories: Repositories, private readonly context: vscode.ExtensionContext, private readonly output: vscode.OutputChannel) {
    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.schedule()),
      vscode.window.onDidChangeTextEditorSelection(event => { if (event.textEditor === vscode.window.activeTextEditor) this.schedule(); }),
      vscode.workspace.onDidChangeTextDocument(event => { if (event.document === vscode.window.activeTextEditor?.document) this.schedule(); }),
      vscode.workspace.onDidCloseTextDocument(document => { for (const key of this.cache.keys()) if (key.includes(document.uri.toString())) this.cache.delete(key); }),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('gitViews.blame') || event.affectsConfiguration('git.blame.editorDecoration.enabled')) {
          this.schedule(); void this.checkBuiltinConflict();
        }
      }),
      repositories.onDidChange(() => { this.cache.clear(); this.commits.clear(); this.schedule(); })
    );
    this.schedule(); void this.checkBuiltinConflict();
  }

  private schedule(): void {
    clearTimeout(this.timer); this.abort?.abort(); this.generation++;
    this.editor?.setDecorations(this.decoration, []);
    this.timer = setTimeout(() => { void this.update(); }, 200);
  }

  private async update(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !vscode.workspace.getConfiguration('gitViews', editor.document.uri).get<boolean>('blame.enabled', true)) return;
    const document = editor.document;
    const repository = this.repositories.forUri(document.uri);
    if (!repository || document.isUntitled || document.lineCount > 50_000) return;
    const text = document.getText();
    if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024 || text.includes('\0')) return;
    const abort = this.abort = new AbortController();
    const generation = this.generation;
    this.editor = editor;
    const key = `${repository.id}:${document.uri.toString()}:${document.version}`;
    try {
      let lines = this.cache.get(key);
      if (!lines) {
        lines = await repository.git.blame(document.uri.fsPath, text, abort.signal);
        if (generation !== this.generation || abort.signal.aborted) return;
        this.cache.set(key, lines);
        if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
      }
      const line = lines.get(editor.selection.active.line + 1);
      if (!line) return;
      const hover = new vscode.MarkdownString();
      hover.isTrusted = { enabledCommands: ['gitViews.revealCommit'] };
      let label: string;
      if (line.uncommitted) {
        label = t('Not committed yet', '尚未提交'); hover.appendText(label);
      } else {
        const values: Record<string, string> = { author: line.author, dateAgo: relativeDate(line.date), date: new Date(line.date).toLocaleString(), subject: line.subject, sha: line.hash.slice(0, 8) };
        const template = vscode.workspace.getConfiguration('gitViews', document.uri).get<string>('blame.template', '${author}, ${dateAgo} • ${subject}');
        label = template.replace(/\$\{(author|dateAgo|date|subject|sha)\}/g, (_, name: string) => values[name]).replace(/[\r\n\t]/g, ' ');
        this.render(editor, label, this.hover(line, repository.id, hover));
        const commitKey = `${repository.id}:${line.hash}`;
        let commit = this.commits.get(commitKey);
        if (!commit) {
          commit = await repository.git.commit(line.hash, abort.signal);
          if (generation !== this.generation || abort.signal.aborted) return;
          this.commits.set(commitKey, commit);
          if (this.commits.size > 30) this.commits.delete(this.commits.keys().next().value!);
        }
        const fullHover = this.hover(line, repository.id, new vscode.MarkdownString(), commit);
        fullHover.isTrusted = { enabledCommands: ['gitViews.revealCommit'] };
        this.render(editor, label, fullHover);
        return;
      }
      if (generation === this.generation && !abort.signal.aborted) this.render(editor, label, hover);
    } catch (error) {
      if (abort.signal.aborted) return;
      // Untracked files and unborn repositories have no historical blame.
      if (error instanceof Error && !/no such path|no such ref|not exist|bad revision|no commits|not a git repository/i.test(error.message)) this.output.appendLine(`Blame: ${error.message}`);
    }
  }

  private render(editor: vscode.TextEditor, label: string, hover: vscode.MarkdownString): void {
    const index = editor.selection.active.line;
    const text = editor.document.lineAt(index).text;
    editor.setDecorations(this.decoration, [{ range: new vscode.Range(index, 0, index, Math.max(1, text.length)), renderOptions: { after: { contentText: label.length > 180 ? `${label.slice(0, 177)}…` : label } }, hoverMessage: hover }]);
  }

  private hover(line: BlameLine, repositoryUri: string, hover: vscode.MarkdownString, commit?: Commit): vscode.MarkdownString {
    hover.appendText(`${line.author} <${line.email}>\n${new Date(line.date).toLocaleString()}\n${line.hash}`);
    hover.appendMarkdown('\n\n'); hover.appendText(commit?.message ?? line.subject);
    const reveal = encodeURIComponent(JSON.stringify([{ repositoryUri, commit: line.hash }]));
    const diff = encodeURIComponent(JSON.stringify([{ repositoryUri, commit: line.hash, filePath: line.filename, line: line.originalLine }]));
    hover.appendMarkdown(`\n\n[${t('View in Git Views', '在 Git Views 中查看')}](command:gitViews.revealCommit?${reveal}) · [${t('View file diff', '查看此文件差异')}](command:gitViews.revealCommit?${diff})`);
    return hover;
  }

  private async checkBuiltinConflict(): Promise<void> {
    if (this.context.globalState.get('blameConflictNotified')) return;
    const resource = vscode.window.activeTextEditor?.document.uri;
    if (!vscode.workspace.getConfiguration('gitViews', resource).get('blame.enabled') || !vscode.workspace.getConfiguration('git', resource).get('blame.editorDecoration.enabled')) return;
    await this.context.globalState.update('blameConflictNotified', true);
    const disable = t('Disable built-in inline blame', '关闭内置行内 blame');
    const choice = await vscode.window.showInformationMessage(t('Git Views and built-in Git both have inline blame enabled.', 'Git Views 和内置 Git 都启用了行内 blame。'), disable);
    if (choice === disable) {
      const config = vscode.workspace.getConfiguration('git', resource);
      const inspection = config.inspect<boolean>('blame.editorDecoration.enabled');
      const target = inspection?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder
        : inspection?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
      await config.update('blame.editorDecoration.enabled', false, target);
    }
  }

  dispose(): void { clearTimeout(this.timer); this.abort?.abort(); this.decoration.dispose(); this.subscriptions.forEach(item => item.dispose()); }
}

function relativeDate(date: string): string {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(isChinese ? 'zh-CN' : 'en', { numeric: 'auto' });
  for (const [size, unit] of [[31_536_000, 'year'], [2_592_000, 'month'], [86_400, 'day'], [3600, 'hour'], [60, 'minute']] as const) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(Math.round(seconds), 'second');
}
