// Word rules shared by the API (initiate-payment). The Mini App has a copy in
// public/validate.js; tests/validate.test.ts checks both behave the same.
export const MAX_WORD_LENGTH = 20;

export const BLOCKED_TERMS = [
  // Financial/investment terms are never allowed
  'ربح', 'استثمار', 'عائد', 'profit', 'invest', 'return', 'returns', 'roi',
  // Links / spam
  'http://', 'https://', 'www.', '.com', '.net', '.org', '.io',
  '@', 'telegram.me', 't.me',
  // Offensive (basic list — extend as needed)
  'fuck', 'shit', 'ass', 'bitch', 'nigger', 'faggot',
  // Political extremism
  'isis', 'داعش', 'نازي', 'nazi', 'hitler',
  // Arabic offensive (basic)
  'كلب', 'حمار', 'عاهرة',
];

export const BLOCKED_REGEX = [
  /https?:\/\//i,                     // URLs
  /www\./i,                           // Web addresses
  /\.(com|net|org|io|xyz|club)\b/i,   // Domains
  /[^\p{L}\p{N}\s\-_']/u,             // Only letters, numbers, spaces, - _ '
  /\d{5,}/,                           // Long number sequences (phone numbers)
];

export type WordCheck = { ok: boolean; code?: 'empty' | 'too_long' | 'blocked' | 'chars'; reason?: string };

export function isWordAllowed(word: string): WordCheck {
  const w = String(word ?? '').trim();
  const lower = w.toLowerCase();
  if (w.length > MAX_WORD_LENGTH) return { ok: false, code: 'too_long', reason: 'Word too long (max 20 characters)' };
  if (w.length < 1) return { ok: false, code: 'empty', reason: 'Word cannot be empty' };
  for (const term of BLOCKED_TERMS) {
    if (lower.includes(term.toLowerCase())) return { ok: false, code: 'blocked', reason: 'This word is not allowed' };
  }
  for (const pattern of BLOCKED_REGEX) {
    if (pattern.test(w)) return { ok: false, code: 'chars', reason: 'This word contains disallowed content (links or special characters)' };
  }
  return { ok: true };
}
