import type { CharacterSummary } from './sl2/profile.ts';

export function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours === 0 ? `${minutes}m` : `${hours}h${String(minutes).padStart(2, '0')}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function formatCharacters(characters: readonly CharacterSummary[]): string[] {
  if (characters.length === 0) return ['  (no characters)'];

  const names = characters.map((character) => character.name);
  const levels = characters.map((character) => `RL${character.level}`);
  const nameWidth = Math.max(...names.map((name) => name.length));
  const levelWidth = Math.max(...levels.map((level) => level.length));

  return characters.map(
    (character, index) =>
      `  slot ${character.slot}  ${names[index]!.padEnd(nameWidth)}  ` +
      `${levels[index]!.padEnd(levelWidth)}  ${formatPlaytime(character.secondsPlayed)}`,
  );
}
