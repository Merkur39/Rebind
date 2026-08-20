/**
 * The little bit of Buffer that the save handling actually needs, on plain
 * Uint8Array, so the same code runs in Node and in the browser.
 */

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function readInt32LE(bytes: Uint8Array, offset: number): number {
  return viewOf(bytes).getInt32(offset, true);
}

export function readUint32LE(bytes: Uint8Array, offset: number): number {
  return viewOf(bytes).getUint32(offset, true);
}

export function readUint16LE(bytes: Uint8Array, offset: number): number {
  return viewOf(bytes).getUint16(offset, true);
}

export function readBigUint64LE(bytes: Uint8Array, offset: number): bigint {
  return viewOf(bytes).getBigUint64(offset, true);
}

export function writeBigUint64LE(bytes: Uint8Array, value: bigint, offset: number): void {
  viewOf(bytes).setBigUint64(offset, value, true);
}

export function uint64LE(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  writeBigUint64LE(bytes, value, 0);
  return bytes;
}

/** Index of `needle` at or after `from`, or -1. Uint8Array has no such method. */
export function indexOfSequence(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  if (needle.length === 0) return from;
  const last = haystack.length - needle.length;
  const first = needle[0]!;

  for (let start = Math.max(0, from); start <= last; start++) {
    if (haystack[start] !== first) continue;
    let offset = 1;
    while (offset < needle.length && haystack[start + offset] === needle[offset]) offset++;
    if (offset === needle.length) return start;
  }
  return -1;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function decodeAscii(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

export function decodeUtf16LE(bytes: Uint8Array): string {
  return new TextDecoder('utf-16le').decode(bytes);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Copies `source` into `target` at `offset`, like Buffer.copy. */
export function copyInto(target: Uint8Array, source: Uint8Array, offset: number): void {
  target.set(source, offset);
}
