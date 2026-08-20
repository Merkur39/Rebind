import { codeOf } from '../src/errors.ts';
import { formatCharacters, formatSize } from '../src/format.ts';
import { readIncoming, type Incoming } from '../src/incoming.ts';
import { zipSync } from 'fflate';
import { bundleName, packName, reboundName } from '../src/naming.ts';
import { createPack } from '../src/pack.ts';
import { assertSteamId, rebindToSteamId } from '../src/sl2/rebind.ts';
import { UI, errorMessage, pickLanguage, type Language } from './i18n.ts';

const pick = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const dropZone = pick<HTMLLabelElement>('#drop');
const fileInput = pick<HTMLInputElement>('#file');
const fileReport = pick<HTMLDivElement>('#file-report');
const steamIdInput = pick<HTMLInputElement>('#steamid');
const steamIdError = pick<HTMLParagraphElement>('#steamid-error');
const convertButton = pick<HTMLButtonElement>('#convert');
const status = pick<HTMLParagraphElement>('#status');

const exportDropZone = pick<HTMLLabelElement>('#export-drop');
const exportFileInput = pick<HTMLInputElement>('#export-file');
const exportReport = pick<HTMLDivElement>('#export-report');
const noteInput = pick<HTMLInputElement>('#note');
const exportButton = pick<HTMLButtonElement>('#export');
const exportStatus = pick<HTMLParagraphElement>('#export-status');

const STEAM_ID_KEY = 'rebind.steamid';
const LANGUAGE_KEY = 'rebind.language';

let language: Language = pickLanguage(navigator.languages ?? [navigator.language], localStorage.getItem(LANGUAGE_KEY));
let loaded: { incoming: Incoming; name: string } | null = null;
let toPack: { incoming: Incoming; name: string }[] = [];

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
  const code = codeOf(error);
  return errorMessage(language, code, code ? (error as Error).message : t().unreadable);
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
  convertButton.disabled = loaded === null || steamId === null;
  exportButton.disabled = toPack.length === 0;
}

function describe(incoming: Incoming, name: string): string {
  const total = incoming.saves.reduce((bytes, entry) => bytes + entry.save.length, 0);
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
      const size = incoming.saves.length > 1 ? ` · ${formatSize(entry.save.length)}` : '';
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
  if (loaded) show(fileReport, describe(loaded.incoming, loaded.name));
  if (toPack.length > 0) {
    show(exportReport, toPack.map((entry) => describe(entry.incoming, entry.name)).join('<hr />'));
  }
}

async function readFile(file: File): Promise<{ incoming: Incoming; name: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { incoming: readIncoming(bytes, new Date(file.lastModified)), name: file.name };
}

async function loadFile(file: File): Promise<void> {
  status.textContent = '';
  try {
    loaded = await readFile(file);
    redrawReports();
    fileReport.classList.remove('bad');
  } catch (error) {
    loaded = null;
    show(fileReport, `<p class="error">${escape(readableError(error))}</p>`);
    fileReport.classList.add('bad');
  }
  refreshButtons();
}

/** Every file that parsed; the ones that did not are reported and dropped. */
async function loadFilesToPack(files: readonly File[]): Promise<void> {
  exportStatus.textContent = '';
  const good: typeof toPack = [];
  const bad: string[] = [];

  for (const file of files) {
    try {
      good.push(await readFile(file));
    } catch (error) {
      bad.push(`${file.name} — ${readableError(error)}`);
    }
  }

  toPack = good;
  const problems = bad.map((line) => `<p class="error">${escape(line)}</p>`).join('');
  if (good.length === 0) {
    show(exportReport, problems || `<p class="error">${escape(t().unreadable)}</p>`);
    exportReport.classList.add('bad');
  } else {
    show(exportReport, problems + good.map((entry) => describe(entry.incoming, entry.name)).join('<hr />'));
    exportReport.classList.toggle('bad', bad.length > 0);
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

/** Lets the browser paint before a hash blocks the thread for a moment. */
const yieldToPaint = () => new Promise((resolve) => setTimeout(resolve, 16));

async function convert(): Promise<void> {
  const steamId = currentSteamId();
  if (!loaded || steamId === null) return;

  convertButton.disabled = true;
  status.textContent = t().converting;
  await yieldToPaint();

  try {
    const rebound = loaded.incoming.saves.map((entry) => {
      const result = rebindToSteamId(entry.save, steamId);
      // The name recorded when the save was packed wins: the pack itself may
      // have been renamed on the way, but that name is what the sender chose.
      return { ...result, name: reboundName(entry.fileName ?? loaded!.name) };
    });
    localStorage.setItem(STEAM_ID_KEY, steamId.toString());

    if (rebound.length === 1) {
      const only = rebound[0]!;
      download(only.save, only.name);
      status.textContent =
        only.replacements === 0
          ? t().alreadyYours(only.name, steamId.toString())
          : t().reboundFromTo(
              only.name,
              only.previousSteamId.toString(),
              steamId.toString(),
              only.replacements,
            );
      convertButton.disabled = false;
      return;
    }

    // Several saves would mean several downloads, which browsers throttle and
    // ask permission for; one zip is a single file to save and unpack.
    const files: Record<string, Uint8Array> = {};
    for (const entry of rebound) files[entry.name] = entry.save;
    const name = bundleName(loaded.name);
    download(zipSync(files, { level: 6 }), name);
    status.textContent = t().reboundSet(rebound.length, name, steamId.toString());
  } catch (error) {
    status.textContent = `${t().conversionFailed}: ${readableError(error)}`;
  }
  convertButton.disabled = false;
}

async function packAll(): Promise<void> {
  if (toPack.length === 0) return;

  exportButton.disabled = true;
  exportStatus.textContent = t().packing;
  await yieldToPaint();

  const note = noteInput.value.trim();
  const now = new Date();

  try {
    // Everything goes into one pack: a practice library is a set, and sending it
    // should be one file to attach, not one download per save.
    const entries = toPack.flatMap((file) =>
      file.incoming.saves.map((entry) => ({
        save: entry.save,
        fileName: entry.fileName ?? file.name,
      })),
    );
    const pack = createPack(entries, { ...(note ? { note } : {}), now });
    const name = packName(
      entries.map((entry) => entry.fileName),
      now,
    );
    download(pack, name);

    const rawTotal = entries.reduce((bytes, entry) => bytes + entry.save.length, 0);
    exportStatus.textContent = t().packed(
      entries.length,
      name,
      formatSize(rawTotal),
      formatSize(pack.length),
    );
  } catch (error) {
    exportStatus.textContent = `${t().conversionFailed}: ${readableError(error)}`;
  }
  exportButton.disabled = false;
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
  // The status lines refer to something that already happened; rewriting them
  // in another language would be a lie about when it ran.
  status.textContent = '';
  exportStatus.textContent = '';
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
exportButton.addEventListener('click', () => void packAll());

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
