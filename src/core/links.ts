export interface HashMatch { hash: string; startIndex: number; length: number; }

export function findCommitHashes(line: string): HashMatch[] {
  const result: HashMatch[] = [];
  const pattern = /(?<![\w/])[0-9a-f]{7,64}(?![\w/])/gi;
  for (const match of line.matchAll(pattern)) {
    // Numeric identifiers are common in other command output; git hashes can still
    // be all digits, so validation belongs to the click handler, not this scan.
    result.push({ hash: match[0], startIndex: match.index!, length: match[0].length });
  }
  return result;
}
