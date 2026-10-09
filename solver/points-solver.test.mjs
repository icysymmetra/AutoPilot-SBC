import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solvePointsChallenge } from './points-solver.js';

const player = (id, sbsScore, rating = 75, cost = null) => ({ id, sbsScore, rating, cost });
test('uses remaining EA score rather than rating or eleven-player size', () => {
  const result = solvePointsChallenge({ players: [player('a', 150, 60), player('b', 250, 65), player('c', 500, 80)], scoreRequirement: 1000, submittedScore: 600, selectionLimit: 30 });
  assert.equal(result.complete, true);
  assert.equal(result.selectedScore, 400);
  assert.deepEqual(result.selectedIds, ['a', 'b']);
});
test('minimizes estimated cost and uses each owned item once', () => {
  const result = solvePointsChallenge({ players: [player('a', 60, 75, 10), player('b', 40, 75, 10), player('c', 100, 75, 50), player('a', 60, 75, 10)], scoreRequirement: 100, selectionLimit: 3 });
  assert.deepEqual(result.selectedIds, ['a', 'b']);
  assert.equal(result.selectedScore, 100);
});
test('returns an honest partial batch under EA selection limit', () => {
  const result = solvePointsChallenge({ players: [player('a', 20), player('b', 40), player('c', 60)], scoreRequirement: 500, selectionLimit: 2 });
  assert.equal(result.complete, false);
  assert.equal(result.selectedScore, 100);
  assert.equal(result.selectedIds.length, 2);
  assert.equal(result.remainingAfterSelection, 400);
});
test('rejects invalid and concept item scores', () => {
  const result = solvePointsChallenge({ players: [player('zero', 0), player('bad', NaN), { ...player('concept', 100), isConcept: true }, player('owned', 40)], scoreRequirement: 40, selectionLimit: 30 });
  assert.deepEqual(result.selectedIds, ['owned']);
});
test('preserves manually selected item slots and score', () => {
  const result = solvePointsChallenge({ players: [player('a', 40), player('b', 60)], scoreRequirement: 200, submittedScore: 50, selectedScore: 90, selectionLimit: 1 });
  assert.equal(result.targetScore, 60);
  assert.deepEqual(result.selectedIds, ['b']);
});
test('never returns a batch for an invalid target or limit', () => {
  assert.equal(solvePointsChallenge({ players: [player('a', 100)], scoreRequirement: 0, selectionLimit: 30 }).ok, false);
  assert.equal(solvePointsChallenge({ players: [player('a', 100)], scoreRequirement: 100, selectionLimit: 0 }).selectedIds.length, 0);
});
