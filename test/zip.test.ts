import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, zipSync } from 'fflate';
import { bytesEqual, decodeUtf8, encodeUtf8 } from '../src/bytes.ts';
import { listZip, openZip, readZip } from '../src/zip.ts';

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

describe('listZip', () => {
  it('names what an archive holds without unpacking any of it', () => {
    const archive = zipSync({
      'notes.txt': encodeUtf8('hello'),
      'saves/one': new Uint8Array(1000).fill(1),
      'saves/deep/two': new Uint8Array(2000).fill(2),
    });

    const entries = listZip(archive);

    assert.deepEqual(
      entries.map((entry) => [entry.name, entry.size]),
      [
        ['notes.txt', 5],
        ['saves/one', 1000],
        ['saves/deep/two', 2000],
      ],
    );
  });

  it('says an archive is not one when it is not', () => {
    assert.throws(() => listZip(encodeUtf8('hello world')), /archive|zip/i);
  });
});

describe('readZip', () => {
  it('hands over one entry at a time, in the order they were written', () => {
    const archive = zipSync({
      'first.txt': encodeUtf8('one'),
      'folder/second.txt': encodeUtf8('two'),
    });
    const seen: string[] = [];

    readZip(archive, (name, bytes) => seen.push(`${name}=${decodeUtf8(bytes)}`));

    assert.deepEqual(seen, ['first.txt=one', 'folder/second.txt=two']);
  });

  it('carries an entry of megabytes as readily as a few bytes', () => {
    const big = new Uint8Array(4 << 20).fill(9);
    const archive = zipSync({ 'big.bin': big });
    let read: Uint8Array | null = null;

    readZip(archive, (_name, bytes) => (read = bytes));

    assert.ok(bytesEqual(read!, big));
  });

  it('skips an entry too big to be a save rather than swallowing the archive', () => {
    // A zip announcing a huge entry is either a bomb or not what we are here
    // for; either way it is not worth the memory.
    const archive = zipSync({ 'small': encodeUtf8('kept') });
    const seen: string[] = [];

    readZip(archive, (name) => seen.push(name), 2);

    assert.deepEqual(seen, []);
  });
});

describe('openZip, on a date a zip cannot record', () => {
  const roundTrip = (mtime: Date) => {
    const zip = openZip(mtime);
    zip.add('save.sl2', encodeUtf8('bytes'));
    return unzipSync(zip.finish());
  };

  it('stamps the earliest it can rather than refusing the archive', () => {
    // A zip records dates as DOS timestamps: 1980 to 2099, nothing outside.
    assert.equal(decodeUtf8(roundTrip(new Date('1970-01-01T00:00:00.000Z'))['save.sl2']!), 'bytes');
  });

  it('does the same at the other end of the range', () => {
    assert.equal(decodeUtf8(roundTrip(new Date('2500-01-01T00:00:00.000Z'))['save.sl2']!), 'bytes');
  });

  it('copes with a date that is not one', () => {
    assert.equal(decodeUtf8(roundTrip(new Date(NaN))['save.sl2']!), 'bytes');
  });
});
