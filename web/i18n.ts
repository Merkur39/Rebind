import type { ErrorCode } from "../src/errors.ts";

export const LANGUAGES = ["en", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];

/**
 * Keys ending in `Html` hold markup and are assigned with innerHTML; everything
 * else is plain text. No user input ever reaches either, only these literals.
 */
const EN = {
  title: "Rebind",
  pageTitle: "Rebind — use another player’s Elden Ring save",
  ledeHtml:
    "An Elden Ring save belongs to the Steam account that created it, so another player’s save, copied as is, shows no characters in game. This page rebinds the one you were given, or packs your own, to share them.",
  privacyHtml:
    "<strong>Your file never leaves this page.</strong> Everything runs in your browser — there is no server, and nothing is uploaded.",
  step1: "The file you were sent",
  dropHtml: "Drop a save or a <code>.savepack.zip</code> here",
  dropHint: "or click to choose a file",
  step2: "Your Steam ID",
  steamIdHelpHtml:
    "It is the name of the folder holding your own save. Press <kbd>Win</kbd>+<kbd>R</kbd>, paste <code>%APPDATA%\\EldenRing</code>, press Enter: inside is a folder of 17 digits. Copy that name.",
  step3: "Rebind",
  convert: "Rebind and download",
  converting: "Rebinding…",
  fromAccount: "From Steam account",
  saveFile: "save file",
  savepack: "savepack",
  unreadable: "This file could not be read.",
  notDigits: "A Steam ID is 17 digits, nothing else.",
  conversionFailed: "Rebinding failed",
  reboundFromTo: (name: string, from: string, to: string, count: number) =>
    `${name} — rebound from ${from} to ${to} (${count} reference${count === 1 ? "" : "s"}).`,
  alreadyYours: (name: string, id: string) =>
    `${name} — this save already belonged to ${id}, so it was copied unchanged.`,
  tabConvert: "Rebind a save",
  tabExport: "Share my saves",
  exportIntroHtml:
    "Packing a save turns 27.6 MB into about 2 MB, small enough to drop into a chat. Whoever receives it does not need this page: a raw save works just as well, it is only heavier to send.",
  exportDropHtml: "Drop saves, or a folder of them, here",
  exportDropHint: "or click to choose files",
  noteLabel: "A note for whoever receives them (optional)",
  notePlaceholder: "RL1 Any%, post-Margit",
  exportButton: "Pack and download",
  packing: "Packing…",
  reading: (done: number, total: number, name: string) =>
    `Reading ${done} / ${total} — ${name}`,
  packingFile: (done: number, total: number, name: string) =>
    `Packing ${done} / ${total} — ${name}`,
  rebinding: (done: number, total: number, name: string) =>
    `Rebinding ${done} / ${total} — ${name}`,
  cancel: "Cancel",
  alreadyPacked: (tab: string) =>
    `this is already a savepack — drop it in the “${tab}” tab`,
  notASave:
    "this is not an Elden Ring save — drop the saves themselves, or the folder holding them",
  skipped: (count: number) => `${count} save${count === 1 ? "" : "s"} skipped:`,
  cancelled: "Cancelled.",
  saveCount: (count: number) => `${count} saves`,
  packed: (count: number, name: string, from: string, to: string) =>
    `Packed ${count} save${count === 1 ? "" : "s"} into ${name}: ${from} became ${to}.`,
  reboundSet: (count: number, name: string, id: string) =>
    `${count} saves rebound to ${id}, downloaded together as ${name}.`,
  footerHtml:
    'The rebound file keeps a name of your choosing. Loading it into the game is a save organiser\'s job — <a href="https://github.com/Kahmul/SoulsSpeedruns-Save-Organizer">SoulsSpeedruns Save Organizer</a> copies the one you pick over <code>ER0000.sl2</code> and gives you a read-only toggle for practice.',
  legalTitle: "Legal",
  notAffiliatedHtml:
    "Rebind is an independent tool, not affiliated with or endorsed by FromSoftware, Bandai Namco or Valve. Elden Ring and Steam are trademarks of their respective owners, named here only to say what this works with.",
  noDataHtml:
    "Nothing is collected. No file, no identifier and no usage data ever leaves your browser; there is no analytics and no cookie. Your Steam ID and your language choice are kept on your own machine so you do not retype them, and clearing your browser data removes them.",
  onlineRiskHtml:
    "A save someone gives you may hold items obtained in ways the game does not expect, which can get an account flagged when playing online. That is why runners play shared saves offline. Rebind changes only which account a save belongs to — never its contents.",
  warrantyHtml:
    "Provided as is, without warranty of any kind. Keep your own save somewhere safe before replacing it.",
  licenceHtml:
    'Free software under the GNU General Public License v3 or later: <a href="https://github.com/Merkur39/Rebind">the source of this page</a> is part of what you receive, and anyone distributing a modified version has to share their changes under the same terms.',
};

type Translations = typeof EN;

const FR: Translations = {
  title: "Rebind",
  pageTitle: "Rebind — utiliser la sauvegarde Elden Ring d’un autre joueur",
  ledeHtml:
    "Une sauvegarde Elden Ring appartient au compte Steam qui l'a créée : celle d'un autre joueur, recopiée telle quelle, n'affiche aucun personnage en jeu. Cette page réaffecte celle qu'on vous a partagée, ou compresse les vôtres, pour les partager.",
  privacyHtml:
    "<strong>Votre fichier ne quitte jamais cette page.</strong> Tout s'exécute dans votre navigateur : aucun serveur, aucun envoi.",
  step1: "Le fichier reçu",
  dropHtml: "Déposez une sauvegarde ou un <code>.savepack.zip</code> ici",
  dropHint: "ou cliquez pour choisir un fichier",
  step2: "Votre identifiant Steam",
  steamIdHelpHtml:
    "C'est le nom du dossier qui contient votre propre sauvegarde. Appuyez sur <kbd>Win</kbd>+<kbd>R</kbd>, collez <code>%APPDATA%\\EldenRing</code>, validez : à l'intérieur se trouve un dossier de 17 chiffres. Copiez ce nom.",
  step3: "Réaffecter",
  convert: "Réaffecter et télécharger",
  converting: "Réaffectation en cours…",
  fromAccount: "Depuis le compte Steam",
  saveFile: "fichier de sauvegarde",
  savepack: "savepack",
  unreadable: "Ce fichier n'a pas pu être lu.",
  notDigits: "Un identifiant Steam fait 17 chiffres, rien d’autre.",
  conversionFailed: "Échec de la réaffectation",
  reboundFromTo: (name: string, from: string, to: string, count: number) =>
    `${name} — réaffecté de ${from} à ${to} (${count} référence${count > 1 ? "s" : ""}).`,
  alreadyYours: (name: string, id: string) =>
    `${name} — cette sauvegarde appartenait déjà à ${id}, elle a été copiée telle quelle.`,
  tabConvert: "Réaffecter une sauvegarde",
  tabExport: "Partager mes sauvegardes",
  exportIntroHtml:
    "Compresser une sauvegarde fait passer 27,6 Mo à environ 2 Mo, assez léger pour un message. Celui qui la reçoit n'a pas besoin de cette page : une sauvegarde brute fonctionne aussi bien, elle est seulement plus lourde à envoyer.",
  exportDropHtml: "Déposez des sauvegardes, ou un dossier, ici",
  exportDropHint: "ou cliquez pour choisir des fichiers",
  noteLabel: "Un mot pour ceux qui les recevront (facultatif)",
  notePlaceholder: "RL1 Any%, après Margit",
  exportButton: "Compresser et télécharger",
  packing: "Compression en cours…",
  reading: (done: number, total: number, name: string) =>
    `Lecture ${done} / ${total} — ${name}`,
  packingFile: (done: number, total: number, name: string) =>
    `Compression ${done} / ${total} — ${name}`,
  rebinding: (done: number, total: number, name: string) =>
    `Réaffectation ${done} / ${total} — ${name}`,
  cancel: "Annuler",
  alreadyPacked: (tab: string) =>
    `c'est déjà un savepack — déposez-le dans l'onglet « ${tab} »`,
  notASave:
    "ce n'est pas une sauvegarde Elden Ring — déposez les sauvegardes elles-mêmes, ou le dossier qui les contient",
  skipped: (count: number) =>
    `${count} sauvegarde${count > 1 ? "s" : ""} ignorée${count > 1 ? "s" : ""} :`,
  cancelled: "Annulé.",
  saveCount: (count: number) => `${count} sauvegardes`,
  packed: (count: number, name: string, from: string, to: string) =>
    `${count} sauvegarde${count > 1 ? "s" : ""} compressée${count > 1 ? "s" : ""} dans ${name} : ${from} devient ${to}.`,
  reboundSet: (count: number, name: string, id: string) =>
    `${count} sauvegardes réaffectées à ${id}, téléchargées ensemble dans ${name}.`,
  legalTitle: "Mentions légales",
  notAffiliatedHtml:
    "Rebind est un outil indépendant, sans affiliation ni approbation de FromSoftware, Bandai Namco ou Valve. Elden Ring et Steam sont des marques de leurs propriétaires respectifs, citées ici seulement pour dire avec quoi cet outil fonctionne.",
  noDataHtml:
    "Aucune donnée n'est collectée. Aucun fichier, aucun identifiant, aucune donnée d'usage ne quitte votre navigateur ; il n'y a ni mesure d'audience ni cookie. Votre identifiant Steam et votre choix de langue restent sur votre machine pour ne pas les ressaisir, et vider les données du navigateur les supprime.",
  onlineRiskHtml:
    "Une sauvegarde qu'on vous donne peut contenir des objets obtenus par des moyens que le jeu n'attend pas, ce qui peut faire signaler un compte en ligne. C'est pourquoi les runners jouent hors ligne les sauvegardes partagées. Rebind ne change que le compte auquel une sauvegarde appartient — jamais son contenu.",
  warrantyHtml:
    "Fourni en l'état, sans garantie d'aucune sorte. Gardez une copie de votre propre sauvegarde avant de la remplacer.",
  licenceHtml:
    'Logiciel libre sous licence GNU General Public License v3 ou ultérieure : <a href="https://github.com/Merkur39/Rebind">le code source de cette page</a> fait partie de ce que vous recevez, et qui en distribue une version modifiée doit partager ses modifications aux mêmes conditions.',
  footerHtml:
    "Le fichier réaffecté garde le nom que vous lui donnez. L'installer dans le jeu est le rôle d'un gestionnaire de sauvegardes : <a href=\"https://github.com/Kahmul/SoulsSpeedruns-Save-Organizer\">SoulsSpeedruns Save Organizer</a> recopie celui que vous choisissez par-dessus <code>ER0000.sl2</code> et fournit la bascule lecture seule pour l'entraînement.",
};

export const UI: Record<Language, Translations> = { en: EN, fr: FR };

const ERRORS: Record<Language, Record<ErrorCode, string>> = {
  en: {
    "not-a-save": "This file is not an Elden Ring save.",
    "unexpected-layout": "This save has a layout this tool does not recognise.",
    truncated: "This save is incomplete — the download was probably cut short.",
    "no-profile-block": "This save has no profile block.",
    "save-corrupted":
      "This save is damaged — its own checksums do not match, and the game would turn it down.",
    "not-an-archive": "This file is not a savepack.",
    "pack-unreadable-manifest": "This savepack has an unreadable manifest.",
    "pack-wrong-format": "This savepack was made by a newer version of Rebind.",
    "pack-wrong-game": "This savepack is for another game, not Elden Ring.",
    "pack-missing-manifest": "This archive is not a savepack.",
    "pack-missing-save": "This savepack is missing one of its saves.",
    "pack-empty": "A savepack needs at least one save.",
    "zip-unwritable": "This archive could not be written.",
    "pack-corrupted":
      "This savepack is corrupted — the save does not match its checksum.",
    "neither-format": "This is neither a savepack nor an Elden Ring save.",
    "invalid-steam-id":
      "That is not a valid Steam ID. It is 17 digits, starting with 7656119.",
  },
  fr: {
    "not-a-save": "Ce fichier n'est pas une sauvegarde Elden Ring.",
    "unexpected-layout":
      "Cette sauvegarde a une structure que cet outil ne reconnaît pas.",
    truncated:
      "Cette sauvegarde est incomplète — le téléchargement a sans doute été interrompu.",
    "no-profile-block": "Cette sauvegarde ne contient pas de bloc profil.",
    "save-corrupted":
      "Cette sauvegarde est abîmée — ses propres empreintes ne correspondent pas, le jeu la refuserait.",
    "not-an-archive": "Ce fichier n'est pas un savepack.",
    "pack-unreadable-manifest": "Le manifeste de ce savepack est illisible.",
    "pack-wrong-format":
      "Ce savepack a été créé par une version plus récente de Rebind.",
    "pack-wrong-game": "Ce savepack concerne un autre jeu qu'Elden Ring.",
    "pack-missing-manifest": "Cette archive n'est pas un savepack.",
    "pack-missing-save": "Il manque une des sauvegardes de ce savepack.",
    "pack-empty": "Un savepack doit contenir au moins une sauvegarde.",
    "zip-unwritable": "Cette archive n'a pas pu être écrite.",
    "pack-corrupted":
      "Ce savepack est corrompu — la sauvegarde ne correspond pas à son empreinte.",
    "neither-format": "Ceci n'est ni un savepack ni une sauvegarde Elden Ring.",
    "invalid-steam-id":
      "Cet identifiant Steam n'est pas valide. Il fait 17 chiffres et commence par 7656119.",
  },
};

/** The message for a failure, falling back to whatever the error itself said. */
export function errorMessage(
  language: Language,
  code: ErrorCode | null,
  fallback: string,
): string {
  return code ? (ERRORS[language][code] ?? fallback) : fallback;
}

export function isLanguage(value: string | null): value is Language {
  return value !== null && (LANGUAGES as readonly string[]).includes(value);
}

/** A stored choice wins; otherwise follow the browser, defaulting to English. */
export function pickLanguage(
  preferred: readonly string[],
  stored: string | null,
): Language {
  if (isLanguage(stored)) return stored;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLanguage(base ?? null)) return base as Language;
  }
  return "en";
}
