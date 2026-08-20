import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { md5, sha256Hex, toHex } from '../src/hash.ts';

const utf8 = (text: string) => new TextEncoder().encode(text);

describe('md5', () => {
  it('matches the published test vectors', () => {
    assert.equal(toHex(md5(utf8(''))), 'd41d8cd98f00b204e9800998ecf8427e');
    assert.equal(toHex(md5(utf8('abc'))), '900150983cd24fb0d6963f7d28e17f72');
    assert.equal(toHex(md5(utf8('message digest'))), 'f96b697d7cb7938d525a2f31aaf161d0');
    assert.equal(
      toHex(md5(utf8('abcdefghijklmnopqrstuvwxyz'))),
      'c3fcd3d76192e4007dfb496cca67e13b',
    );
  });

  it('returns sixteen bytes', () => {
    assert.equal(md5(utf8('anything')).length, 16);
  });
});

describe('sha256Hex', () => {
  it('matches the published test vectors', () => {
    assert.equal(sha256Hex(utf8('')), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(sha256Hex(utf8('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('both digests, against node:crypto', () => {
  /** Deterministic pseudo-random bytes, so a failure is reproducible. */
  function noise(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    let state = 0x12345678;
    for (let i = 0; i < length; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      bytes[i] = (state >>> 16) & 0xff;
    }
    return bytes;
  }

  // Lengths around every padding boundary, plus sizes a save actually reaches.
  const lengths = [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 0x10000, 0x280000];

  for (const length of lengths) {
    it(`agrees on ${length} bytes`, () => {
      const bytes = noise(length);

      assert.equal(toHex(md5(bytes)), createHash('md5').update(bytes).digest('hex'), 'md5');
      assert.equal(sha256Hex(bytes), createHash('sha256').update(bytes).digest('hex'), 'sha256');
    });
  }
});
