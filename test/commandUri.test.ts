import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandUri } from '../src/core/commandUri';

// URI.parse decodes the query; CommandOpener then tries decodeURIComponent
// before parsing JSON, with a fallback to the query when decoding fails.
function commandArgs<T>(link: string): T {
  const query = decodeURIComponent(link.slice(link.indexOf('?') + 1));
  try { return JSON.parse(decodeURIComponent(query)) as T; }
  catch { return JSON.parse(query) as T; }
}

test('hover command arguments survive URI parsing and command-opener decoding', () => {
  for (const repositoryUri of [
    'file:///d%3A/codes/tools/gitViews',
    'file:///tmp/%E4%B8%AD%E6%96%87%20repo',
    'file:///tmp/percent%2520repo',
    'vscode-remote://wsl%2Bubuntu/home/user/repo'
  ]) {
    for (const filePath of [undefined, 'src/file (copy).ts', '中文/%20%25.ts', 'literal%file.ts']) {
      const args = [{ repositoryUri, commit: 'abcdef12', ...(filePath ? { filePath, line: 3 } : {}) }];
      const link = commandUri('gitViews.revealCommit', args);
      assert.deepEqual(commandArgs(link), args);
      assert.equal(/[()]/.test(link), false, 'link destinations must not contain Markdown parentheses');
    }
  }
});
