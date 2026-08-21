import { codeOf } from '../src/errors.ts';
import { formatCharacters, formatSize } from '../src/format.ts';
import type { IncomingSummary } from '../src/incoming.ts';
import type { SkippedSave } from '../src/pack.ts';
import { assertSteamId } from '../src/sl2/rebind.ts';
import { UI, errorMessage, pickLanguage, type Language } from './i18n.ts';
import {
  Cancelled,
  cancelJob,
  inspectFiles,
  isFailure,
  packFiles,
  rebindFile,
  type OnProgress,
} from './jobs.ts';

const pick = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const dropZone = pick<HTMLLabelElement>('#drop');
const fileInput = pick<HTMLInputElement>('#file');
const fileReport = pick<HTMLDivElement>('#file-report');
const steamIdInput = pick<HTMLInputElement>('#steamid');
const steamIdError = pick<HTMLParagraphElement>('#steamid-error');
const convertButton = pick<HTMLButtonElement>('#convert');
const convertCancel = pick<HTMLButtonElement>('#convert-cancel');

const exportDropZone = pick<HTMLLabelElement>('#export-drop');
const exportFileInput = pick<HTMLInputElement>('#export-file');
const exportReport = pick<HTMLDivElement>('#export-report');
const noteInput = pick<HTMLInputElement>('#note');
const exportButton = pick<HTMLButtonElement>('#export');
const exportCancel = pick<HTMLButtonElement>('#export-cancel');

/** The strip a tab reports through: how far along, and how it ended. */
interface Strip {
  readonly progress: HTMLElement;
  readonly bar: HTMLProgressElement;
  readonly step: HTMLElement;
  readonly cancel: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly skipped: HTMLElement;
}

const convertStrip: Strip = {
  progress: pick('#convert-progress'),
  bar: pick<HTMLProgressElement>('#convert-bar'),
  step: pick('#convert-step'),
  cancel: convertCancel,
  status: pick('#status'),
  skipped: pick('#convert-skipped'),
};

const exportStrip: Strip = {
  progress: pick('#export-progress'),
  bar: pick<HTMLProgressElement>('#export-bar'),
  step: pick('#export-step'),
  cancel: exportCancel,
  status: pick('#export-status'),
  skipped: pick('#export-skipped'),
};

const STEAM_ID_KEY = 'rebind.steamid';
const LANGUAGE_KEY = 'rebind.language';

let language: Language = pickLanguage(navigator.languages ?? [navigator.language], localStorage.getItem(LANGUAGE_KEY));
/** What the page keeps of a file: its handle, and what it says it holds. */
interface Held {
  readonly file: File;
  readonly name: string;
  readonly summary: IncomingSummary;
}
let loaded: Held | null = null;
let toPack: Held[] = [];
/** True while the worker is busy, so no second job takes over its replies. */
let busy = false;

const t = () => UI[language];

function show(element: HTMLElement, html: string): void {
  element.innerHTML = html;
  element.hidden = false;
}

function escape(text: string): string {
  return text.replace(/[<>&]/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** Reads an error the way the user should see it, in the current language. */
function readableError(error: unknown): string {
  // A worker says which file it choked on; an error thrown here cannot.
  if (isFailure(error)) return `${error.file} — ${errorMessage(language, error.code, error.message)}`;
  const code = codeOf(error);
  return errorMessage(language, code, code ? (error as Error).message : t().unreadable);
}

/**
 * What a file could not hand over, listed under the line that says what it did.
 * Reading the saves is what proves them sound, so this is the first the user
 * hears of it: the report drawn when the file was dropped came from the
 * manifest, which is the sender's word rather than the bytes'.
 */
function showSkipped(strip: Strip, skipped: readonly SkippedSave[]): void {
  if (skipped.length === 0) {
    strip.skipped.hidden = true;
    return;
  }
  const items = skipped
    .map(
      (save) =>
        `<li><span class="save-name">${escape(save.fileName)}</span>${escape(
          errorMessage(language, save.code, save.message),
        )}</li>`,
    )
    .join('');
  show(
    strip.skipped,
    `<p class="skipped-head">${escape(t().skipped(skipped.length))}</p>
     <ul class="skipped-list">${items}</ul>`,
  );
}


/** The Steam ID typed in, or null with the reason shown to the user. */
function currentSteamId(): bigint | null {
  const raw = steamIdInput.value.trim();
  if (raw === '') {
    steamIdError.hidden = true;
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    show(steamIdError, escape(t().notDigits));
    return null;
  }
  try {
    const steamId = BigInt(raw);
    assertSteamId(steamId);
    steamIdError.hidden = true;
    return steamId;
  } catch (error) {
    show(steamIdError, escape(readableError(error)));
    return null;
  }
}

function refreshButtons(): void {
  // Evaluated before the test, not inside it: `||` would short-circuit and skip
  // validating the Steam ID whenever no file is loaded, so a bad id typed first
  // would never be reported.
  const steamId = currentSteamId();
  convertButton.disabled = loaded === null || steamId === null || busy;
  exportButton.disabled = toPack.length === 0 || busy;
  // The strips stay on screen between jobs, so these buttons have to say for
  // themselves that there is nothing left to call off.
  convertCancel.disabled = !busy;
  exportCancel.disabled = !busy;
}

function describe(incoming: IncomingSummary, name: string): string {
  const total = incoming.saves.reduce((bytes, entry) => bytes + entry.size, 0);
  const kind = incoming.kind === 'savepack' ? t().savepack : t().saveFile;
  const count = incoming.saves.length > 1 ? ` · ${t().saveCount(incoming.saves.length)}` : '';
  const note = incoming.note ? `<p class="note">“${escape(incoming.note)}”</p>` : '';

  // One card per save. A pack holds a set, and without a frame around each one
  // the names, accounts and slots of several saves run into each other.
  const bodies = incoming.saves
    .map((entry) => {
      const characters = formatCharacters([...entry.characters])
        .map((line) => `<li>${escape(line.trim())}</li>`)
        .join('');
      // A lone save needs neither: the header above already gives its name and
      // size, and repeating them inside the card only adds noise.
      const label = entry.fileName ? `<p class="save-name">${escape(entry.fileName)}</p>` : '';
      const size = incoming.saves.length > 1 ? ` · ${formatSize(entry.size)}` : '';
      return `<li class="save">
        ${label}
        <p class="muted">${escape(t().fromAccount)} ${entry.steamId}${size}</p>
        <ul class="characters">${characters}</ul>
      </li>`;
    })
    .join('');

  return `
    <p class="filename">${escape(name)} <span class="muted">· ${escape(kind)}${count} · ${formatSize(total)}</span></p>
    ${note}
    <ol class="saves">${bodies}</ol>`;
}

function redrawReports(): void {
  if (loaded) show(fileReport, describe(loaded.summary, loaded.name));
  if (toPack.length > 0) {
    show(exportReport, toPack.map((entry) => describe(entry.summary, entry.name)).join('<hr />'));
  }
}

/**
 * Shows where the worker is, and offers to stop it. A strip stays up once the
 * first file has been dropped: it is already saying something by then, and the
 * count it ends on describes what the page is now holding.
 */
function stepReport(strip: Strip, label: (done: number, total: number, name: string) => string): OnProgress {
  strip.skipped.hidden = true;
  strip.bar.value = 0;
  strip.step.textContent = '';
  strip.progress.classList.remove('unstarted');
  return (done, total, name) => {
    strip.bar.value = done / total;
    strip.step.textContent = label(done, total, name);
  };
}

/** Runs one worker job with the page locked and the strip live. */
async function working<T>(strip: Strip, job: () => Promise<T>): Promise<T | null> {
  busy = true;
  refreshButtons();
  try {
    return await job();
  } catch (error) {
    if (error instanceof Cancelled) strip.status.textContent = t().cancelled;
    else strip.status.textContent = `${t().conversionFailed}: ${readableError(error)}`;
    return null;
  } finally {
    busy = false;
    refreshButtons();
  }
}

async function loadFile(file: File): Promise<void> {
  if (busy) return;
  convertStrip.status.textContent = '';
  const onProgress = stepReport(convertStrip, (done, total, name) => t().reading(done, total, name));

  const read = await working(convertStrip, () => inspectFiles([file], onProgress));
  if (!read) return;

  const first = read.good[0];
  loaded = first ? { file, name: first.name, summary: first.summary } : null;
  if (loaded) {
    redrawReports();
    fileReport.classList.remove('bad');
  } else {
    const failure = read.bad[0];
    show(fileReport, `<p class="error">${escape(failure ? readableError(failure) : t().unreadable)}</p>`);
    fileReport.classList.add('bad');
  }
  refreshButtons();
}

/** Every file that parsed; the ones that did not are reported and dropped. */
async function loadFilesToPack(files: readonly File[]): Promise<void> {
  // One job at a time: a second would take over the worker's replies and leave
  // the first waiting for an answer that never comes.
  if (busy) return;
  exportStrip.status.textContent = '';
  const onProgress = stepReport(exportStrip, (done, total, name) => t().reading(done, total, name));

  const read = await working(exportStrip, () => inspectFiles(files, onProgress));
  if (!read) return;

  // The worker keeps no bytes and neither does the page: each file is read
  // again, one at a time, when the pack is actually written.
  toPack = read.good.map((entry) => ({
    file: files[entry.index]!,
    name: entry.name,
    summary: entry.summary,
  }));

  const problems = read.bad
    .map((failure) => `<p class="error">${escape(readableError(failure))}</p>`)
    .join('');
  if (toPack.length === 0) {
    show(exportReport, problems || `<p class="error">${escape(t().unreadable)}</p>`);
    exportReport.classList.add('bad');
  } else {
    show(exportReport, problems + toPack.map((entry) => describe(entry.summary, entry.name)).join('<hr />'));
    exportReport.classList.toggle('bad', read.bad.length > 0);
  }
  refreshButtons();
}

function download(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Revoked on the next tick so the download has certainly started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function convert(): Promise<void> {
  const steamId = currentSteamId();
  if (!loaded || steamId === null || busy) return;

  const held = loaded;
  convertStrip.status.textContent = t().converting;
  const onProgress = stepReport(convertStrip, (done, total, name) => t().rebinding(done, total, name));

  const rebound = await working(convertStrip, () =>
    rebindFile(held.file, steamId, new Date(), onProgress),
  );
  if (!rebound) return;

  localStorage.setItem(STEAM_ID_KEY, steamId.toString());
  download(rebound.bytes, rebound.name);

  const only = rebound.saves[0]!;
  convertStrip.status.textContent =
    (rebound.bundled
      ? t().reboundSet(rebound.saves.length, rebound.name, steamId.toString())
      : only.replacements === 0
        ? t().alreadyYours(rebound.name, steamId.toString())
        : t().reboundFromTo(
            rebound.name,
            only.previousSteamId.toString(),
            steamId.toString(),
            only.replacements,
          ));
  showSkipped(convertStrip, rebound.skipped);
}


async function packAll(): Promise<void> {
  if (toPack.length === 0 || busy) return;

  exportStrip.status.textContent = t().packing;
  const onProgress = stepReport(exportStrip, (done, total, name) => t().packingFile(done, total, name));

  // Everything goes into one pack: a practice library is a set, and sending it
  // should be one file to attach, not one download per save.
  const bundle = await working(exportStrip, () =>
    packFiles(toPack.map((entry) => entry.file), noteInput.value.trim(), new Date(), onProgress),
  );
  if (!bundle) return;

  download(bundle.pack, bundle.name);
  exportStrip.status.textContent =
    t().packed(
      bundle.count,
      bundle.name,
      formatSize(bundle.rawTotal),
      formatSize(bundle.pack.length),
    );
  showSkipped(exportStrip, bundle.skipped);

}

function selectTab(name: 'convert' | 'export'): void {
  for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
    const selected = tab.dataset['tab'] === name;
    tab.classList.toggle('current', selected);
    tab.setAttribute('aria-selected', String(selected));
  }
  pick('#panel-convert').hidden = name !== 'convert';
  pick('#panel-export').hidden = name !== 'export';
}

/** Applies the current language to the page, keeping whatever is on screen. */
function applyLanguage(): void {
  document.documentElement.lang = language;
  document.title = t().pageTitle;
  for (const element of document.querySelectorAll<HTMLElement>('[data-t]')) {
    const key = element.dataset['t'] as keyof ReturnType<typeof t>;
    const value = t()[key];
    if (typeof value !== 'string') continue;
    if (key.endsWith('Html')) element.innerHTML = value;
    else element.textContent = value;
  }
  noteInput.placeholder = t().notePlaceholder;
  for (const button of document.querySelectorAll<HTMLButtonElement>('.lang')) {
    button.classList.toggle('current', button.dataset['lang'] === language);
    button.setAttribute('aria-current', String(button.dataset['lang'] === language));
  }
  redrawReports();
  // The status lines and the step counts refer to something that already
  // happened; rewriting them in another language would be a lie about when.
  for (const strip of [convertStrip, exportStrip]) {
    strip.status.textContent = '';
    strip.step.textContent = '';
    strip.skipped.hidden = true;
  }
}

/** Drag and drop, click and keyboard, for one drop zone. */
function wireDropZone(zone: HTMLElement, input: HTMLInputElement, onFiles: (files: File[]) => void): void {
  for (const event of ['dragenter', 'dragover'] as const) {
    zone.addEventListener(event, (dragEvent) => {
      dragEvent.preventDefault();
      zone.classList.add('over');
    });
  }
  for (const event of ['dragleave', 'drop'] as const) {
    zone.addEventListener(event, () => zone.classList.remove('over'));
  }
  zone.addEventListener('drop', (dragEvent) => {
    dragEvent.preventDefault();
    const files = [...(dragEvent.dataTransfer?.files ?? [])];
    if (files.length > 0) onFiles(files);
  });
  zone.addEventListener('keydown', (keyEvent) => {
    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
      keyEvent.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    if (files.length > 0) onFiles(files);
  });
}

wireDropZone(dropZone, fileInput, (files) => void loadFile(files[0]!));
wireDropZone(exportDropZone, exportFileInput, (files) => void loadFilesToPack(files));

steamIdInput.addEventListener('input', refreshButtons);
convertButton.addEventListener('click', () => void convert());
convertCancel.addEventListener('click', () => cancelJob());
exportButton.addEventListener('click', () => void packAll());
exportCancel.addEventListener('click', () => cancelJob());

for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
  tab.addEventListener('click', () => {
    const name = tab.dataset['tab'];
    if (name === 'convert' || name === 'export') selectTab(name);
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>('.lang')) {
  button.addEventListener('click', () => {
    const chosen = button.dataset['lang'];
    if (chosen !== 'en' && chosen !== 'fr') return;
    language = chosen;
    localStorage.setItem(LANGUAGE_KEY, language);
    applyLanguage();
  });
}

const remembered = localStorage.getItem(STEAM_ID_KEY);
if (remembered) steamIdInput.value = remembered;
selectTab('convert');
applyLanguage();
refreshButtons();
