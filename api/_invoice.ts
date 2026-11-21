// Plain-text invoice texts (Crypto Pay + Telegram Stars). These are NOT HTML: never escape them.
// Crypto Pay shows `"` and `'` as HTML entities in the invoice, so we quote with « » and
// show an apostrophe as ’ (display only; the stored word is unchanged).
export const CRYPTO_PAY_DESCRIPTION_MAX = 1024;
export const TG_TITLE_MAX = 32;
export const TG_DESCRIPTION_MAX = 255;

function displayWord(word: string): string {
  return String(word ?? '').trim().replace(/'/g, '’').replace(/["<>&]/g, '');
}

function clip(s: string, max: number): string {
  const chars = [...s];
  return chars.length <= max ? s : chars.slice(0, max - 1).join('') + '…';
}

export function cryptoPayDescription(word: string, boardId: string): string {
  return clip(`The Last Word: «${displayWord(word)}» on the ${String(boardId).toUpperCase()} board`, CRYPTO_PAY_DESCRIPTION_MAX);
}

export function starsInvoiceTexts(word: string, boardId: string): { title: string; description: string; label: string } {
  const w = displayWord(word);
  return {
    title: clip(`The Last Word — ${String(boardId).toUpperCase()} board`, TG_TITLE_MAX),
    description: clip(`Set your word: «${w}». Stars balance is game credit only and cannot be withdrawn.`, TG_DESCRIPTION_MAX),
    label: clip(`Word: ${w}`, 64)
  };
}
