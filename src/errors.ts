/**
 * Every failure the user can see carries a stable code, so a caller can phrase
 * it in its own language. The English message stays as the fallback: an
 * unmapped code shows something readable rather than nothing.
 */
export type ErrorCode =
  | 'pack-empty'
  | 'zip-unwritable'
| 'not-a-save'
  | 'unexpected-layout'
  | 'truncated'
  | 'no-profile-block'
  | 'save-corrupted'
  | 'no-save-in-archive'
  | 'unsafe-name'
  | 'not-an-archive'
  | 'pack-unreadable-manifest'
  | 'pack-wrong-format'
  | 'pack-wrong-game'
  | 'pack-missing-manifest'
  | 'pack-missing-save'
  | 'pack-empty'
  | 'pack-corrupted'
  | 'neither-format'
  | 'invalid-steam-id';

export class SaveError extends Error {
  // Declared and assigned rather than a constructor parameter property: Node
  // strips types, it does not generate code, so `readonly code: ErrorCode` in
  // the parameter list would not compile.
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

export function codeOf(error: unknown): ErrorCode | null {
  return error instanceof SaveError ? error.code : null;
}
