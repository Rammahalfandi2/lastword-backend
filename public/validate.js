/* Word rules — keep in sync with api/_validate.ts (tests/validate.test.ts checks this). */
(function (root) {
  var MAX_WORD_LENGTH = 20;
  var BLOCKED_TERMS = [
    'ربح', 'استثمار', 'عائد', 'profit', 'invest', 'return', 'returns', 'roi',
    'http://', 'https://', 'www.', '.com', '.net', '.org', '.io',
    '@', 'telegram.me', 't.me',
    'fuck', 'shit', 'ass', 'bitch', 'nigger', 'faggot',
    'isis', 'داعش', 'نازي', 'nazi', 'hitler',
    'كلب', 'حمار', 'عاهرة'
  ];
  var BLOCKED_REGEX = [
    /https?:\/\//i,
    /www\./i,
    /\.(com|net|org|io|xyz|club)\b/i,
    /[^\p{L}\p{N}\s\-_']/u,
    /\d{5,}/
  ];
  function isWordAllowed(word) {
    var w = String(word == null ? '' : word).trim();
    var lower = w.toLowerCase();
    if (w.length > MAX_WORD_LENGTH) return { ok: false, code: 'too_long' };
    if (w.length < 1) return { ok: false, code: 'empty' };
    for (var i = 0; i < BLOCKED_TERMS.length; i++) {
      if (lower.indexOf(BLOCKED_TERMS[i].toLowerCase()) !== -1) return { ok: false, code: 'blocked' };
    }
    for (var j = 0; j < BLOCKED_REGEX.length; j++) {
      if (BLOCKED_REGEX[j].test(w)) return { ok: false, code: 'chars' };
    }
    return { ok: true };
  }
  var api = { isWordAllowed: isWordAllowed, MAX_WORD_LENGTH: MAX_WORD_LENGTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LWValidate = api;
})(this);
