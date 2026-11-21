import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_LANGS, profileFor } from '../api/_profile';

test('bot profile texts fit Telegram limits', () => {
  for (const lang of PROFILE_LANGS) {
    const p = profileFor(lang);
    assert.ok(p.name.length <= 64, `name ${lang}`);
    assert.ok(p.short_description.length <= 120, `short ${lang}: ${p.short_description.length}`);
    assert.ok(p.description.length <= 512, `desc ${lang}: ${p.description.length}`);
    assert.ok(p.commands.length > 0 && p.commands.length <= 100);
    for (const c of p.commands) {
      assert.match(c.command, /^[a-z0-9_]{1,32}$/);
      assert.ok(c.description.length >= 1 && c.description.length <= 256);
    }
    assert.doesNotMatch(p.description + p.short_description, /profit|invest|ربح|استثمار|прибыл|инвест/i);
  }
  assert.equal(profileFor('').description, profileFor('en').description);
});
