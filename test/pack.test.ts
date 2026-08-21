import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { A_SENDER, A_THIRD_PARTY, buildSl2, flipByte } from './fixture.ts';
import { bytesEqual } from '../src/bytes.ts';
import { createPack, openPack, readManifest, readPack, PACK_FORMAT } from '../src/pack.ts';

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

  it('keeps a folder a save sits in, and numbers only the name', () => {
    // A dropped folder arrives as paths, and a dot in a folder name is not the
    // start of an extension.
    const pack = createPack(
      [
        { save: margit(), fileName: 'DP/03 - SKIP/ER0000.sl2' },
        { save: radahn(), fileName: 'DP/03 - SKIP/ER0000.sl2' },
        { save: margit(), fileName: 'v1.2/Avant Margit' },
        { save: radahn(), fileName: 'v1.2/Avant Margit' },
      ],
      { now: at },
    );

    assert.deepEqual(
      readPack(pack).saves.map((entry) => entry.fileName),
      [
        'DP/03 - SKIP/ER0000.sl2',
        'DP/03 - SKIP/ER0000-2.sl2',
        'v1.2/Avant Margit',
        'v1.2/Avant Margit-2',
      ],
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

  it('hands over the saves that are sound and names the one it cannot read', () => {
    const files = unzipSync(createPack(two(), { now: at }));
    flipByte(files['Avant Radahn.sl2']!, 0x400);

    const { saves, bad } = readPack(zipSync(files));

    assert.deepEqual(
      saves.map((save) => save.fileName),
      ['Avant Margit.sl2'],
    );
    assert.deepEqual(
      bad.map((save) => [save.fileName, save.code]),
      [['Avant Radahn.sl2', 'pack-corrupted']],
    );
  });

  it('skips a save the archive does not hold rather than withholding the rest', () => {
    const files = unzipSync(createPack(two(), { now: at }));
    delete files['Avant Radahn.sl2'];

    const { saves, bad } = readPack(zipSync(files));

    assert.deepEqual(
      saves.map((save) => save.fileName),
      ['Avant Margit.sl2'],
    );
    assert.deepEqual(
      bad.map((save) => save.code),
      ['pack-missing-save'],
    );
  });

  it('gives up only when nothing in the pack can be read', () => {
    const files = unzipSync(createPack(one(), { now: at }));
    flipByte(files['Avant Margit.sl2']!, 0x400);

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

  it('rejects a manifest that gives an unreadable account', () => {
    const files = unzipSync(createPack(one(), { now: at }));
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']!));
    manifest.saves[0].steamId = 'nobody';
    files['manifest.json'] = strToU8(JSON.stringify(manifest));

    assert.throws(() => readPack(zipSync(files)), /manifest/i);
  });

  it('reads the manifest without inflating a single save', () => {
    const files = unzipSync(createPack(two(), { now: at }));
    for (const name of Object.keys(files)) {
      if (name !== 'manifest.json') files[name] = new Uint8Array(8).fill(0xff);
    }

    const manifest = readManifest(zipSync(files));

    assert.deepEqual(
      manifest.saves.map((entry) => entry.fileName),
      ['Avant Margit.sl2', 'Avant Radahn.sl2'],
    );
  });

  it('rejects something that is not an archive at all', () => {
    assert.throws(() => readPack(new TextEncoder().encode('hello world')), /not a .*savepack/i);
  });
});

describe('openPack', () => {
  it('writes a pack a reader accepts, one save at a time', () => {
    const writer = openPack({ now: at });
    writer.add(margit(), 'Avant Margit.sl2');
    writer.add(radahn(), 'Avant Radahn.sl2');

    const { manifest, saves } = readPack(writer.finish());

    assert.equal(manifest.createdAt, at.toISOString());
    assert.deepEqual(
      saves.map((save) => save.fileName),
      ['Avant Margit.sl2', 'Avant Radahn.sl2'],
    );
  });

  it('describes each save as it goes, so a caller can say where it is', () => {
    const writer = openPack({ now: at });

    const packed = writer.add(margit(), 'Avant Margit.sl2');

    assert.equal(packed.fileName, 'Avant Margit.sl2');
    assert.equal(packed.steamId, owner.toString());
    assert.deepEqual(
      packed.characters.map((character) => character.name),
      ['RL1 Any%'],
    );
    writer.finish();
  });

  it('keeps names unique as they arrive, without seeing the batch first', () => {
    const writer = openPack({ now: at });
    writer.add(margit(), 'ER0000.sl2');
    writer.add(radahn(), 'ER0000.sl2');

    const { saves } = readPack(writer.finish());

    assert.deepEqual(
      saves.map((save) => save.fileName),
      ['ER0000.sl2', 'ER0000-2.sl2'],
    );
  });

  it('refuses to close a pack holding nothing', () => {
    assert.throws(() => openPack({ now: at }).finish(), /at least one save/i);
  });

  it("packs the same batch to the same bytes twice running", () => {
    const build = () => {
      const writer = openPack({ now: at });
      writer.add(margit(), "Avant Margit.sl2");
      return writer.finish();
    };

    assert.ok(bytesEqual(build(), build()), "two identical batches gave different archives");
  });

  it("keeps the note, like the whole-batch call does", () => {
    const writer = openPack({ note: 'Practice set', now: at });
    writer.add(margit(), 'Avant Margit.sl2');

    assert.equal(readPack(writer.finish()).manifest.note, 'Practice set');
  });
});

describe('readPack, on a save packed while already damaged', () => {
  it('skips it and says the save is the problem, not the pack', () => {
    // Its bytes match the manifest to the byte: the pack is intact and the save
    // inside it is not.
    const damaged = margit();
    flipByte(damaged, 0x1000);
    const pack = createPack(
      [
        { save: damaged, fileName: 'Avant Margit.sl2' },
        { save: radahn(), fileName: 'Avant Radahn.sl2' },
      ],
      { now: at },
    );

    const { saves, bad } = readPack(pack);

    assert.deepEqual(
      saves.map((save) => save.fileName),
      ['Avant Radahn.sl2'],
    );
    assert.deepEqual(
      bad.map((save) => [save.fileName, save.code]),
      [['Avant Margit.sl2', 'save-corrupted']],
    );
  });
});
