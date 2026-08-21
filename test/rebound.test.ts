import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, zipSync } from 'fflate';
import { A_RECIPIENT, A_SENDER, A_THIRD_PARTY, buildSl2, flipByte } from './fixture.ts';
import { bytesEqual } from '../src/bytes.ts';
import { createPack } from '../src/pack.ts';
import { readIncoming } from '../src/incoming.ts';
import { parseSl2, verifyChecksums } from '../src/sl2/bnd4.ts';
import { readProfile } from '../src/sl2/profile.ts';
import { rebindIncoming } from '../src/rebound.ts';

const at = new Date('2026-08-20T10:00:00.000Z');

const margit = () =>
  buildSl2({
    steamId: A_SENDER,
    slots: [{ name: 'RL1 Any%', level: 1, secondsPlayed: 3600, steamIdEchoes: [0x80] }],
  });
const radahn = () =>
  buildSl2({
    steamId: A_SENDER,
    slots: [{ name: 'Boss rush', level: 150, secondsPlayed: 60, steamIdEchoes: [0x80] }],
  });

const ownerOf = (save: Uint8Array) => readProfile(save, parseSl2(save)).steamId;

describe('rebindIncoming, on a save file', () => {
  it('rebinds it and hands back one file under the name it came with', () => {
    const incoming = readIncoming(margit(), at);

    const rebound = rebindIncoming(incoming, '01 SKIP 04 Liurnia Porte', A_RECIPIENT, at);

    assert.equal(rebound.bundled, false);
    assert.equal(rebound.name, '01 SKIP 04 Liurnia Porte');
    assert.equal(ownerOf(rebound.bytes), A_RECIPIENT);
    assert.deepEqual(verifyChecksums(rebound.bytes, parseSl2(rebound.bytes)), []);
  });

  it('says whose it was and how many references it rewrote', () => {
    const incoming = readIncoming(margit(), at);

    const { saves } = rebindIncoming(incoming, 'Avant Margit.sl2', A_RECIPIENT, at);

    assert.equal(saves.length, 1);
    assert.equal(saves[0]!.previousSteamId, A_SENDER);
    assert.ok(saves[0]!.replacements >= 2, 'expected the profile block and the character echo');
  });

  it('copies a save that already belongs to the recipient, unchanged', () => {
    const own = buildSl2({ steamId: A_RECIPIENT, slots: [{ name: 'Mine', level: 1, secondsPlayed: 1 }] });

    const rebound = rebindIncoming(readIncoming(own, at), 'Mine.sl2', A_RECIPIENT, at);

    assert.equal(rebound.saves[0]!.replacements, 0);
    assert.ok(bytesEqual(rebound.bytes, own));
  });
});

describe('rebindIncoming, on a savepack', () => {
  const pack = () =>
    readIncoming(
      createPack(
        [
          { save: margit(), fileName: 'Avant Margit.sl2' },
          { save: radahn(), fileName: 'Avant Radahn.sl2' },
        ],
        { now: at },
      ),
      at,
    );

  it('bundles the rebound saves into one zip named after the pack', () => {
    const rebound = rebindIncoming(pack(), 'Practice set.savepack.zip', A_RECIPIENT, at);

    assert.equal(rebound.bundled, true);
    assert.equal(rebound.name, 'Practice set.zip');

    const files = unzipSync(rebound.bytes);
    assert.deepEqual(Object.keys(files).sort(), ['Avant Margit.sl2', 'Avant Radahn.sl2']);
    for (const save of Object.values(files)) assert.equal(ownerOf(save), A_RECIPIENT);
  });

  it('reports every save it went through, in order', () => {
    const { saves } = rebindIncoming(pack(), 'Practice set.savepack.zip', A_RECIPIENT, at);

    assert.deepEqual(
      saves.map((save) => save.name),
      ['Avant Margit.sl2', 'Avant Radahn.sl2'],
    );
    assert.deepEqual(
      saves.map((save) => save.previousSteamId),
      [A_SENDER, A_SENDER],
    );
  });

  it('counts its way through the batch, so a caller can show progress', () => {
    const steps: string[] = [];

    rebindIncoming(pack(), 'Practice set.savepack.zip', A_RECIPIENT, at, (done, total, name) =>
      steps.push(`${done}/${total} ${name}`),
    );

    assert.deepEqual(steps, ['1/2 Avant Margit.sl2', '2/2 Avant Radahn.sl2']);
  });

  it('keeps two saves recorded under one name apart in the zip', () => {
    // A zip with the same entry twice unpacks to whichever the tool picks.
    const twins = readIncoming(
      createPack([{ save: margit(), fileName: 'Same.sl2' }, { save: radahn() }], { now: at }),
      at,
    );

    const rebound = rebindIncoming(twins, 'Twins.savepack.zip', A_THIRD_PARTY, at);

    assert.equal(Object.keys(unzipSync(rebound.bytes)).length, 2);
  });
});

describe('rebindIncoming, on a pack that came through damaged', () => {
  it('converts what is sound and passes on what could not be read', () => {
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

    const rebound = rebindIncoming(incoming, 'Practice set.savepack.zip', A_RECIPIENT, at);

    // One save left standing is one save, not a bundle of one.
    assert.equal(rebound.bundled, false);
    assert.equal(rebound.name, 'Avant Margit.sl2');
    assert.equal(ownerOf(rebound.bytes), A_RECIPIENT);
    assert.deepEqual(
      rebound.skipped.map((save) => save.fileName),
      ['Avant Radahn.sl2'],
    );
  });
});

describe('rebindIncoming, on one save that sat in folders', () => {
  it('hands it back under its own name, the folders having nowhere to go', () => {
    // A lone file is downloaded as itself, and a download name cannot hold a
    // path — the browser flattens it to DP_03 - SKIP_… if you try.
    const archive = zipSync({ 'DP/03 - SKIP/Avant Margit': margit() });

    const rebound = rebindIncoming(readIncoming(archive, at), 'DP.zip', A_RECIPIENT, at);

    assert.equal(rebound.bundled, false);
    assert.equal(rebound.name, 'Avant Margit');
  });

  it('keeps the folders when there are several, the zip having room for them', () => {
    const archive = zipSync({
      'DP/03 - SKIP/Avant Margit': margit(),
      'DP/02 - BOSS/Avant Radahn': radahn(),
    });

    const rebound = rebindIncoming(readIncoming(archive, at), 'DP.zip', A_RECIPIENT, at);

    assert.equal(rebound.bundled, true);
    assert.deepEqual(Object.keys(unzipSync(rebound.bytes)).sort(), [
      'DP/02 - BOSS/Avant Radahn',
      'DP/03 - SKIP/Avant Margit',
    ]);
  });
});
