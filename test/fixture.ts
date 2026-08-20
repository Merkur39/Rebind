import { createHash } from 'node:crypto';

/** Layout constants of a real ER0000.sl2, verified against a live save file. */
export const SLOT_COUNT = 10;
export const CHAR_ENTRY_SIZE = 0x280010;
export const PROFILE_ENTRY_SIZE = 0x60010;
export const TRAILER_ENTRY_SIZE = 0x240020;
export const DATA_START = 0x300;
export const FILE_SIZE = 0x1ba03d0;

export interface FixtureSlot {
  name: string;
  level: number;
  secondsPlayed: number;
  /** Offsets inside the character body where the owner Steam ID is echoed. */
  steamIdEchoes?: number[];
}

export interface FixtureOptions {
  steamId: bigint;
  slots: ReadonlyArray<FixtureSlot | null>;
}

/**
 * Builds a synthetic but structurally faithful ER0000.sl2. Everything the real
 * format specifies is reproduced; the payload bytes are deterministic filler so
 * tests can assert that untouched regions survive a rebind byte for byte.
 */
export function buildSl2(options: FixtureOptions): Buffer {
  const buf = Buffer.alloc(FILE_SIZE);

  buf.write('BND4', 0, 'ascii');
  buf.writeInt32LE(0, 0x04);
  buf.writeInt32LE(0x10000, 0x08);
  buf.writeInt32LE(12, 0x0c);
  buf.writeInt32LE(0x40, 0x10);
  buf.write('00000001', 0x18, 'ascii');
  buf.writeBigUInt64LE(0x20n, 0x20);
  buf.writeBigUInt64LE(BigInt(DATA_START), 0x28);
  buf[0x30] = 1;
  buf[0x31] = 0x20;

  const sizes = [
    ...Array<number>(SLOT_COUNT).fill(CHAR_ENTRY_SIZE),
    PROFILE_ENTRY_SIZE,
    TRAILER_ENTRY_SIZE,
  ];
  let offset = DATA_START;
  const offsets: number[] = [];
  sizes.forEach((size, index) => {
    const header = 0x40 + index * 0x20;
    buf.writeUInt32LE(0x50, header);
    buf.writeInt32LE(-1, header + 0x04);
    buf.writeBigUInt64LE(BigInt(size), header + 0x08);
    buf.writeUInt32LE(offset, header + 0x10);
    buf.writeInt32LE(448 + index * 26, header + 0x14);
    offsets.push(offset);
    offset += size;
  });

  // Region between the entry headers and the first block is not understood but
  // must survive untouched, so fill it with a recognisable pattern.
  for (let i = 0x1c0; i < DATA_START; i++) buf[i] = (i * 7) & 0xff;

  const profileBody = offsets[SLOT_COUNT]! + 0x10;
  buf.writeBigUInt64LE(options.steamId, profileBody + 0x04);

  const steamIdBytes = Buffer.alloc(8);
  steamIdBytes.writeBigUInt64LE(options.steamId);

  options.slots.forEach((slot, index) => {
    const body = offsets[index]! + 0x10;
    // Deterministic filler so an untouched character block is provably intact.
    for (let i = 0; i < 0x400; i++) buf[body + i] = (index * 31 + i) & 0xff;
    if (!slot) return;
    buf[profileBody + 0x3a + index] = 1;
    const header = profileBody + 0x195e + index * 0x24c;
    buf.write(slot.name, header, 0x22, 'utf16le');
    buf.writeInt32LE(slot.level, header + 0x22);
    buf.writeInt32LE(slot.secondsPlayed, header + 0x26);
    for (const echo of slot.steamIdEchoes ?? []) steamIdBytes.copy(buf, body + echo);
  });

  sizes.forEach((size, index) => {
    const start = offsets[index]!;
    const digest = createHash('md5').update(buf.subarray(start + 0x10, start + size)).digest();
    digest.copy(buf, start);
  });

  return buf;
}

/** Flips a byte in place, to prove that a checksum notices. */
export function flipByte(buffer: Uint8Array, offset: number): void {
  buffer[offset] = (buffer[offset] ?? 0) ^ 0xff;
}

/**
 * Steam IDs for tests and documentation. The individual-account range starts at
 * 76561197960265728, which is account number zero: structurally valid, and
 * assigned to nobody. Real Steam IDs identify real people, so none appear here.
 */
export const A_SENDER = 76561197960265728n;
export const A_RECIPIENT = 76561197960265729n;
export const A_THIRD_PARTY = 76561197960265730n;
