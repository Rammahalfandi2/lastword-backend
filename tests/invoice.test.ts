import test from 'node:test';
import assert from 'node:assert/strict';
import { cryptoPayDescription, starsInvoiceTexts, CRYPTO_PAY_DESCRIPTION_MAX, TG_TITLE_MAX, TG_DESCRIPTION_MAX } from '../api/_invoice';

const ENTITY = /&(quot|amp|lt|gt|#39|#x27);/;

test('crypto pay description is plain text with the raw word', () => {
  const d = cryptoPayDescription('555', 'ar');
  assert.equal(d, 'The Last Word: «555» on the AR board');
  assert.doesNotMatch(d, ENTITY);
  assert.doesNotMatch(d, /["<>]/);
  assert.equal(cryptoPayDescription("it's", 'en'), 'The Last Word: «it’s» on the EN board');
  assert.match(cryptoPayDescription('مرحبا', 'ar'), /«مرحبا»/);
  assert.ok([...cryptoPayDescription('x'.repeat(5000), 'en')].length <= CRYPTO_PAY_DESCRIPTION_MAX);
});

test('stars invoice texts are plain text and within Telegram limits', () => {
  for (const w of ['555', "it's", 'Привет мир', 'كلمة الأخيرة', 'a'.repeat(20)]) {
    const t = starsInvoiceTexts(w, 'ru');
    assert.ok([...t.title].length <= TG_TITLE_MAX, t.title);
    assert.ok([...t.description].length <= TG_DESCRIPTION_MAX);
    for (const s of [t.title, t.description, t.label]) {
      assert.doesNotMatch(s, ENTITY);
      assert.doesNotMatch(s, /["<>]/);
    }
  }
  assert.equal(starsInvoiceTexts('555', 'ar').label, 'Word: 555');
});
