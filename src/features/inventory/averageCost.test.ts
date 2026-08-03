import test from 'node:test';
import assert from 'node:assert/strict';
import { requiresBelowAverageCostApproval, weightedAverageCost } from './averageCost';

test('weighted average cost blends existing stock and newly received stock', () => {
  assert.equal(weightedAverageCost(10, 5, 5, 40), 6);
});

test('only valid costs below positive stock average require escalation', () => {
  assert.equal(requiresBelowAverageCostApproval(4.99, 5), true);
  assert.equal(requiresBelowAverageCostApproval(5, 5), false);
  assert.equal(requiresBelowAverageCostApproval(-1, 5), false);
  assert.equal(requiresBelowAverageCostApproval(0, 0), false);
});
