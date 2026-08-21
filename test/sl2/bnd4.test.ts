import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSl2, flipByte } from '../fixture.ts';
import { assertChecksums, parseSl2, verifyChecksums, refreshChecksums } from '../../src/sl2/bnd4.ts';

const A_SENDER = 76561198000000001n;
const steamId = A_SENDER;
const someSave = () => buildSl2({ steamId, slots: [{ name: 'Tarnished', level: 1, secondsPlayed: 0 }] });

describe('parseSl2', () => {
  it('reads the twelve entries of an Elden Ring save', () => {
    const entries = parseSl2(someSave());

    assert.equal(entries.length, 12);
    assert.deepEqual(entries[0], { index: 0, checksumOffset: 0x300, bodyOffset: 0x310, bodySize: 0x280000 });
    assert.equal(entries[10]!.bodyOffset, 0x19003b0);
    assert.equal(entries[10]!.bodySize, 0x60000);
  });

  it('rejects a buffer that is not a BND4 container', () => {
    assert.throws(() => parseSl2(Buffer.alloc(0x400)), /not an Elden Ring save/i);
  });

  it('rejects a container whose last entry runs past the end of the file', () => {
    const truncated = someSave().subarray(0, 0x1ba0000);

    assert.throws(() => parseSl2(truncated), /truncated/i);
  });
});

describe('verifyChecksums', () => {
  it('accepts a save straight out of the fixture builder', () => {
    const save = someSave();

    assert.deepEqual(verifyChecksums(save, parseSl2(save)), []);
  });

  it('reports every entry whose body no longer matches its stored digest', () => {
    const save = someSave();
    const entries = parseSl2(save);
    flipByte(save, entries[3]!.bodyOffset);

    assert.deepEqual(verifyChecksums(save, entries), [3]);
  });
});

describe('refreshChecksums', () => {
  it('makes a tampered save valid again without touching anything else', () => {
    const save = someSave();
    const entries = parseSl2(save);
    const before = Buffer.from(save);
    flipByte(save, entries[3]!.bodyOffset + 8);

    refreshChecksums(save, entries);

    assert.deepEqual(verifyChecksums(save, entries), []);
    // Only the mutated byte and entry 3's digest may differ.
    const changed: number[] = [];
    for (let i = 0; i < save.length; i++) if (save[i] !== before[i]) changed.push(i);
    assert.equal(changed.length, 17);
    assert.equal(changed[0], entries[3]!.checksumOffset);
  });
});

describe('assertChecksums', () => {
  it('accepts a save whose blocks all match', () => {
    const save = buildSl2({ steamId: A_SENDER, slots: [{ name: 'Ciri', level: 9, secondsPlayed: 60 }] });

    assert.doesNotThrow(() => assertChecksums(save, parseSl2(save)));
  });

  it('refuses a save whose bytes were altered under its own digests', () => {
    // What a bad download or a half-written copy leaves behind: the file parses,
    // the profile reads, and the game refuses it.
    const save = buildSl2({ steamId: A_SENDER, slots: [{ name: 'Ciri', level: 9, secondsPlayed: 60 }] });
    flipByte(save, 0x1000);

    assert.throws(() => assertChecksums(save, parseSl2(save)), /damaged|checksum/i);
  });
});
