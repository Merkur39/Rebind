/// <reference types="vite/client" />
import * as Sentry from '@sentry/browser';
import { isFailure, watchWorkers } from './jobs.ts';
import { isReportable, maskSteamIds, reportingWanted } from './reportable.ts';

/**
 * The site's own DSN. A browser SDK ships whatever key it is given, so this one
 * is public whichever door it comes through; written here rather than read from
 * the environment, a build from anywhere still reports.
 */
const DSN =
  'https://695ed62f9f0c78a83161ecccbd116434@o4511954782388224.ingest.de.sentry.io/4511954797002832';

const REPORTING_KEY = 'rebind.reporting';

/** Whether the page may send, as the person in front of it last left it. */
export function reportingOn(): boolean {
  return reportingWanted(localStorage.getItem(REPORTING_KEY));
}

export function setReporting(on: boolean): void {
  localStorage.setItem(REPORTING_KEY, on ? 'on' : 'off');
}

// Kept at hand rather than made inside init: every worker this page starts has
// to be handed over as it appears, and cancelling a job makes a new one.
const workers = Sentry.webWorkerIntegration({ worker: [] });

/** The last thing every event goes through, whoever raised it. */
function masked(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = maskSteamIds(value.value);
  }
  if (event.message) event.message = maskSteamIds(event.message);
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = maskSteamIds(crumb.message);
  }
  return event;
}

export function startMonitoring(): void {
  Sentry.init({
    dsn: DSN,
    // A dev server rebuilding on every keystroke is not worth an issue.
    enabled: import.meta.env.PROD,
    // Everything this page is handed is someone's save file, and every file
    // name it sees is theirs. None of it belongs in a bug report.
    sendDefaultPii: false,
    // Nothing leaves the browser: there is no request here to trace.
    tracesSampleRate: 0,
    // Sentry would otherwise report back, on unload, a count of what it chose
    // not to send — which is every file this page turned away, and every error
    // at all once someone has said no. That is a request either way, and the
    // page says there is none.
    sendClientReports: false,
    // The one place anything can leave from, so the one place worth asking
    // both questions: whether this is a bug, and whether it is still wanted.
    beforeSend: (event, hint) =>
      reportingOn() && isReportable(hint.originalException) ? masked(event) : null,
    integrations: (defaults) => [
      // Sessions are how Sentry counts visitors, sent on every load whether or
      // not anything went wrong. The page promises no such thing, so nothing
      // leaves here until something breaks.
      ...defaults.filter((integration) => integration.name !== 'BrowserSession'),
      workers,
    ],
  });

  watchWorkers((worker) => workers.addWorker(worker));
}

/**
 * Sends on a failure the page has already shown the user, if it was a bug at
 * all. A failure that crossed back from the worker carries the error thrown
 * there, whose stack points at the code that broke; its message alone would
 * only point back here.
 */
export function report(error: unknown): void {
  if (!isReportable(error)) return;
  Sentry.captureException(isFailure(error) ? (error.cause ?? new Error(error.message)) : error);
}
