import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hideSpotCount, huntSpotCount, createSpots, placeLeftovers, openSpot, huntOutcome } from '../src/services/games/hideGames.js';

describe('hide games', () => {
  test('grid sizes fit in 25 buttons and leave empty squares', () => {
    assert.equal(hideSpotCount(3), 9);
    assert.equal(hideSpotCount(12), 24);
    assert.equal(huntSpotCount(2), 5);
    assert.equal(huntSpotCount(11), 23);
  });

  test('players who did not hide get a free square', () => {
    const spots = createSpots(5);
    spots[0].occupant = 'a';
    placeLeftovers(spots, ['a', 'b', 'c'], (list) => list);
    assert.deepEqual(spots.map((spot) => spot.occupant), ['a', 'b', 'c', null, null]);
  });

  test('opening a square finds the hider or reports it empty', () => {
    const spots = createSpots(3);
    spots[1].occupant = 'b';
    assert.equal(openSpot(spots, 0), null);
    assert.equal(spots[0].result, 'empty');
    assert.equal(openSpot(spots, 1), 'b');
    assert.equal(spots[1].result, 'found');
  });

  test('hunt: hunter wins by catching everyone, sheep win when the fake sheep run out', () => {
    assert.equal(huntOutcome({ sheepLeft: 0, misses: 2, fakeCount: 4 }), 'hunter');
    assert.equal(huntOutcome({ sheepLeft: 1, misses: 4, fakeCount: 4 }), 'sheep');
    assert.equal(huntOutcome({ sheepLeft: 2, misses: 1, fakeCount: 4 }), null);
  });
});
