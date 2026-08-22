import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SaveError } from '../src/errors.ts';
import { A_RECIPIENT, A_SENDER } from './fixture.ts';
import { Cancelled } from '../web/jobs.ts';
import { isReportable, maskSteamIds, reportingWanted } from '../web/reportable.ts';

test('a coded failure is the user being told, not a bug', () => {
  assert.equal(isReportable(new SaveError('not-a-save', 'not a save file')), false);
});

test('a coded failure crossing back from the worker is not a bug either', () => {
  const failure = { file: 'ER0000.sl2', code: 'truncated', message: 'ends early' };

  assert.equal(isReportable(failure), false);
});

test('an uncoded failure from the worker is a bug the worker swallowed', () => {
  const failure = { file: 'ER0000.sl2', code: null, message: 'x is not a function' };

  assert.equal(isReportable(failure), true);
});

test('a cancellation is the user hitting the button', () => {
  assert.equal(isReportable(new Cancelled('cancelled')), false);
});

test('anything else is a bug', () => {
  assert.equal(isReportable(new TypeError('x is not a function')), true);
});

test('masks a Steam ID wherever one turns up', () => {
  assert.equal(
    maskSteamIds(`${A_SENDER}/ER0000.sl2 unpacks to more than this page will hold.`),
    '<steam-id>/ER0000.sl2 unpacks to more than this page will hold.',
  );
});

test('masks every one of them, not just the first', () => {
  assert.equal(maskSteamIds(`${A_SENDER} -> ${A_RECIPIENT}`), '<steam-id> -> <steam-id>');
});

test('leaves alone a run of digits that cannot be a Steam ID', () => {
  assert.equal(maskSteamIds('1234567890123456 and 123456789012345678'), '1234567890123456 and 123456789012345678');
});

test('leaves ordinary words alone', () => {
  assert.equal(maskSteamIds('x is not a function'), 'x is not a function');
});

test('reports until someone says not to', () => {
  assert.equal(reportingWanted(null), true);
});

test('stops reporting once someone has', () => {
  assert.equal(reportingWanted('off'), false);
});

test('reports again when they change their mind', () => {
  assert.equal(reportingWanted('on'), true);
});

test('reads anything it does not recognise as no answer at all', () => {
  assert.equal(reportingWanted('yes please'), true);
});
