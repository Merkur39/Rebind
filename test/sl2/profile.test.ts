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

  it('describes every character slot and skips the empty ones', () => {
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
describe('readProfile, on the slots a save does not list', () => {
  /** Where the profile block starts in a save this fixture builds. */
  const PROFILE_BODY = 0x19003b0;
  /** One byte per slot, set while the slot holds a character the game lists. */
  const ACTIVE = PROFILE_BODY + 0x1954;
  /**
   * The byte an earlier version mistook for that table. It is clear on saves
   * whose character the game loads without complaint, so reading it cost a
   * whole practice library its characters.
   */
  const NOT_A_FLAG = PROFILE_BODY + 0x3a;

  const two = () => ({
    steamId,
    slots: [
      { name: 'Ciri', level: 9, secondsPlayed: 11266 },
      { name: 'RL1 Any%', level: 1, secondsPlayed: 157700 },
    ],
  });

  it('skips a character the save no longer marks as active', () => {
    // Deleting a character clears this byte and leaves everything else behind:
    // the summary header still names it, and its data block still holds it in
    // full. Seen on a real save, whose second character the game does not list.
    const save = buildSl2(two());
    save[ACTIVE + 1] = 0;

    const { characters } = readProfile(save, parseSl2(save));

    assert.deepEqual(characters, [{ slot: 0, name: 'Ciri', level: 9, secondsPlayed: 11266 }]);
  });

  it('ignores the byte that used to be read as the active table', () => {
    const save = buildSl2(two());
    save[NOT_A_FLAG] = 0;
    save[NOT_A_FLAG + 1] = 0;

    const { characters } = readProfile(save, parseSl2(save));

    assert.equal(characters.length, 2);
  });

  it('skips an active slot whose summary header carries no name', () => {
    // Nothing to show for it, so it would surface as a nameless character.
    const save = buildSl2({ steamId, slots: [{ name: 'Ciri', level: 353, secondsPlayed: 846594 }] });
    save[ACTIVE + 1] = 1;

    const { characters } = readProfile(save, parseSl2(save));

    assert.deepEqual(characters, [{ slot: 0, name: 'Ciri', level: 353, secondsPlayed: 846594 }]);
  });
});
