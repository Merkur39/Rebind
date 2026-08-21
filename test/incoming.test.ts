import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { A_SENDER, A_THIRD_PARTY, buildSl2, flipByte } from './fixture.ts';
import { createPack } from '../src/pack.ts';
import { IncomingSaveError, readIncoming, summariseIncoming } from '../src/incoming.ts';
import { unzipSync, zipSync } from 'fflate';
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


describe('summariseIncoming', () => {
  it('describes a save file the way the page lists it', () => {
    const save = margit();

    const summary = summariseIncoming(save, at);

    assert.equal(summary.kind, 'save file');
    assert.equal(summary.dated, at.toISOString());
    assert.deepEqual(summary.saves, [
      {
        size: save.length,
        steamId: owner,
        characters: [{ slot: 0, name: 'RL1 Any%', level: 1, secondsPlayed: 3600 }],
      },
    ]);
  });

  it('describes a pack from its manifest alone, never unpacking a save', () => {
    // The saves in this archive are replaced by rubbish under the same names, so
    // anything that inflated one would throw or report nonsense.
    const files = unzipSync(
      createPack(
        [
          { save: margit(), fileName: 'Avant Margit.sl2' },
          { save: radahn(), fileName: 'Avant Radahn.sl2' },
        ],
        { note: 'Practice set', now: at },
      ),
    );
    const sizes = Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [name, bytes.length]),
    );
    for (const name of Object.keys(files)) {
      if (name !== 'manifest.json') files[name] = new Uint8Array(8).fill(0xff);
    }

    const summary = summariseIncoming(zipSync(files), new Date('2030-01-01T00:00:00.000Z'));

    assert.equal(summary.kind, 'savepack');
    assert.equal(summary.note, 'Practice set');
    // The pack's own date, not the file's, which a download would reset.
    assert.equal(summary.dated, at.toISOString());
    assert.deepEqual(
      summary.saves.map((save) => [save.fileName, save.size, save.steamId]),
      [
        ['Avant Margit.sl2', sizes['Avant Margit.sl2'], owner],
        ['Avant Radahn.sl2', sizes['Avant Radahn.sl2'], A_THIRD_PARTY],
      ],
    );
    assert.deepEqual(
      summary.saves.flatMap((save) => save.characters.map((character) => character.name)),
      ['RL1 Any%', 'Boss rush'],
    );
  });

  it('leaves out a note that is not there, rather than carrying an empty one', () => {
    const summary = summariseIncoming(createPack([{ save: margit() }], { now: at }), at);

    assert.ok(!('note' in summary));
  });

  it('still refuses a pack made for another game', () => {
    const files = unzipSync(createPack([{ save: margit() }], { now: at }));
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']!));
    manifest.game = 'dark-souls-3';
    files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest));

    assert.throws(() => summariseIncoming(zipSync(files), at), /dark-souls-3|another game/i);
  });

  it('still refuses what is neither a save nor a pack', () => {
    assert.throws(() => summariseIncoming(new TextEncoder().encode('hello world'), at), /neither/i);
  });
});

describe('readIncoming, on a pack it cannot read whole', () => {
  it('passes on the saves it could not hand over, and the rest with them', () => {
    const files = unzipSync(
      createPack(
        [
          { save: margit(), fileName: 'Avant Margit.sl2' },
          { save: radahn(), fileName: 'Avant Radahn.sl2' },
        ],
        { now: at },
      ),
    );
    flipByte(files['Avant Radahn.sl2']!, 0x400);

    const incoming = readIncoming(zipSync(files), at);

    assert.deepEqual(
      incoming.saves.map((save) => save.fileName),
      ['Avant Margit.sl2'],
    );
    assert.deepEqual(
      incoming.skipped.map((save) => [save.fileName, save.code]),
      [['Avant Radahn.sl2', 'pack-corrupted']],
    );
  });

  it('skips nothing when a save file is all there is', () => {
    assert.deepEqual(readIncoming(margit(), at).skipped, []);
  });
});

describe('a save whose own digests no longer match', () => {
  const altered = () => {
    const save = margit();
    flipByte(save, 0x1000);
    return save;
  };

  it('is refused when the file is dropped', () => {
    assert.throws(() => summariseIncoming(altered(), at), /damaged|checksum/i);
  });

  it('is refused when it is read for conversion', () => {
    assert.throws(() => readIncoming(altered(), at), /damaged|checksum/i);
  });
});

describe('an archive of saves', () => {
  const tree = () =>
    zipSync({
      'DP/03 - SKIP/01 SKIP 01 Sellia': margit(),
      'DP/02 - BOSS/03 BOSS 01 Abductors': radahn(),
    });

  it('is read as the saves it holds, each under the path it sat at', () => {
    const incoming = readIncoming(tree(), at);

    assert.equal(incoming.kind, 'archive');
    assert.deepEqual(
      incoming.saves.map((save) => save.fileName),
      ['DP/03 - SKIP/01 SKIP 01 Sellia', 'DP/02 - BOSS/03 BOSS 01 Abductors'],
    );
    assert.deepEqual(
      incoming.saves.map((save) => save.steamId),
      [owner, A_THIRD_PARTY],
    );
  });

  it('is described without being kept, like a pack is', () => {
    const summary = summariseIncoming(tree(), at);

    assert.equal(summary.kind, 'archive');
    assert.deepEqual(
      summary.saves.map((save) => [save.fileName, save.size]),
      [
        ['DP/03 - SKIP/01 SKIP 01 Sellia', margit().length],
        ['DP/02 - BOSS/03 BOSS 01 Abductors', radahn().length],
      ],
    );
    assert.ok(summary.saves.every((save) => !('save' in save)));
  });

  it('leaves out what is not a save, and names it', () => {
    const bytes = zipSync({
      'lisez-moi.txt': new TextEncoder().encode('rien à voir'),
      'saves/one': margit(),
    });

    const incoming = readIncoming(bytes, at);

    assert.deepEqual(
      incoming.saves.map((save) => save.fileName),
      ['saves/one'],
    );
    assert.deepEqual(
      incoming.skipped.map((save) => [save.fileName, save.code]),
      [['lisez-moi.txt', 'not-a-save']],
    );
  });

  it('refuses a name that would climb out of the folder it unpacks into', () => {
    const bytes = zipSync({ '../ailleurs/one': margit(), 'saves/two': radahn() });

    const incoming = readIncoming(bytes, at);

    assert.deepEqual(
      incoming.saves.map((save) => save.fileName),
      ['saves/two'],
    );
    assert.deepEqual(
      incoming.skipped.map((save) => save.code),
      ['unsafe-name'],
    );
  });

  it('says nothing of the folders a zip records, having nothing to say', () => {
    const bytes = zipSync({ 'DP/': new Uint8Array(0), 'DP/one': margit() });

    const incoming = readIncoming(bytes, at);

    assert.equal(incoming.saves.length, 1);
    assert.deepEqual(incoming.skipped, []);
  });

  it('is refused outright when it holds no save at all', () => {
    const bytes = zipSync({ 'lisez-moi.txt': new TextEncoder().encode('rien') });

    assert.throws(() => readIncoming(bytes, at), /no Elden Ring save|aucune sauvegarde/i);
  });

  it('counts its way through, so a caller can show where it is', () => {
    const steps: string[] = [];

    readIncoming(tree(), at, (done, total, name) => steps.push(`${done}/${total} ${name}`));

    assert.deepEqual(steps, [
      '1/2 DP/03 - SKIP/01 SKIP 01 Sellia',
      '2/2 DP/02 - BOSS/03 BOSS 01 Abductors',
    ]);
  });
});
