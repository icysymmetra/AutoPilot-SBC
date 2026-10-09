import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveSquad } from '../solver/solver.js';
test('new attribute requirements cannot be silently skipped by the squad solver', () => {
  assert.throws(() => solveSquad({ players: [{ id: 1, rating: 80 }], requirementsNormalized: [
    { key: 41, keyName: 'PLAYER_ATTRIBUTE', value: 80 },
  ] }), /Unsupported SBC requirements: PLAYER_ATTRIBUTE/);
});
