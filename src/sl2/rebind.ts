import { indexOfSequence, readBigUint64LE, uint64LE } from '../bytes.ts';
import { parseSl2, refreshChecksums, type Sl2Entry } from './bnd4.ts';
import { profileEntry } from './profile.ts';
import { SaveError } from '../errors.ts';

const STEAM_ID_OFFSET = 0x04;
/** Individual Steam accounts live in the 0x0110000100000000 universe. */
const STEAM_ID_MIN = 76561197960265728n;
const STEAM_ID_MAX = STEAM_ID_MIN + 0xffffffffn;

export interface RebindResult {
  /** A new array; the input is never modified. */
  readonly save: Uint8Array;
  readonly previousSteamId: bigint;
  /** How many occurrences of the previous id were rewritten. */
  readonly replacements: number;
}

export class InvalidSteamIdError extends SaveError {}

export function assertSteamId(steamId: bigint): void {
  if (steamId < STEAM_ID_MIN || steamId > STEAM_ID_MAX) {
    throw new InvalidSteamIdError(
      'invalid-steam-id',
      `${steamId} is not a valid Steam ID (expected a 17-digit SteamID64 such as 76561197960265728).`,
    );
  }
}

/** Rewrites every occurrence of one Steam ID inside a byte range, in place. */
export function replaceSteamIdIn(
  save: Uint8Array,
  start: number,
  end: number,
  from: bigint,
  to: bigint,
): number {
  const needle = uint64LE(from);
  const replacement = uint64LE(to);
  let count = 0;
  let at = indexOfSequence(save, needle, start);
  while (at !== -1 && at + needle.length <= end) {
    save.set(replacement, at);
    count++;
    at = indexOfSequence(save, needle, at + needle.length);
  }
  return count;
}

function replaceWithin(save: Uint8Array, entry: Sl2Entry, from: bigint, to: bigint): number {
  return replaceSteamIdIn(save, entry.bodyOffset, entry.bodyOffset + entry.bodySize, from, to);
}

/**
 * Elden Ring binds a save to the Steam account that created it, so a save copied
 * from another player is rejected until its owner id is rewritten. The id is
 * stored in the profile block and echoed inside the character blocks, and every
 * block is guarded by an MD5 digest that has to be recomputed afterwards.
 */
export function rebindToSteamId(save: Uint8Array, steamId: bigint): RebindResult {
  assertSteamId(steamId);

  const entries = parseSl2(save);
  const previousSteamId = readBigUint64LE(save, profileEntry(entries).bodyOffset + STEAM_ID_OFFSET);
  if (previousSteamId === steamId) {
    return { save, previousSteamId, replacements: 0 };
  }

  // Not save.slice(): on a Node Buffer that is an alias of subarray and would
  // return a view onto the caller's bytes rather than a copy.
  const rebound = new Uint8Array(save);
  let replacements = 0;
  for (const entry of entries) replacements += replaceWithin(rebound, entry, previousSteamId, steamId);
  refreshChecksums(rebound, entries);

  return { save: rebound, previousSteamId, replacements };
}
