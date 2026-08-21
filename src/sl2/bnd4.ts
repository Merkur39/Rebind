import { bytesEqual, decodeAscii, readBigUint64LE, readInt32LE, readUint32LE } from '../bytes.ts';
import { md5 } from '../hash.ts';
import { SaveError } from '../errors.ts';

/**
 * Elden Ring stores its saves in a BND4 container: a 0x40 byte header, a table
 * of fixed-size entry headers, then one block per entry. Every block starts
 * with the MD5 digest of the bytes that follow it, and the game refuses a save
 * whose digests do not match its bodies.
 */
export interface Sl2Entry {
  readonly index: number;
  /** Offset of the 16 byte MD5 digest that guards this entry. */
  readonly checksumOffset: number;
  /** Offset of the entry payload, right after the digest. */
  readonly bodyOffset: number;
  readonly bodySize: number;
}

const MAGIC = 'BND4';
const DIGEST_SIZE = 0x10;
const ENTRY_TABLE_OFFSET = 0x40;
const EXPECTED_ENTRY_COUNT = 12;

export class Sl2FormatError extends SaveError {}

export function parseSl2(save: Uint8Array): Sl2Entry[] {
  if (save.length < ENTRY_TABLE_OFFSET || decodeAscii(save.subarray(0, 4)) !== MAGIC) {
    throw new Sl2FormatError('not-a-save', 'This file is not an Elden Ring save (missing BND4 signature).');
  }

  const entryCount = readInt32LE(save, 0x0c);
  if (entryCount !== EXPECTED_ENTRY_COUNT) {
    throw new Sl2FormatError(
      'unexpected-layout',
      `Unexpected Elden Ring save layout: ${entryCount} entries instead of ${EXPECTED_ENTRY_COUNT}.`,
    );
  }

  const entryHeaderSize = Number(readBigUint64LE(save, 0x20));
  const entries: Sl2Entry[] = [];
  for (let index = 0; index < entryCount; index++) {
    const header = ENTRY_TABLE_OFFSET + index * entryHeaderSize;
    if (header + entryHeaderSize > save.length) {
      throw new Sl2FormatError('truncated', 'Elden Ring save is truncated: the entry table is incomplete.');
    }

    const blockSize = Number(readBigUint64LE(save, header + 0x08));
    const checksumOffset = readUint32LE(save, header + 0x10);
    if (blockSize < DIGEST_SIZE || checksumOffset + blockSize > save.length) {
      throw new Sl2FormatError('truncated', 'Elden Ring save is truncated: an entry runs past the end of the file.');
    }

    entries.push({
      index,
      checksumOffset,
      bodyOffset: checksumOffset + DIGEST_SIZE,
      bodySize: blockSize - DIGEST_SIZE,
    });
  }
  return entries;
}

function digestOf(save: Uint8Array, entry: Sl2Entry): Uint8Array {
  return md5(save.subarray(entry.bodyOffset, entry.bodyOffset + entry.bodySize));
}

/** Returns the indices of the entries whose stored digest no longer matches. */
export function verifyChecksums(save: Uint8Array, entries: readonly Sl2Entry[]): number[] {
  return entries
    .filter((entry) => {
      const stored = save.subarray(entry.checksumOffset, entry.checksumOffset + DIGEST_SIZE);
      return !bytesEqual(stored, digestOf(save, entry));
    })
    .map((entry) => entry.index);
}

/** Rewrites every stored digest so the save is accepted by the game again. */
export function refreshChecksums(save: Uint8Array, entries: readonly Sl2Entry[]): void {
  for (const entry of entries) save.set(digestOf(save, entry), entry.checksumOffset);
}

/**
 * Refuses a save whose blocks no longer match the digests guarding them. The
 * game checks the same twelve, so a save that fails here is one it would turn
 * down: a download cut short, a copy half written, an edit by a tool that did
 * not rewrite them. Nothing upstream notices — the container still parses and
 * the profile still reads — so it has to be asked outright.
 */
export function assertChecksums(save: Uint8Array, entries: readonly Sl2Entry[]): void {
  const bad = verifyChecksums(save, entries);
  if (bad.length > 0) {
    throw new Sl2FormatError(
      'save-corrupted',
      `This save is damaged: ${bad.length} of its ${entries.length} blocks do not match their checksum.`,
    );
  }
}
