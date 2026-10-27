import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph } from '../src/core/graph';

test('linear history stays in one lane', () => {
  const graph = layoutGraph([{ hash: 'a', parents: ['b'] }, { hash: 'b', parents: ['c'] }, { hash: 'c', parents: [] }]);
  assert.deepEqual(graph.map(row => row.column), [0, 0, 0]);
  assert.deepEqual(graph.map(row => row.width), [1, 1, 1]);
  assert.equal(graph[2].edges.length, 0);
});

test('merge opens lanes and converges at shared ancestor', () => {
  const graph = layoutGraph([{ hash: 'm', parents: ['a', 'b'] }, { hash: 'a', parents: ['r'] }, { hash: 'b', parents: ['r'] }, { hash: 'r', parents: [] }]);
  assert.equal(graph[0].edges.length, 2);
  assert.deepEqual(graph.map(row => row.column), [0, 0, 1, 0]);
  assert.ok(graph.every(row => row.edges.every(edge => edge.from >= 0 && edge.to >= 0 && edge.to < row.width)));
  assert.equal(graph[3].width, 1);
});

test('layout is stable across pagination and handles disconnected histories', () => {
  const commits = [{ hash: 'a', parents: ['b', 'c'] }, { hash: 'b', parents: ['d'] }, { hash: 'c', parents: ['d'] }, { hash: 'd', parents: [] }, { hash: 'x', parents: [] }];
  assert.deepEqual(layoutGraph(commits).slice(0, 2), layoutGraph(commits.slice(0, 2)));
  assert.equal(layoutGraph(commits)[4].column, 0);
  assert.deepEqual(layoutGraph([]), []);
});

test('filtered results omit hidden edges without accumulating phantom lanes', () => {
  const graph = layoutGraph([
    { hash: 'a', parents: ['hidden-1'] },
    { hash: 'b', parents: ['c'] },
    { hash: 'c', parents: ['hidden-2'] }
  ], true);
  assert.deepEqual(graph.map(row => row.width), [1, 1, 1]);
  assert.deepEqual(graph.map(row => row.edges.length), [0, 1, 0]);
});
