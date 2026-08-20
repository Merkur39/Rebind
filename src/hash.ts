/**
 * MD5 and SHA-256 in plain TypeScript.
 *
 * The browser's WebCrypto has no MD5 at all, and its SHA-256 is asynchronous,
 * which would make every caller async for no benefit. Implementing both keeps
 * the save handling synchronous and byte-identical in Node and in the browser.
 * Both are checked against node:crypto in the tests.
 */

export function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** Appends the 0x80 marker, zero padding and the bit length in `lengthOrder`. */
function pad(message: Uint8Array, lengthOrder: 'le' | 'be'): DataView {
  const paddedLength = (((message.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  // Saves are far below 2^32 bytes, so the high word is always zero.
  const bitLength = message.length * 8;
  if (lengthOrder === 'le') {
    view.setUint32(paddedLength - 8, bitLength >>> 0, true);
    view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);
  } else {
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
    view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  }
  return view;
}

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/** K[i] = floor(abs(sin(i + 1)) * 2^32) */
const MD5_SINES = new Uint32Array(64);
for (let i = 0; i < 64; i++) MD5_SINES[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);

function rotateLeft(value: number, by: number): number {
  return (value << by) | (value >>> (32 - by));
}

export function md5(message: Uint8Array): Uint8Array {
  const view = pad(message, 'le');
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const words = new Uint32Array(16);
  for (let chunk = 0; chunk < view.byteLength; chunk += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(chunk + i * 4, true);

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let mixed: number;
      let word: number;
      if (i < 16) {
        mixed = (b & c) | (~b & d);
        word = i;
      } else if (i < 32) {
        mixed = (d & b) | (~d & c);
        word = (5 * i + 1) % 16;
      } else if (i < 48) {
        mixed = b ^ c ^ d;
        word = (3 * i + 5) % 16;
      } else {
        mixed = c ^ (b | ~d);
        word = (7 * i) % 16;
      }

      const rotated = rotateLeft((a + mixed + MD5_SINES[i]! + words[word]!) | 0, MD5_SHIFTS[i]!);
      a = d;
      d = c;
      c = b;
      b = (b + rotated) | 0;
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  const digest = new Uint8Array(16);
  const out = new DataView(digest.buffer);
  out.setUint32(0, a0 >>> 0, true);
  out.setUint32(4, b0 >>> 0, true);
  out.setUint32(8, c0 >>> 0, true);
  out.setUint32(12, d0 >>> 0, true);
  return digest;
}

/** First 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, by: number): number {
  return (value >>> by) | (value << (32 - by));
}

export function sha256(message: Uint8Array): Uint8Array {
  const view = pad(message, 'be');
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const schedule = new Uint32Array(64);
  for (let chunk = 0; chunk < view.byteLength; chunk += 64) {
    for (let i = 0; i < 16; i++) schedule[i] = view.getUint32(chunk + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const previous = schedule[i - 15]!;
      const recent = schedule[i - 2]!;
      const s0 = rotateRight(previous, 7) ^ rotateRight(previous, 18) ^ (previous >>> 3);
      const s1 = rotateRight(recent, 17) ^ rotateRight(recent, 19) ^ (recent >>> 10);
      schedule[i] = (schedule[i - 16]! + s0 + schedule[i - 7]! + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = state as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const s1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choose = (e! & f!) ^ (~e! & g!);
      const temp1 = (h! + s1 + choose + SHA256_K[i]! + schedule[i]!) | 0;
      const s0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temp2 = (s0 + majority) | 0;

      h = g;
      g = f;
      f = e;
      e = (d! + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    const round = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) state[i] = (state[i]! + round[i]!) | 0;
  }

  const digest = new Uint8Array(32);
  const out = new DataView(digest.buffer);
  for (let i = 0; i < 8; i++) out.setUint32(i * 4, state[i]! >>> 0, false);
  return digest;
}

export function sha256Hex(message: Uint8Array): string {
  return toHex(sha256(message));
}
