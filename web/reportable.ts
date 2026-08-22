import { codeOf } from '../src/errors.ts';
import { Cancelled, isFailure } from './jobs.ts';

/**
 * Which failures are worth a bug report. Everything this page can name is
 * already shown to the user in their own language and is usually the file's
 * fault, not the code's; forwarding those would bury the ones nobody expected.
 * What is left — a cancellation aside — is a bug, whether thrown here or
 * swallowed by the worker into a failure it could put no code on.
 */
export function isReportable(error: unknown): boolean {
  if (error instanceof Cancelled) return false;
  if (isFailure(error)) return error.code === null;
  return codeOf(error) === null;
}

/**
 * Blanks out any Steam ID on its way out. Nothing sent is meant to carry one —
 * every message that names a file is a coded failure, and those stay here — but
 * a bug report is written by whatever broke, and this page is about the one
 * number nobody should have to hand over to have a crash looked at.
 */
export function maskSteamIds(text: string): string {
  return text.replace(/\b\d{17}\b/g, '<steam-id>');
}

/**
 * Whether the page may still send. Reporting rests on there being an interest
 * in fixing what breaks, which holds right up until the person in front of it
 * says otherwise — so the answer is yes until it is stored as no, and never the
 * other way round.
 */
export function reportingWanted(stored: string | null): boolean {
  return stored !== 'off';
}
