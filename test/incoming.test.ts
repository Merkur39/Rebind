import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { A_SENDER, A_THIRD_PARTY, buildSl2 } from './fixture.ts';
import { createPack } from '../src/pack.ts';
import { IncomingSaveError, readIncoming } from '../src/incoming.ts';
import { bytesEqual } from '../src/bytes.ts';

const owner = A_SENDER;
const at = new Date('2026-08-20T10:00:00.000Z');

const margit = () =>
  buildSl2({ steamId: owner, slots: [{ name: 'RL1 Any%', level: 1, secondsPlayed: 3600 }] });
const radahn = () =>
  buildSl2({ steamId: A_THIRD_PARTY, slots: [{ name: 'Boss rush', level: 150, secondsPlayed: 60 }] });

describe('readIncoming', () => {
  it('reads a raw save file as a set of exactly one', () => {
    const incoming = readIncoming(margit(), at);

    assert.equal(incoming.kind, 'save file');
    assert.equal(incoming.dated, at.toISOString());
    assert.equal(incoming.saves.length, 1);
    assert.equal(incoming.saves[0]!.steamId, owner);
    assert.deepEqual(
      incoming.saves[0]!.characters.map((character) => character.name),
      ['RL1 Any%'],
    );
  });

  it('has no recorded name for a raw save, the file name being all there is', () => {
    assert.equal(readIncoming(margit(), at).saves[0]!.fileName, undefined);
  });

  it('reads every save a pack carries, in order', () => {
    const packed = createPack(
      [
        { save: margit(), fileName: 'Avant Margit.sl2' },
        { save: radahn(), fileName: 'Avant Radahn.sl2' },
      ],
      { note: 'Practice set', now: at },
    );

    const incoming = readIncoming(packed, new Date('2030-01-01T00:00:00.000Z'));

    assert.equal(incoming.kind, 'savepack');
    assert.equal(incoming.note, 'Practice set');
    // The pack's own date wins over the file's, which a download would reset.
    assert.equal(incoming.dated, at.toISOString());
    assert.deepEqual(
      incoming.saves.map((entry) => entry.fileName),
      ['Avant Margit.sl2', 'Avant Radahn.sl2'],
    );
    assert.ok(bytesEqual(incoming.saves[0]!.save, margit()));
  });

  it('reports each save its own account, packs being able to mix senders', () => {
    const packed = createPack([{ save: margit() }, { save: radahn() }], { now: at });

    assert.deepEqual(
      readIncoming(packed, at).saves.map((entry) => entry.steamId),
      [owner, A_THIRD_PARTY],
    );
  });

  it('rejects a file that is neither', () => {
    const junk = new TextEncoder().encode('holiday photo');

    assert.throws(() => readIncoming(junk, at), IncomingSaveError);
    assert.throws(() => readIncoming(junk, at), /neither a savepack nor an Elden Ring save/i);
  });

  it('reports a truncated save rather than passing it on', () => {
    assert.throws(() => readIncoming(margit().subarray(0, 0x100000), at), /truncated/i);
  });
});
