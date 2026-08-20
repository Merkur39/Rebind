import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { A_SENDER, A_THIRD_PARTY, buildSl2, flipByte } from './fixture.ts';
import { bytesEqual } from '../src/bytes.ts';
import { createPack, readPack, PACK_FORMAT } from '../src/pack.ts';

const owner = A_SENDER;
const at = new Date('2026-08-20T10:00:00.000Z');

const margit = () =>
  buildSl2({ steamId: owner, slots: [{ name: 'RL1 Any%', level: 1, secondsPlayed: 3600 }] });
const radahn = () =>
  buildSl2({ steamId: A_THIRD_PARTY, slots: [{ name: 'Boss rush', level: 150, secondsPlayed: 50375 }] });

const one = () => [{ save: margit(), fileName: 'Avant Margit.sl2' }];
const two = () => [
  { save: margit(), fileName: 'Avant Margit.sl2' },
  { save: radahn(), fileName: 'Avant Radahn.sl2' },
];

describe('createPack', () => {
  it('holds the manifest and one entry per save, under their own names', () => {
    const files = unzipSync(createPack(two(), { now: at }));

    assert.deepEqual(Object.keys(files).sort(), [
      'Avant Margit.sl2',
      'Avant Radahn.sl2',
      'manifest.json',
    ]);
  });

  it('describes every save it carries', () => {
    const { manifest } = readPack(createPack(two(), { now: at }));

    assert.equal(manifest.format, PACK_FORMAT);
    assert.equal(manifest.game, 'elden-ring');
    assert.equal(manifest.createdAt, at.toISOString());
    assert.deepEqual(
      manifest.saves.map((entry) => entry.fileName),
      ['Avant Margit.sl2', 'Avant Radahn.sl2'],
    );
    assert.deepEqual(
      manifest.saves.map((entry) => entry.steamId),
      [owner.toString(), A_THIRD_PARTY.toString()],
    );
    assert.deepEqual(
      manifest.saves.flatMap((entry) => entry.characters.map((character) => character.name)),
      ['RL1 Any%', 'Boss rush'],
    );
  });

  it('keeps the note the sender wrote, once for the whole pack', () => {
    const { manifest } = readPack(createPack(two(), { note: 'Practice set', now: at }));

    assert.equal(manifest.note, 'Practice set');
  });

  it('packs a single save just as readily', () => {
    const { saves } = readPack(createPack(one(), { now: at }));

    assert.equal(saves.length, 1);
    assert.equal(saves[0]!.fileName, 'Avant Margit.sl2');
  });

  it('keeps names unique when two saves are called the same thing', () => {
    const pack = createPack(
      [
        { save: margit(), fileName: 'ER0000.sl2' },
        { save: radahn(), fileName: 'ER0000.sl2' },
      ],
      { now: at },
    );

    assert.deepEqual(
      readPack(pack).saves.map((entry) => entry.fileName),
      ['ER0000.sl2', 'ER0000-2.sl2'],
    );
  });

  it('refuses a file that is not an Elden Ring save', () => {
    assert.throws(
      () => createPack([{ save: new Uint8Array(0x400), fileName: 'x.sl2' }], { now: at }),
      /not an Elden Ring save/i,
    );
  });

  it('refuses to build an empty pack', () => {
    assert.throws(() => createPack([], { now: at }), /at least one save/i);
  });
});

describe('readPack', () => {
  it('returns every save exactly as it went in', () => {
    const originals = two();

    const { saves } = readPack(createPack(originals, { now: at }));

    assert.ok(bytesEqual(saves[0]!.save, originals[0]!.save));
    assert.ok(bytesEqual(saves[1]!.save, originals[1]!.save));
  });

  it('rejects a pack whose save was altered after packing', () => {
    const files = unzipSync(createPack(two(), { now: at }));
    flipByte(files['Avant Radahn.sl2']!, 0x400);

    assert.throws(() => readPack(zipSync(files)), /corrupted|checksum|integrity/i);
  });

  it('rejects an archive that has no manifest', () => {
    assert.throws(() => readPack(zipSync({ 'ER0000.sl2': margit() })), /manifest/i);
  });

  it('rejects a pack format it does not understand', () => {
    const files = unzipSync(createPack(one(), { now: at }));
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']!));
    manifest.format = 'rebind/99';
    files['manifest.json'] = strToU8(JSON.stringify(manifest));

    assert.throws(() => readPack(zipSync(files)), /rebind\/99|newer version/i);
  });

  it('rejects a pack made for another game', () => {
    const files = unzipSync(createPack(one(), { now: at }));
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']!));
    manifest.game = 'dark-souls-3';
    files['manifest.json'] = strToU8(JSON.stringify(manifest));

    assert.throws(() => readPack(zipSync(files)), /dark-souls-3|another game/i);
  });

  it('rejects a pack whose manifest names a save the archive does not hold', () => {
    const files = unzipSync(createPack(one(), { now: at }));
    delete files['Avant Margit.sl2'];

    assert.throws(() => readPack(zipSync(files)), /missing/i);
  });

  it('rejects something that is not an archive at all', () => {
    assert.throws(() => readPack(new TextEncoder().encode('hello world')), /not a .*savepack/i);
  });
});
