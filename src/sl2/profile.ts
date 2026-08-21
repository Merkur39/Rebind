import { decodeUtf16LE, readBigUint64LE, readInt32LE, readUint16LE } from '../bytes.ts';
import type { Sl2Entry } from './bnd4.ts';
import { Sl2FormatError } from './bnd4.ts';

/**
 * Entry 10 of the container holds the profile block: the Steam account the save
 * belongs to, one byte per slot saying whether it holds a character, then one
 * summary header per slot. All the offsets below are relative to the start of
 * that block and were verified against real saves.
 *
 * That single byte is the only thing that says a character exists, and the game
 * goes by nothing else. Deleting a character clears it and leaves the rest
 * behind: the summary header still carries the name, and the character's own
 * block still holds it in full. Two earlier readings got this wrong — byte 0x3a
 * of the block, which is not a flag at all and is clear on every save of a
 * practice library the game loads without complaint, then the presence of a
 * name, which lists a character the game does not. EldenRingSaveCopier reads
 * the same byte, at 0x1901D04 of a save laid out as usual.
 */
export const PROFILE_ENTRY_INDEX = 10;
export const STEAM_ID_OFFSET = 0x04;
export const SLOT_ACTIVE_OFFSET = 0x1954;
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
    if (save[base + SLOT_ACTIVE_OFFSET + slot] !== 1) continue;
    const header = base + SLOT_HEADERS_OFFSET + slot * SLOT_HEADER_SIZE;
    // Nothing to show for a slot the game marks as used but never named, and a
    // nameless entry in a list of characters describes nothing.
    const name = readName(save, header);
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
