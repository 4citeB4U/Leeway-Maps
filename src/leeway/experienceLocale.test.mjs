import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGES,
  translate,
  canonicalMapCommand,
  setLanguage,
  getLanguage,
} from './experienceLocale.js';
import { classifyCopilotCommand } from './copilotCommands.js';

test('supported languages translate critical map and radio controls without changing addresses', () => {
  for (const language of LANGUAGES.filter((l) => l.code !== 'en')) {
    assert.notEqual(translate('Directions', language.code), 'Directions');
    assert.notEqual(translate('Hold to talk', language.code), 'Hold to talk');
    assert.equal(
      translate('210 South Canal St, Chicago', language.code),
      '210 South Canal St, Chicago',
    );
  }
});
test('localized explicit map commands retain deterministic actions and negation does not match', () => {
  for (const language of LANGUAGES) {
    assert.equal(
      classifyCopilotCommand(translate('Optimize stops', language.code))
        ?.action,
      'optimize-stops',
    );
    assert.equal(
      classifyCopilotCommand(translate('Review route', language.code))?.action,
      'route-review',
    );
  }
  assert.equal(
    canonicalMapCommand('No optimizar paradas'),
    'No optimizar paradas',
  );
  assert.equal(classifyCopilotCommand('No optimizar paradas'), null);
});
test('language selection is validated and restorable', () => {
  setLanguage('es');
  assert.equal(getLanguage().speech, 'es-ES');
  assert.throws(() => setLanguage('unknown'), /Unsupported/);
  setLanguage('en');
  assert.equal(getLanguage().voice, 'en');
});
