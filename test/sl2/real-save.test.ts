import { bytesEqual } from '../../src/bytes.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseSl2, verifyChecksums } from '../../src/sl2/bnd4.ts';
import { readProfile } from '../../src/sl2/profile.ts';
import { rebindToSteamId } from '../../src/sl2/rebind.ts';

/**
 * Read-only checks against a real ER0000.sl2 if this machine happens to have
 * one. The synthetic fixture encodes what we believe the format to be; only a
 * real save can prove that belief right.
 */
function findRealSave(): { path: string; steamId: bigint } | null {
  const root = process.env['APPDATA'] && join(process.env['APPDATA'], 'EldenRing');
  if (!root || !existsSync(root)) return null;
  for (const dir of readdirSync(root)) {
    const path = join(root, dir, 'ER0000.sl2');
    if (/^\d{17}$/.test(dir) && existsSync(path)) return { path, steamId: BigInt(dir) };
  }
  return null;
}

const real = findRealSave();

// A skipped describe reports zero tests, which is indistinguishable from this
// file having silently stopped finding anything. Say which case it is.
console.log(
  real
    ? `real-save checks: running against ${real.path}`
    : 'real-save checks: skipped, no Elden Ring save on this machine',
);

describe('a real Elden Ring save', { skip: real ? false : 'no Elden Ring save on this machine' }, () => {
  const load = () => readFileSync(real!.path);

  it('parses into twelve entries with valid checksums', () => {
    const save = load();

    assert.deepEqual(verifyChecksums(save, parseSl2(save)), []);
  });

  it('reports the Steam ID that owns the save folder', () => {
    const save = load();

    assert.equal(readProfile(save, parseSl2(save)).steamId, real!.steamId);
  });

  it('lists characters with plausible levels and playtimes', () => {
    const save = load();

    const { characters } = readProfile(save, parseSl2(save));
    assert.ok(characters.length > 0, 'expected at least one character');
    for (const character of characters) {
      assert.match(character.name, /\S/);
      assert.ok(character.level >= 1 && character.level <= 713, `level ${character.level}`);
      assert.ok(character.secondsPlayed >= 0);
    }
  });

  it('survives a rebind round trip byte for byte', () => {
    const original = load();
    const other = 76561198000000001n;

    const away = rebindToSteamId(original, other);
    const back = rebindToSteamId(away.save, real!.steamId);

    assert.ok(away.replacements > 0, 'expected the owner id to appear in the save');
    assert.deepEqual(verifyChecksums(away.save, parseSl2(away.save)), []);
    assert.ok(bytesEqual(back.save, original), 'round trip did not restore the original bytes');
  });
});
