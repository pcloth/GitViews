import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCommitHashes } from '../src/core/links';

test('finds hashes in regular, one-line, graph and merge output', () => {
  for (const line of ['commit abc1234def56789', 'abc1234 Fix bug', '* | abc1234 (HEAD -> main) Fix bug', 'Merge: abc1234 def5678']) {
    const hashes = findCommitHashes(line);
    assert.equal(hashes[0].hash.startsWith('abc1234'), true);
    hashes.forEach(hash => assert.equal(line.slice(hash.startIndex, hash.startIndex + hash.length), hash.hash));
  }
  assert.equal(findCommitHashes('Merge: abc1234 def5678').length, 2);
});

test('supports uppercase, SHA-256 and exact offsets after Unicode', () => {
  assert.equal(findCommitHashes('提交 ABC1234 message')[0].startIndex, 3);
  assert.equal(findCommitHashes('a'.repeat(64))[0].length, 64);
});

test('does not split larger tokens, paths or non-hash text', () => {
  for (const line of ['abc123', 'gabc1234', '_abc1234', '/abc1234/file', 'a'.repeat(65), 'no commits here']) assert.deepEqual(findCommitHashes(line), []);
});
