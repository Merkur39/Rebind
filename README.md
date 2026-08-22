# Rebind

Make another player's Elden Ring save loadable on your own Steam account.

A speedrunner can hand a practice save — a fresh RL1 start, a post-Margit setup, a
boss-rush file — to someone learning the category. Drop it in the page, type your
Steam ID, get a working save file back.

## Why a tool is needed

Elden Ring binds a save to the Steam account that created it. Copying someone
else's `ER0000.sl2` into your own folder does not work: the game reads an owner
id that is not yours and shows no characters.

Rebind rewrites that ownership and recomputes the MD5 digests the game uses
to validate each block, producing a save file you can load.

The page is in English and French, following your browser and remembering your
choice.

## Your file never leaves your machine

The conversion runs entirely in the browser. There is no server and nothing is
uploaded, and once the page has loaded it makes no request of any kind unless it
breaks — in which case a technical report goes to Sentry, which is the one thing
it needs a network for. Short of that it works offline. Converting a 27.6 MB save
takes about 650 ms.

## What it does not do

**It never touches your save folder** — it cannot, from a browser, and that is
the right shape anyway. Swapping a save into place is a save organiser's job:
[SoulsSpeedruns Save Organizer](https://github.com/Kahmul/SoulsSpeedruns-Save-Organizer)
keeps a library of `.sl2` files, one per practice point, copies the one you pick
over `ER0000.sl2` — the source file name does not matter, it renames on copy —
and gives you a read-only toggle so you can repeat a segment without reloading.

Note that it overwrites `ER0000.sl2` **without keeping a backup**. Import your own
save into its library before your first load, or you lose it.

## Use

The page has two sides: **receive a save** someone sent you, and **share your
own**.

### Receiving

1. **Their save.** Drop the `ER0000.sl2`, `.savepack.zip` or plain zip you were
   sent. Its characters, levels and playtimes are shown before anything is
   converted, so you can check you got what you expected.
2. **Your Steam ID.** It is the name of the folder holding your own save: press
   <kbd>Win</kbd>+<kbd>R</kbd>, paste `%APPDATA%\EldenRing`, press Enter — inside
   is a folder of 17 digits. It is remembered for next time.
3. **Convert.** The file downloads under its original name; drop it in your save
   organiser library.

A raw `ER0000.sl2` is accepted as readily as a `.savepack.zip`, and so is an
ordinary zip of saves — what somebody without this page ends up sending, or what
Windows makes of a practice folder. Whoever shares a save needs nothing at all.
Entries that are not saves are named and left out; a zip holding none is turned
away. Saves come back at the path they sat at, and a name climbing out of the
folder it unpacks into is refused rather than passed on.

### Sharing

Drop saves in the second tab — or the folder holding them, subfolders and all, or
a zip of either — optionally add a note, and get a single `.savepack.zip` holding
them: 27.6 MB per save becomes about 2 MB, and a practice library travels as one
attachment rather than one download per file. Files that fail to parse are
reported and skipped rather than stopping the batch, and a `.savepack.zip` dropped
here is turned away: it is what this tab makes, and unpacking one to pack it
again would only cost it its note and its date.

A dropped folder keeps its shape, and so does a zip's. Saves go into the pack
under the path they were found at, and come back out at the same path when the
pack is converted, so a library that took a year to arrange is still arranged at
the other end. A lone save is downloaded under its own name, a download name
having nowhere to put a path.

A pack of one takes that save’s name; a pack of several is dated, having no name
in common. Receiving works the same way in reverse: a pack of one converts to a
single `.sl2`, a pack of several to one zip holding them, each under its own name.

### Names are carried through

Runners keep libraries of saves named after the point they practise — `Avant
Margit` — and a save organiser renames on load, so that name is the only place
the description lives. It survives the whole round trip untouched: packing
`Avant Margit` records the name inside the manifest, and converting gives back
`Avant Margit` even if the pack itself was renamed along the way. Nothing is
appended, not even `.sl2`: an organiser stores a save under exactly the name
typed into it, so a practice library is a list of bare names, and a converted
save has to drop back into it without standing out. Only a `.savepack.zip`
becomes an `.sl2`, having been a container rather than a save.

About 94% of a packed save is one incompressible block of encrypted game
regulation data, so 2 MB is close to the floor; the ten character slots account
for 74 KB between them.

## The .savepack.zip format

An optional container, and an ordinary zip despite the descriptive name: the
`.zip` suffix is there so the operating system, chat clients and antivirus all
recognise it, and so a recipient can open it by hand to get the save out without
this page. It holds the save and a `manifest.json`. It compresses 27.6 MB down to about 2 MB and
carries a note and the character list.

```json
{
  "format": "rebind/1",
  "game": "elden-ring",
  "createdAt": "2026-08-20T10:11:12.000Z",
  "note": "RL1 Any%, post-Margit",
  "saves": [
    {
      "fileName": "Avant Margit.sl2",
      "size": 28967888,
      "sha256": "…",
      "steamId": "76561197960265728",
      "characters": [{ "slot": 0, "name": "RL1 Any%", "level": 1, "secondsPlayed": 3600 }]
    }
  ]
}
```

Its SHA-256 is checked when the save itself is read — converting it, or packing
it again — so a truncated download is caught rather than handed to the game.
Dropping a pack in only reads the manifest, which is why a pack of fifty lists
itself instantly instead of inflating 1.4 GB to draw one page of description; the
list you see is what the sender recorded, and the bytes answer for themselves
before anything is produced from them.

A save that fails that check is left out rather than taking the others down with
it: nineteen of twenty are still worth having, and the ones left out are named,
with the reason, under the line that says what came through. A pack with nothing
readable left in it fails outright.

A save also carries twelve MD5 digests of its own, one per block, and those are
the ones the game checks. They are verified whenever a save is read, packed or
not, so a file the game would turn down is turned down here first — a rebind
would otherwise recompute all twelve and hand back something structurally sound
made of damaged bytes. It costs about 80 ms per save, in the worker.

## Limits

- A save carries all ten character slots together. Taking a single character out
  of one is not supported.
- Seamless Co-op saves (`.co2`) and Nightreign (`NR0000.sl2`) are not handled.

## Legal

Rebind is an independent tool, not affiliated with or endorsed by FromSoftware,
Bandai Namco or Valve. Elden Ring and Steam are trademarks of their respective
owners, named here only to say what this works with.

Nothing is collected: no file, identifier or usage data leaves the browser, and
there is no analytics and no cookie. The Steam ID and language choice sit in the
browser own storage so they need not be retyped.

A save someone gives you may hold items obtained in ways the game does not
expect, which can get an account flagged when playing online — runners play
shared saves offline. Rebind changes only which account a save belongs to, never
its contents.

Free software under the [GNU General Public License v3 or later](LICENSE).
A modified version distributed to anyone — including one served from a web page —
has to come with its source under the same terms. Provided as is, without
warranty.

## Development

```bash
pnpm install
pnpm dev         # the page, on a dev server
pnpm test        # unit tests, plus read-only checks against a real save if present
pnpm typecheck
pnpm build       # static output in dist-web/, deployable anywhere
```

Node 24 or newer: the tests are TypeScript run directly, which needs type
stripping enabled by default.

### Deploying

Vercel builds and serves the site on every push to `main`. `vercel.json` points
it at `dist-web/` — Vercel looks for `dist/` by default for a Vite project — and
runs the type check and the tests before the build, so a commit that breaks them
produces no artefact and nothing is published.

`.github/workflows/ci.yml` runs the same checks on GitHub, which is what puts a
red mark on the commit and on pull requests. Vercel gates the deploy; the
workflow makes the failure visible.

`vite.config.ts` sets `base: './'`, so the page works both at the root of a
domain and from a subdirectory.

### Error reporting

The page reports to Sentry only what it could not explain: a crash while wiring
the document up, or a failure the worker could put no code on. Anything carrying
a code from `src/errors.ts` is the file's fault rather than the code's and is
already said to the user in their own language, so it stops there.
`web/reportable.ts` draws that line and `web/monitoring.ts` asks it before
sending. Only the page carries the SDK; the worker sends its error back with the
failure, stack and all, and the page reports it from there.

Nothing about the user goes along: no tracing, no session replay, no save
contents, and no file name — a failure names its file on screen, not in what is
sent. Sessions are off as well, the tally Sentry keeps of visitors whether or not
anything broke, so the page asks nothing of the network until something does go
wrong. What travels then is the error, its stack, the browser and the system, and
the IP address of that one request. Any seventeen-digit number is blanked out on
the way out, that being the shape of the one identifier this page exists to
handle.

The DSN is written into `web/monitoring.ts`. A browser SDK cannot keep one
secret, so it is public wherever it lives, and in source it means any build
reports rather than only the one Vercel makes. The dev server reports nothing.

Source maps are built and uploaded only when `SENTRY_AUTH_TOKEN` is in the
environment — Vercel holds one as a project environment variable, and
`.env.sentry-build-plugin` holds one locally, uncommitted. Without a token there
is no plugin and no map, so a clone or a fork builds with nothing configured.
The plugin deletes the maps once they are uploaded; the site never serves them.
Sentry reads a stack through the debug id stamped on the bundle it came from,
and the worker, bundled apart, inherits neither the map nor the plugin that
stamps it: `vite.config.ts` names both again under `worker`, in a pass that
stamps and leaves the upload to the page's. The stamp then has to travel, since
the SDK doing the reporting runs on the page and reads only the page's own —
`registerWebWorker` announces the worker's, `webWorkerIntegration` takes them,
and `web/jobs.ts` hands over each worker as it is made so that Sentry is
listening before anything else and swallows that message rather than letting it
pass for a job's answer.

`pnpm-workspace.yaml` is committed for one line: `@sentry/vite-plugin` reaches
for the `@sentry/cli` binary, whose install script pnpm will not run unless told
to. The SDK costs the page bundle about 27 kB gzipped, which is most of what it
weighs.

### Layout

`src/` is the save handling and imports nothing from Node, so it runs unchanged
in the browser; `web/` is the page around it, with its translations in
`web/i18n.ts`.

None of that work happens on the page's own thread. `web/jobs.worker.ts` reads,
rebinds and packs; `web/jobs.ts` is the page's side of it, one worker for every
job, cancelled by killing it. Hashing and deflating ten saves is four seconds of
solid work and fifty are twenty, which is a frozen page either way. Files cross
to the worker as handles rather than bytes — a `File` survives the structured
clone by reference — so a save is read only when its turn comes and let go right
after; the page keeps names and character summaries, never the 27.6 MB behind
them. Both archives this tool downloads are written entry by entry through
`src/zip.ts` for the same reason.

Every failure the user can see carries a stable code from `src/errors.ts`, so the
page can phrase it in either language; the English message stays as the fallback
for a code nobody mapped yet.

MD5 and SHA-256 are implemented in `src/hash.ts` rather than taken from the
platform: WebCrypto has no MD5 at all — and the twelve digests guarding a save
are MD5 — while its SHA-256 is asynchronous, which would make every caller async
for no benefit. Both are checked against `node:crypto` in the tests.

The `.sl2` format was reverse-engineered against a real save, and those findings
are encoded in `test/fixture.ts`, which builds a structurally faithful synthetic
save. `test/sl2/real-save.test.ts` re-verifies them against an actual save file
when the machine running the tests has one, and says so either way — the fixture
only ever encodes what we believe. That check is what caught which slots hold a
character being read out of byte `0x3a` of the profile block, which is not a flag
at all: it is clear on every save of a practice library the game loads without
complaint, so all fifty came back showing nobody. Falling back on the name in the
summary header then failed the other way round — deleting a character leaves both
its name and its whole data block behind, and a save whose second slot the game
does not list was showing two. One byte per slot at `0x1954` is the entire
record, and the game goes by nothing else.
slots of those 52 saves never disagreed with its character block holding data.
