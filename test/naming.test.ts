import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bundleName, packName, reboundName } from '../src/naming.ts';

describe('reboundName', () => {
  it('keeps the name exactly as it was', () => {
    // Runners keep libraries of saves named after the point they practise, and
    // a save organiser renames on load. The name is the only place that
    // information lives, so it has to survive a round trip untouched.
    assert.equal(reboundName('Avant Margit.sl2'), 'Avant Margit.sl2');
    assert.equal(reboundName('ER0000.sl2.bak'), 'ER0000.sl2');
  });

  it('leaves a name with no extension without one', () => {
    // A save organiser moves the file to exactly the name typed in, extension
    // and all, so a practice library is a list of bare names. Appending .sl2
    // would single out every save that came back through here.
    assert.equal(reboundName('03 BOSS 01 Abductors'), '03 BOSS 01 Abductors');
  });

  it('keeps the folders a save sat in, which the archive carries with it', () => {
    assert.equal(reboundName('DP/03 - SKIP/Avant Margit'), 'DP/03 - SKIP/Avant Margit');
    assert.equal(reboundName('DP/03 - SKIP/Avant Margit.sl2'), 'DP/03 - SKIP/Avant Margit.sl2');
  });

  it('turns a pack name into a save name', () => {
    // A pack is a container: unwrapping it yields a save, which is an .sl2 the
    // sender never named themselves.
    assert.equal(reboundName('Avant Margit.savepack.zip'), 'Avant Margit.sl2');
    assert.equal(reboundName('Practice set.zip'), 'Practice set.sl2');
  });
});

describe('packName', () => {
  const at = new Date('2026-08-20T10:11:12.000Z');

  it('names the pack after the only save it holds, without the folders it sat in', () => {
    // The archive is one file: the tree belongs inside it, not in its name, and
    // a slash in a download name is not a name a browser will keep.
    assert.equal(packName(['DP/03 - SKIP/Avant Margit.sl2'], at), 'Avant Margit.savepack.zip');
  });

  it('lends the pack the name of the only save it holds', () => {
    assert.equal(packName(['Avant Margit.sl2'], at), 'Avant Margit.savepack.zip');
  });

  it('dates the pack when several saves have no name in common', () => {
    assert.equal(packName(['a.sl2', 'b.sl2'], at), 'elden-ring-2026-08-20.savepack.zip');
  });

  it('does not stack extensions when re-packing a pack', () => {
    assert.equal(packName(['run.savepack.zip'], at), 'run.savepack.zip');
  });
});

describe('bundleName', () => {
  it('drops the folders too, the zip being one file like any other', () => {
    assert.equal(bundleName('DP/03 - SKIP/Practice set.savepack.zip'), 'Practice set.zip');
  });

  it('names the zip of converted saves after the pack they came from', () => {
    assert.equal(bundleName('Practice set.savepack.zip'), 'Practice set.zip');
    assert.equal(bundleName('ER0000.sl2'), 'ER0000.zip');
  });
});
