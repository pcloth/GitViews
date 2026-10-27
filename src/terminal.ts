import * as vscode from 'vscode';
import { findCommitHashes } from './core/links';
import { Repositories, type Repository } from './repositories';
import { HistoryView } from './historyView';
import { t } from './i18n';

interface CommitLink extends vscode.TerminalLink { hash: string; terminal: vscode.Terminal; }

export class TerminalCommits implements vscode.TerminalLinkProvider<CommitLink> {
  constructor(private readonly repositories: Repositories, private readonly history: HistoryView) {}

  provideTerminalLinks(context: vscode.TerminalLinkContext): CommitLink[] {
    if (!vscode.workspace.getConfiguration('gitViews').get<boolean>('terminalLinks.enabled', true)) return [];
    return findCommitHashes(context.line).map(match => ({ ...match, terminal: context.terminal, tooltip: t('View commit in Git Views', '在 Git Views 中查看提交') }));
  }

  async handleTerminalLink(link: CommitLink): Promise<void> {
    try {
      const cwd = link.terminal.shellIntegration?.cwd;
      const initialCwd = (link.terminal.creationOptions as vscode.TerminalOptions | undefined)?.cwd;
      const uri = cwd ?? (typeof initialCwd === 'string' ? vscode.Uri.file(initialCwd) : initialCwd);
      const preferred = uri ? this.repositories.forUri(uri) : undefined;
      if (preferred) {
        try {
          const hash = await preferred.git.resolveCommit(link.hash);
          await this.history.reveal({ repositoryUri: preferred.id, commit: hash }); return;
        } catch { /* The terminal may now be in a different repository from this old output. */ }
      }
      const matches = await Promise.all(this.repositories.all.map(async repository => {
        try { return { repository, hash: await repository.git.resolveCommit(link.hash) }; }
        catch { return undefined; }
      }));
      const candidates = matches.filter((match): match is { repository: Repository; hash: string } => !!match);
      if (!candidates.length) throw new Error(t('Commit {0} was not found or is ambiguous in open repositories. Try a longer hash.', '在已打开的仓库中找不到提交 {0}，或缩写存在歧义。请使用更长的 ID。', link.hash));
      let candidate = candidates[0];
      if (candidates.length > 1) {
        const pick = await vscode.window.showQuickPick(candidates.map(match => ({ label: match.repository.name, description: match.repository.uri.fsPath, match })), { placeHolder: t('Select repository for {0}', '选择提交 {0} 所属仓库', link.hash) });
        if (!pick) return;
        candidate = pick.match;
      }
      await this.history.reveal({ repositoryUri: candidate.repository.id, commit: candidate.hash });
    } catch (error) { void vscode.window.showWarningMessage(error instanceof Error ? error.message : String(error)); }
  }
}
