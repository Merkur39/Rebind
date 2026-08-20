import { decodeUtf16LE, readBigUint64LE, readInt32LE, readUint16LE } from '../bytes.ts';
import type { Sl2Entry } from './bnd4.ts';
import { Sl2FormatError } from './bnd4.ts';

/**
 * Entry 10 of the container holds the profile block: the Steam account the save
 * belongs to, which slots are occupied, and a summary header per slot. All the
 * offsets below are relative to the start of that block and were verified
 * against a real save file.
 */
export const PROFILE_ENTRY_INDEX = 10;
export const STEAM_ID_OFFSET = 0x04;
export const SLOT_OCCUPANCY_OFFSET = 0x3a;
export const SLOT_HEADERS_OFFSET = 0x195e;
export const SLOT_HEADER_SIZE = 0x24c;
const NAME_SIZE = 0x22;
export const SLOT_COUNT = 10;

export interface CharacterSummary {
  readonly slot: number;
  readonly name: string;
  readonly level: number;
  readonly secondsPlayed: number;
}

export interface Profile {
  readonly steamId: bigint;
  readonly characters: CharacterSummary[];
}

export function profileEntry(entries: readonly Sl2Entry[]): Sl2Entry {
  const entry = entries[PROFILE_ENTRY_INDEX];
  if (!entry) throw new Sl2FormatError('no-profile-block', 'Elden Ring save has no profile block.');
  return entry;
}

function readName(save: Uint8Array, offset: number): string {
  let end = 0;
  while (end < NAME_SIZE && readUint16LE(save, offset + end) !== 0) end += 2;
  return decodeUtf16LE(save.subarray(offset, offset + end));
}

export function readProfile(save: Uint8Array, entries: readonly Sl2Entry[]): Profile {
  const base = profileEntry(entries).bodyOffset;
  const characters: CharacterSummary[] = [];

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (save[base + SLOT_OCCUPANCY_OFFSET + slot] !== 1) continue;
    const header = base + SLOT_HEADERS_OFFSET + slot * SLOT_HEADER_SIZE;
    const name = readName(save, header);
    // A save that replaced a character can keep the flag set while the summary
    // header is cleared, which would otherwise surface as a nameless slot.
    if (name === '') continue;
    characters.push({
      slot,
      name,
      level: readInt32LE(save, header + NAME_SIZE),
      secondsPlayed: readInt32LE(save, header + NAME_SIZE + 4),
    });
  }

  return { steamId: readBigUint64LE(save, base + STEAM_ID_OFFSET), characters };
}
