import { bytesEqual, indexOfSequence } from '../../src/bytes.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { A_RECIPIENT, A_SENDER, buildSl2 } from '../fixture.ts';
import { parseSl2, verifyChecksums } from '../../src/sl2/bnd4.ts';
import { readProfile } from '../../src/sl2/profile.ts';
import { rebindToSteamId } from '../../src/sl2/rebind.ts';

const owner = A_SENDER;
const recipient = A_RECIPIENT;

const sharedSave = () =>
  buildSl2({
    steamId: owner,
    slots: [
      { name: 'Ciri', level: 47, secondsPlayed: 50375, steamIdEchoes: [0x120, 0x300] },
      { name: 'Merkur', level: 9, secondsPlayed: 1974, steamIdEchoes: [0x200] },
    ],
  });

describe('rebindToSteamId', () => {
  it('binds the save to the recipient account', () => {
    const { save } = rebindToSteamId(sharedSave(), recipient);

    assert.equal(readProfile(save, parseSl2(save)).steamId, recipient);
  });

  it('rewrites the owner id echoed inside the character blocks', () => {
    const { replacements, previousSteamId } = rebindToSteamId(sharedSave(), recipient);

    assert.equal(previousSteamId, owner);
    assert.equal(replacements, 4); // one in the profile, three across two characters
  });

  it('leaves no trace of the previous owner anywhere in the file', () => {
    const stale = Buffer.alloc(8);
    stale.writeBigUInt64LE(owner);

    const { save } = rebindToSteamId(sharedSave(), recipient);

    assert.equal(indexOfSequence(save, stale), -1);
  });

  it('produces a save the game will accept', () => {
    const { save } = rebindToSteamId(sharedSave(), recipient);

    assert.deepEqual(verifyChecksums(save, parseSl2(save)), []);
  });

  it('preserves character progression and every unrelated byte', () => {
    const original = sharedSave();

    const { save } = rebindToSteamId(original, recipient);

    assert.deepEqual(
      readProfile(save, parseSl2(save)).characters,
      readProfile(original, parseSl2(original)).characters,
    );
    assert.ok(bytesEqual(save.subarray(0, 0x300), original.subarray(0, 0x300)));
  });

  it('does not mutate the buffer it was given', () => {
    const original = sharedSave();
    const pristine = Buffer.from(original);

    rebindToSteamId(original, recipient);

    assert.ok(bytesEqual(original, pristine));
  });

  it('is a no-op when the save already belongs to the recipient', () => {
    const original = sharedSave();

    const { save, replacements } = rebindToSteamId(original, owner);

    assert.equal(replacements, 0);
    assert.ok(bytesEqual(save, original));
  });

  it('refuses a Steam ID that is not a 64-bit account id', () => {
    assert.throws(() => rebindToSteamId(sharedSave(), 0n), /steam id/i);
  });
});
