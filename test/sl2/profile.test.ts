import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { A_SENDER, buildSl2 } from '../fixture.ts';
import { parseSl2 } from '../../src/sl2/bnd4.ts';
import { readProfile } from '../../src/sl2/profile.ts';

const steamId = A_SENDER;

describe('readProfile', () => {
  it('reads the Steam account the save is bound to', () => {
    const save = buildSl2({ steamId, slots: [] });

    assert.equal(readProfile(save, parseSl2(save)).steamId, steamId);
  });

  it('describes every occupied character slot and skips the empty ones', () => {
    const save = buildSl2({
      steamId,
      slots: [
        { name: 'Ciri', level: 47, secondsPlayed: 50375 },
        null,
        { name: 'RL1 Any%', level: 1, secondsPlayed: 3600 },
      ],
    });

    const { characters } = readProfile(save, parseSl2(save));

    assert.deepEqual(characters, [
      { slot: 0, name: 'Ciri', level: 47, secondsPlayed: 50375 },
      { slot: 2, name: 'RL1 Any%', level: 1, secondsPlayed: 3600 },
    ]);
  });

  it('keeps a name that fills the whole fixed-width field', () => {
    const name = 'Aaaaaaaaaaaaaaaaa'; // 17 chars = the 0x22 byte maximum
    const save = buildSl2({ steamId, slots: [{ name, level: 713, secondsPlayed: 1 }] });

    assert.equal(readProfile(save, parseSl2(save)).characters[0]!.name, name);
  });
});

describe('readProfile, on a slot the game left half-erased', () => {
  /** Offset of the occupancy flags inside the profile block. */
  const OCCUPANCY = 0x19003b0 + 0x3a;

  it('ignores a slot flagged as occupied whose header carries no character', () => {
    // Seen on a real save after a character was replaced: the flag stayed at 1
    // while the summary header was cleared.
    const save = buildSl2({ steamId, slots: [{ name: 'blackrodeur', level: 353, secondsPlayed: 846594 }] });
    save[OCCUPANCY + 1] = 1;

    const { characters } = readProfile(save, parseSl2(save));

    assert.deepEqual(characters, [{ slot: 0, name: 'blackrodeur', level: 353, secondsPlayed: 846594 }]);
  });

  it('still ignores a named slot that is not flagged as occupied', () => {
    const save = buildSl2({ steamId, slots: [{ name: 'Deleted', level: 12, secondsPlayed: 60 }] });
    save[OCCUPANCY] = 0;

    assert.deepEqual(readProfile(save, parseSl2(save)).characters, []);
  });
});
