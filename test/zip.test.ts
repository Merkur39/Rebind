import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { bytesEqual, decodeUtf8, encodeUtf8 } from '../src/bytes.ts';
import { openZip } from '../src/zip.ts';

const at = new Date('2026-08-20T10:00:00.000Z');

describe('openZip', () => {
  it('writes entries an unzipper reads back', () => {
    const zip = openZip(at);
    zip.add('first.txt', encodeUtf8('one'));
    zip.add('second.txt', encodeUtf8('two'));

    const files = unzipSync(zip.finish());

    assert.deepEqual(Object.keys(files).sort(), ['first.txt', 'second.txt']);
    assert.equal(decodeUtf8(files['first.txt']!), 'one');
    assert.equal(decodeUtf8(files['second.txt']!), 'two');
  });

  it('writes the same archive twice for the same entries', () => {
    // Stamped from the date it is given rather than from the clock, so a caller
    // can prove two runs produced the same file.
    const build = () => {
      const zip = openZip(at);
      zip.add('save.sl2', encodeUtf8('bytes'));
      return zip.finish();
    };

    assert.ok(bytesEqual(build(), build()));
  });

  it('carries megabytes as readily as a few bytes', () => {
    const big = new Uint8Array(4 << 20).fill(7);
    const zip = openZip(at);
    zip.add('big.bin', big);

    const files = unzipSync(zip.finish());

    assert.ok(bytesEqual(files['big.bin']!, big));
  });
});
