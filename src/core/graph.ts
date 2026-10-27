import type { Commit, GraphRow } from './types';

/** Deterministic lanes across the entire loaded page set, including merge edges. */
export function layoutGraph(commits: Pick<Commit, 'hash' | 'parents'>[], filtered = false): GraphRow[] {
  const visible = filtered ? new Set(commits.map(commit => commit.hash)) : undefined;
  let lanes: string[] = [];
  return commits.map(commit => {
    // Search results can omit intermediate ancestors. Do not leave permanent
    // lanes for hidden parents, or imply connections that Git did not report.
    const parents = visible ? commit.parents.filter(parent => visible.has(parent)) : commit.parents;
    const incoming = lanes.map((_, index) => index);
    let column = lanes.indexOf(commit.hash);
    if (column < 0) { column = lanes.length; lanes.push(commit.hash); }
    const before = [...lanes];
    const next = lanes.filter(hash => hash !== commit.hash);
    let insertion = Math.min(column, next.length);
    for (const parent of parents) {
      if (!next.includes(parent)) next.splice(insertion++, 0, parent);
    }
    const edges = before.flatMap((hash, from) => {
      if (hash === commit.hash) return parents.map(parent => ({ from, to: next.indexOf(parent), color: from }));
      return [{ from, to: next.indexOf(hash), color: from }];
    });
    lanes = next;
    return { hash: commit.hash, column, width: Math.max(before.length, next.length, 1), incoming, edges };
  });
}
