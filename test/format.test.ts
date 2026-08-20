import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatPlaytime, formatCharacters, formatSize } from '../src/format.ts';

describe('formatPlaytime', () => {
  it('shows minutes below an hour', () => {
    assert.equal(formatPlaytime(0), '0m');
    assert.equal(formatPlaytime(1974), '32m');
  });

  it('shows hours and minutes above an hour', () => {
    assert.equal(formatPlaytime(3600), '1h00');
    assert.equal(formatPlaytime(50375), '13h59');
  });
});

describe('formatSize', () => {
  it('reports sizes a human can read', () => {
    assert.equal(formatSize(512), '512 B');
    assert.equal(formatSize(28967888), '27.6 MB');
  });
});

describe('formatCharacters', () => {
  it('lines the columns up so slots are easy to scan', () => {
    const lines = formatCharacters([
      { slot: 0, name: 'Ciri', level: 47, secondsPlayed: 50375 },
      { slot: 2, name: 'RL1 Any%', level: 1, secondsPlayed: 3600 },
    ]);

    assert.deepEqual(lines, ['  slot 0  Ciri      RL47  13h59', '  slot 2  RL1 Any%  RL1   1h00']);
  });

  it('says so plainly when there is no character at all', () => {
    assert.deepEqual(formatCharacters([]), ['  (no characters)']);
  });
});
