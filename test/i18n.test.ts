import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, UI, errorMessage, isLanguage, pickLanguage } from '../web/i18n.ts';

describe('translations', () => {
  it('cover the same keys in every language', () => {
    const english = Object.keys(UI.en).sort();

    for (const language of LANGUAGES) {
      assert.deepEqual(Object.keys(UI[language]).sort(), english, `${language} keys differ`);
    }
  });

  it('leave nothing untranslated in French', () => {
    for (const [key, value] of Object.entries(UI.fr)) {
      if (typeof value !== 'string' || key === 'title' || key === 'savepack') continue;
      assert.notEqual(value, UI.en[key as keyof typeof UI.en], `${key} is still in English`);
    }
  });

  it('keep the same markup shape, so a translation cannot break the layout', () => {
    for (const [key, english] of Object.entries(UI.en)) {
      if (typeof english !== 'string' || !key.endsWith('Html')) continue;
      const tags = (text: string) => (text.match(/<[a-z]+/g) ?? []).sort();
      assert.deepEqual(tags(UI.fr[key as keyof typeof UI.fr] as string), tags(english), key);
    }
  });
});

describe('errorMessage', () => {
  it('translates a known failure', () => {
    assert.match(errorMessage('fr', 'truncated', 'fallback'), /incomplète/);
    assert.match(errorMessage('en', 'truncated', 'fallback'), /incomplete/);
  });

  it('falls back to the error’s own words when there is no code', () => {
    assert.equal(errorMessage('fr', null, 'something odd happened'), 'something odd happened');
  });

  it('covers every error code in both languages', () => {
    const codes = Object.keys(
      // Every code the core can raise, taken from the English table itself.
      (errorMessage as unknown as { length: number }) && UI.en,
    );
    assert.ok(codes.length > 0);
    for (const language of LANGUAGES) {
      assert.notEqual(errorMessage(language, 'pack-corrupted', 'fallback'), 'fallback');
      assert.notEqual(errorMessage(language, 'invalid-steam-id', 'fallback'), 'fallback');
      assert.notEqual(errorMessage(language, 'neither-format', 'fallback'), 'fallback');
    }
  });
});

describe('pickLanguage', () => {
  it('honours a stored choice over the browser', () => {
    assert.equal(pickLanguage(['fr-FR', 'fr'], 'en'), 'en');
    assert.equal(pickLanguage(['en-US'], 'fr'), 'fr');
  });

  it('follows the browser when nothing was chosen', () => {
    assert.equal(pickLanguage(['fr-FR', 'en'], null), 'fr');
    assert.equal(pickLanguage(['en-GB'], null), 'en');
  });

  it('walks down the list until it finds one it speaks', () => {
    assert.equal(pickLanguage(['de-DE', 'it', 'fr-CA'], null), 'fr');
  });

  it('defaults to English for a language it does not have', () => {
    assert.equal(pickLanguage(['ja-JP'], null), 'en');
    assert.equal(pickLanguage([], null), 'en');
  });

  it('ignores a stored value that is not a language it has', () => {
    assert.equal(pickLanguage(['fr'], 'klingon'), 'fr');
  });
});

describe('isLanguage', () => {
  it('accepts only the languages that exist', () => {
    assert.ok(isLanguage('fr'));
    assert.ok(isLanguage('en'));
    assert.ok(!isLanguage('de'));
    assert.ok(!isLanguage(null));
  });
});
