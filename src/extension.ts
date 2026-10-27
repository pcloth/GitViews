import * as vscode from 'vscode';
import { BlameController } from './blame';
import { GitDocuments } from './documents';
import { HASH_PATTERN } from './core/git';
import { HistoryView, type RevealCommitArgs } from './historyView';
import { Repositories, type GitAPI } from './repositories';
import { TerminalCommits } from './terminal';
import { t } from './i18n';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Git Views');
  context.subscriptions.push(output);
  const report = (error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    output.appendLine(text); void vscode.window.showErrorMessage(`Git Views: ${text}`);
  };
  try {
    const gitExtension = vscode.extensions.getExtension<{ getAPI(version: 1): GitAPI }>('vscode.git');
    if (!gitExtension) throw new Error(t('Enable the built-in Git extension to use Git Views.', '请启用内置 Git 扩展后使用 Git Views。'));
    const exports = await gitExtension.activate();
    const repositories = new Repositories(exports.getAPI(1));
    const documents = new GitDocuments(repositories);
    const history = new HistoryView(context.extensionUri, repositories, documents, output);
    context.subscriptions.push(repositories, history,
      vscode.workspace.registerTextDocumentContentProvider(GitDocuments.scheme, documents),
      vscode.window.registerWebviewViewProvider('gitViews.history', history),
      vscode.window.registerTerminalLinkProvider(new TerminalCommits(repositories, history)),
      new BlameController(repositories, context, output)
    );
    const register = (id: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      context.subscriptions.push(vscode.commands.registerCommand(id, (...args: unknown[]) => handler(...args).catch(report)));
    };
    register('gitViews.open', () => history.open());
    register('gitViews.refresh', () => history.refresh());
    register('gitViews.compare', () => history.compareFromCommand());
    register('gitViews.toggleBlame', async () => {
      const config = vscode.workspace.getConfiguration('gitViews', vscode.window.activeTextEditor?.document.uri);
      const inspected = config.inspect<boolean>('blame.enabled');
      const target = inspected?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder
        : inspected?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
      await config.update('blame.enabled', !config.get<boolean>('blame.enabled', true), target);
    });
    register('gitViews.revealCommit', async (value?: unknown) => {
      if (value !== undefined) {
        if (!isRevealArgs(value)) throw new Error(t('Invalid commit navigation arguments.', '提交跳转参数无效。'));
        await history.reveal(value); return;
      }
      let repository = history.repository ?? (vscode.window.activeTextEditor && repositories.forUri(vscode.window.activeTextEditor.document.uri)) ?? repositories.all[0];
      if (repositories.all.length > 1) {
        const pick = await vscode.window.showQuickPick(repositories.all.map(item => ({ label: item.name, description: item.uri.fsPath, repository: item })), { placeHolder: t('Select repository', '选择仓库') });
        if (!pick) return;
        repository = pick.repository;
      }
      if (!repository) { await history.open(); return; }
      const commit = await vscode.window.showInputBox({ prompt: t('Enter a commit hash', '输入提交 ID'), validateInput: text => HASH_PATTERN.test(text.trim()) ? undefined : t('Use 7–64 hexadecimal characters.', '请输入 7–64 位十六进制提交 ID。') });
      if (commit) await history.reveal({ repositoryUri: repository.id, commit: commit.trim() });
    });
  } catch (error) { report(error); }
}

function isRevealArgs(value: unknown): value is RevealCommitArgs {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return typeof data.repositoryUri === 'string' && typeof data.commit === 'string' && HASH_PATTERN.test(data.commit)
    && (data.filePath === undefined || typeof data.filePath === 'string')
    && (data.line === undefined || (typeof data.line === 'number' && Number.isInteger(data.line) && data.line > 0));
}
