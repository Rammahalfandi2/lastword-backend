/* The Last Word — Telegram Mini App (no framework). All user text is rendered with textContent. */
(function () {
  'use strict';
  var BOT = 'word2027_Bot';
  var BOARDS = ['en', 'ar', 'ru'];
  var STARS_PER_USD = 77;

  var I18N = {
    en: {
      title: 'The Last Word', tagline: 'The last word on the internet — a fame game',
      openInTg: 'Open the game inside Telegram to buy and see your balance.', openBot: 'Open the bot',
      currentWord: 'Current word', noWord: 'No word yet — be the first!', by: 'by',
      priceNow: 'Price now', nextPrice: 'Next price', nextHint: 'after the next buy',
      round: 'Round {n}', endsIn: 'ends in', ended: 'Round ended — a new one starts soon', toCap: 'Progress to round cap',
      buyTitle: 'Buy the word', wordPlaceholder: 'Type your word', wordHint: 'Letters and numbers only, up to 20 characters.',
      payWith: 'Pay with', usdtSub: 'via CryptoBot · withdrawable refunds', starsSub: 'in-game credit only',
      refundNote: 'If someone takes your word, what you paid comes back to your in-game balance with a 5% bonus.',
      buyFor: 'Buy for {p}', preparing: 'Preparing payment…', loading: 'Loading…',
      err_empty: 'Type a word first', err_too_long: 'Max 20 characters', err_blocked: 'This word is not allowed',
      err_chars: 'Letters and numbers only — no links or symbols', err_rate: 'Too many attempts. Wait a minute.',
      err_auth: 'Please reopen the game from the bot.', err_generic: 'Something went wrong. Try again.',
      paid: 'Paid! Your word will appear in a few seconds.', cancelled: 'Payment cancelled.', failed: 'Payment failed.',
      usdtOpened: 'Finish the payment in CryptoBot, then come back here.', updated: 'Board updated!',
      fameTitle: 'Hall of Fame', fameEmpty: 'No winners yet. Be the first!',
      balanceTitle: 'My balance', usdtNote: 'withdrawable', starsNote: 'game credit, not withdrawable',
      withdrawTitle: 'Withdraw USDT', withdrawInfo: 'Send this command to the bot:',
      withdrawRules: 'Minimum $5, up to $100 per day. Every request is reviewed manually.',
      rulesTitle: 'How it works', fullTerms: 'Full terms', support: 'Support',
      tabGame: 'Game', tabFame: 'Fame', tabBalance: 'Balance', tabRules: 'Rules',
      d: 'd',
      rules: [
        'A game for fun and fame: hold the word when the round ends and your name goes into the Hall of Fame.',
        'Every purchase raises the price by 20% (at least $1). A round lasts 7 days or until the price reaches $500.',
        'If someone takes your word, what you paid comes back to your in-game balance with a 5% bonus.',
        'Stars balance is in-game credit only and cannot be withdrawn. USDT balance can be withdrawn (min $5, $100/day, manual review).',
        'No links, ads, offensive or political words. The admin may remove a word and refund it.',
        'Stars payments are final under Telegram rules.'
      ]
    },
    ar: {
      title: 'الكلمة الأخيرة', tagline: 'آخر كلمة على الإنترنت — لعبة شهرة',
      openInTg: 'افتح اللعبة داخل تيليغرام لتشتري وتشوف رصيدك.', openBot: 'فتح البوت',
      currentWord: 'الكلمة الحالية', noWord: 'لا توجد كلمة بعد — كن الأول!', by: 'بواسطة',
      priceNow: 'السعر الآن', nextPrice: 'السعر التالي', nextHint: 'بعد الشراء القادم',
      round: 'الجولة {n}', endsIn: 'تنتهي خلال', ended: 'انتهت الجولة — جولة جديدة قريبًا', toCap: 'التقدّم نحو سقف الجولة',
      buyTitle: 'اشترِ الكلمة', wordPlaceholder: 'اكتب كلمتك', wordHint: 'حروف وأرقام فقط، حتى 20 حرفًا.',
      payWith: 'الدفع عبر', usdtSub: 'عبر CryptoBot · الاسترداد قابل للسحب', starsSub: 'رصيد داخل اللعبة فقط',
      refundNote: 'إذا أخذ أحدٌ كلمتك، يرجع المبلغ الذي دفعته إلى رصيدك داخل اللعبة مع مكافأة 5%.',
      buyFor: 'اشترِ بـ {p}', preparing: 'جارٍ تجهيز الدفع…', loading: 'جارٍ التحميل…',
      err_empty: 'اكتب كلمة أولًا', err_too_long: 'الحد الأقصى 20 حرفًا', err_blocked: 'هذه الكلمة غير مسموحة',
      err_chars: 'حروف وأرقام فقط — بدون روابط أو رموز', err_rate: 'محاولات كثيرة. انتظر دقيقة.',
      err_auth: 'أعد فتح اللعبة من البوت.', err_generic: 'حدث خطأ. حاول مرة أخرى.',
      paid: 'تم الدفع! ستظهر كلمتك خلال ثوانٍ.', cancelled: 'تم إلغاء الدفع.', failed: 'فشل الدفع.',
      usdtOpened: 'أكمل الدفع في CryptoBot ثم ارجع إلى هنا.', updated: 'تم تحديث اللوحة!',
      fameTitle: 'قاعة المشاهير', fameEmpty: 'لا يوجد فائزون بعد. كن الأول!',
      balanceTitle: 'رصيدي', usdtNote: 'قابل للسحب', starsNote: 'رصيد لعب، غير قابل للسحب',
      withdrawTitle: 'سحب USDT', withdrawInfo: 'أرسل هذا الأمر إلى البوت:',
      withdrawRules: 'الحد الأدنى 5$، وحتى 100$ يوميًا. كل طلب يُراجع يدويًا.',
      rulesTitle: 'كيف تعمل اللعبة', fullTerms: 'الشروط الكاملة', support: 'الدعم',
      tabGame: 'اللعبة', tabFame: 'المشاهير', tabBalance: 'رصيدي', tabRules: 'القواعد',
      d: 'يوم',
      rules: [
        'لعبة للمتعة والشهرة: إذا كانت الكلمة لك عند نهاية الجولة يدخل اسمك قاعة المشاهير.',
        'كل عملية شراء ترفع السعر 20% (دولار واحد على الأقل). تستمر الجولة 7 أيام أو حتى يصل السعر إلى 500$.',
        'إذا أخذ أحدٌ كلمتك، يرجع المبلغ الذي دفعته إلى رصيدك داخل اللعبة مع مكافأة 5%.',
        'رصيد النجوم للعب فقط ولا يمكن سحبه. رصيد USDT يمكن سحبه (الحد الأدنى 5$، 100$ يوميًا، مراجعة يدوية).',
        'ممنوع الروابط والإعلانات والكلمات المسيئة أو السياسية. يحق للإدارة حذف أي كلمة وإرجاع ثمنها.',
        'مدفوعات النجوم نهائية حسب قواعد تيليغرام.'
      ]
    },
    ru: {
      title: 'Последнее слово', tagline: 'Последнее слово в интернете — игра на славу',
      openInTg: 'Откройте игру в Telegram, чтобы купить слово и увидеть баланс.', openBot: 'Открыть бота',
      currentWord: 'Текущее слово', noWord: 'Слова пока нет — будьте первым!', by: 'от',
      priceNow: 'Цена сейчас', nextPrice: 'Следующая цена', nextHint: 'после следующей покупки',
      round: 'Раунд {n}', endsIn: 'до конца', ended: 'Раунд завершён — скоро начнётся новый', toCap: 'Прогресс до лимита раунда',
      buyTitle: 'Купить слово', wordPlaceholder: 'Введите слово', wordHint: 'Только буквы и цифры, до 20 символов.',
      payWith: 'Оплата', usdtSub: 'через CryptoBot · возврат можно вывести', starsSub: 'только игровой баланс',
      refundNote: 'Если ваше слово перекупят, уплаченная сумма вернётся на игровой баланс с бонусом 5%.',
      buyFor: 'Купить за {p}', preparing: 'Готовим оплату…', loading: 'Загрузка…',
      err_empty: 'Сначала введите слово', err_too_long: 'Максимум 20 символов', err_blocked: 'Это слово запрещено',
      err_chars: 'Только буквы и цифры — без ссылок и символов', err_rate: 'Слишком много попыток. Подождите минуту.',
      err_auth: 'Откройте игру заново из бота.', err_generic: 'Что-то пошло не так. Попробуйте ещё раз.',
      paid: 'Оплачено! Слово появится через несколько секунд.', cancelled: 'Оплата отменена.', failed: 'Оплата не прошла.',
      usdtOpened: 'Завершите оплату в CryptoBot и вернитесь сюда.', updated: 'Доска обновлена!',
      fameTitle: 'Зал славы', fameEmpty: 'Победителей пока нет. Будьте первым!',
      balanceTitle: 'Мой баланс', usdtNote: 'можно вывести', starsNote: 'игровой баланс, вывод невозможен',
      withdrawTitle: 'Вывод USDT', withdrawInfo: 'Отправьте боту команду:',
      withdrawRules: 'Минимум $5, до $100 в день. Каждая заявка проверяется вручную.',
      rulesTitle: 'Как это работает', fullTerms: 'Полные условия', support: 'Поддержка',
      tabGame: 'Игра', tabFame: 'Слава', tabBalance: 'Баланс', tabRules: 'Правила',
      d: 'д',
      rules: [
        'Игра ради удовольствия и славы: если слово ваше в конце раунда, ваше имя попадает в Зал славы.',
        'Каждая покупка поднимает цену на 20% (минимум на $1). Раунд длится 7 дней или пока цена не дойдёт до $500.',
        'Если ваше слово перекупят, уплаченная сумма вернётся на игровой баланс с бонусом 5%.',
        'Баланс Stars — только игровой, вывести его нельзя. Баланс USDT можно вывести (от $5, до $100 в день, ручная проверка).',
        'Запрещены ссылки, реклама, оскорбительные и политические слова. Администратор может удалить слово и вернуть оплату.',
        'Оплата Stars окончательна по правилам Telegram.'
      ]
    }
  };

  var tg = window.Telegram && window.Telegram.WebApp;
  var initData = (tg && tg.initData) || '';
  var inTelegram = !!initData;
  var user = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || null;

  function pickLang() {
    var q = new URLSearchParams(location.search).get('lang');
    var code = (q || (user && user.language_code) || navigator.language || 'en').toLowerCase();
    if (code.indexOf('ar') === 0) return 'ar';
    if (code.indexOf('ru') === 0) return 'ru';
    return 'en';
  }
  var lang = pickLang();
  var T = I18N[lang];
  function t(key, vars) {
    var s = T[key] != null ? T[key] : I18N.en[key];
    if (vars) Object.keys(vars).forEach(function (k) { s = String(s).replace('{' + k + '}', vars[k]); });
    return s;
  }

  var $ = function (id) { return document.getElementById(id); };
  var state = { board: lang, data: null, method: 'usdt', busy: false, lastWord: null, pollUntil: 0 };

  // Wrap numbers in Unicode LTR isolates so they read correctly inside Arabic text.
  function ltr(s) { return '\u2066' + s + '\u2069'; }
  function usd(cents) { return ltr('$' + (Number(cents || 0) / 100).toFixed(2)); }
  function starsFor(cents) { return Math.ceil((cents / 100) * STARS_PER_USD); }
  function nextPrice(c) { return c + Math.max(Math.floor(c * 0.2), 100); }
  function haptic(kind) { try { tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred(kind); } catch (e) {} }
  function tick() { try { tg && tg.HapticFeedback && tg.HapticFeedback.selectionChanged(); } catch (e) {} }

  var toastTimer;
  function toast(msg) {
    var el = $('toast'); el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 3200);
  }

  function openBot(param) {
    var url = 'https://t.me/' + BOT + (param ? '?start=' + encodeURIComponent(param) : '');
    if (tg && tg.openTelegramLink && inTelegram) tg.openTelegramLink(url); else window.open(url, '_blank');
  }

  // ── i18n / layout ───────────────────────────────────────────────
  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $('wordInput').placeholder = t('wordPlaceholder');
    document.title = t('title');
    var ul = $('rulesList'); ul.textContent = '';
    T.rules.forEach(function (r) { var li = document.createElement('li'); li.textContent = r; ul.appendChild(li); });
  }

  // ── API ─────────────────────────────────────────────────────────
  function api(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    if (opts.auth) headers['X-Telegram-Init-Data'] = initData;
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, data: j }; }); });
  }

  // ── Board state ─────────────────────────────────────────────────
  function loadState(silent) {
    var board = state.board;
    if (!silent) $('word').classList.add('skeleton');
    return api('/api/state?board=' + board).then(function (r) {
      if (board !== state.board) return;
      $('word').classList.remove('skeleton');
      if (!r.ok) return;
      var prev = state.data;
      state.data = r.data;
      renderState();
      if (prev && prev.board_id === r.data.board_id && prev.current_word !== r.data.current_word && Date.now() < state.pollUntil) {
        toast(t('updated')); haptic('success'); state.pollUntil = 0;
      }
    }).catch(function () { $('word').classList.remove('skeleton'); });
  }

  function renderState() {
    var d = state.data; if (!d) return;
    var wordEl = $('word');
    if (d.current_word) { wordEl.textContent = d.current_word; wordEl.classList.remove('empty'); }
    else { wordEl.textContent = t('noWord'); wordEl.classList.add('empty'); }
    var owner = $('owner'); owner.textContent = '';
    if (d.current_owner) {
      owner.appendChild(document.createTextNode(t('by') + ' '));
      var b = document.createElement('b'); b.textContent = d.current_owner; owner.appendChild(b);
    }
    var price = d.current_price_cents || 100;
    var next = d.next_price_cents || nextPrice(price);
    var stars = d.current_price_stars || starsFor(price);
    $('priceNow').textContent = usd(price);
    $('priceStars').textContent = '≈ ' + stars + ' ⭐';
    $('priceNext').textContent = usd(next);
    $('mUsdt').textContent = usd(price);
    $('mStars').textContent = stars + ' ⭐';
    var cap = d.cap_cents || 50000;
    $('capFill').style.width = Math.min(100, (price / cap) * 100).toFixed(1) + '%';
    $('capText').textContent = ltr(usd(price) + ' / ' + usd(cap));
    $('roundLabel').textContent = d.round ? t('round', { n: d.round.number }) + ' · ' + t('endsIn') : '';
    updateCountdown();
    updateBuyButton();
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function updateCountdown() {
    var d = state.data; var el = $('countdown');
    if (!d || !d.round || !d.round.ends_at) { el.textContent = '—'; return; }
    var ms = new Date(d.round.ends_at).getTime() - Date.now();
    if (ms <= 0 || d.round.status !== 'active') {
      el.textContent = '';
      $('roundLabel').textContent = t('ended');
      if (ms <= 0 && ms > -15000) loadState(true);
      return;
    }
    var s = Math.floor(ms / 1000), days = Math.floor(s / 86400); s %= 86400;
    var h = Math.floor(s / 3600); s %= 3600; var m = Math.floor(s / 60); s %= 60;
    el.textContent = (days ? ltr(days) + ' ' + t('d') + '  ' : '') + ltr(pad(h) + ':' + pad(m) + ':' + pad(s));
  }

  // ── Buy flow ────────────────────────────────────────────────────
  function validate(show) {
    var v = $('wordInput').value;
    var res = window.LWValidate.isWordAllowed(v);
    $('counter').textContent = v.trim().length + '/20';
    var hint = $('wordHint'), input = $('wordInput');
    if (!res.ok && (show || v.length)) {
      if (res.code === 'empty' && !show) { hint.textContent = t('wordHint'); hint.classList.remove('bad'); input.classList.remove('bad'); }
      else { hint.textContent = t('err_' + res.code); hint.classList.add('bad'); input.classList.add('bad'); }
    } else { hint.textContent = t('wordHint'); hint.classList.remove('bad'); input.classList.remove('bad'); }
    return res.ok;
  }

  function updateBuyButton() {
    var btn = $('buyBtn'); var d = state.data;
    if (state.busy) { btn.textContent = t('preparing'); btn.disabled = true; return; }
    if (!d) { btn.textContent = t('loading'); btn.disabled = true; return; }
    var price = d.current_price_cents || 100;
    btn.textContent = t('buyFor', { p: state.method === 'stars' ? ltr((d.current_price_stars || starsFor(price)) + ' ⭐') : usd(price) });
    var roundOk = d.round && d.round.status === 'active' && new Date(d.round.ends_at).getTime() > Date.now();
    btn.disabled = !inTelegram || !roundOk || !window.LWValidate.isWordAllowed($('wordInput').value).ok;
  }

  function setStatus(msg, kind) { var el = $('buyStatus'); el.textContent = msg || ''; el.className = 'status' + (kind ? ' ' + kind : ''); }

  function buy() {
    if (state.busy || !validate(true)) { haptic('error'); return; }
    if (!inTelegram) { setStatus(t('openInTg'), 'bad'); return; }
    state.busy = true; updateBuyButton(); setStatus('');
    api('/api/initiate-payment', {
      method: 'POST', auth: true,
      body: { board_id: state.board, word: $('wordInput').value.trim(), payment_method: state.method }
    }).then(function (r) {
      state.busy = false; updateBuyButton();
      if (!r.ok) {
        haptic('error');
        if (r.status === 401) return setStatus(t('err_auth'), 'bad');
        if (r.status === 429) return setStatus(t('err_rate'), 'bad');
        if (r.data && r.data.code) return setStatus(t('err_' + r.data.code), 'bad');
        setStatus((r.data && r.data.error) || t('err_generic'), 'bad');
        loadState(true);
        return;
      }
      var p = r.data;
      if (p.method === 'stars') {
        if (p.invoice_link && tg.openInvoice) {
          tg.openInvoice(p.invoice_link, function (status) {
            if (status === 'paid') { haptic('success'); setStatus(t('paid'), 'good'); $('wordInput').value = ''; validate(false); startPolling(); }
            else if (status === 'cancelled') setStatus(t('cancelled'));
            else if (status === 'failed') { haptic('error'); setStatus(t('failed'), 'bad'); }
          });
        } else {
          openBot(p.bot_start); // fallback: the bot sends the Stars invoice
        }
      } else if (p.payment_url) {
        if (/^https:\/\/t\.me\//.test(p.payment_url)) tg.openTelegramLink(p.payment_url); else tg.openLink(p.payment_url);
        setStatus(t('usdtOpened'));
        startPolling();
      } else {
        setStatus(t('err_generic'), 'bad');
      }
    }).catch(function () { state.busy = false; updateBuyButton(); setStatus(t('err_generic'), 'bad'); });
  }

  function startPolling() { state.pollUntil = Date.now() + 5 * 60 * 1000; }

  // ── Hall of Fame ────────────────────────────────────────────────
  function loadFame() {
    api('/api/leaderboard').then(function (r) {
      var list = $('fameList'); list.textContent = '';
      var rows = (r.ok && r.data.leaderboard) || [];
      $('fameEmpty').classList.toggle('hidden', rows.length > 0);
      rows.forEach(function (h, i) {
        var li = document.createElement('li');
        var rank = document.createElement('div'); rank.className = 'rank'; rank.textContent = i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1);
        var grow = document.createElement('div'); grow.className = 'grow';
        var w = document.createElement('div'); w.className = 'w'; w.textContent = h.winning_word || '';
        var meta = document.createElement('div'); meta.className = 'meta';
        var date = h.won_at ? new Date(h.won_at).toLocaleDateString(lang) : '';
        meta.textContent = (h.winner_name || '') + ' · ' + usd(h.final_price_cents) + (date ? ' · ' + date : '');
        grow.appendChild(w); grow.appendChild(meta);
        var badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = String(h.board_id || '').toUpperCase();
        li.appendChild(rank); li.appendChild(grow); li.appendChild(badge);
        list.appendChild(li);
      });
    });
  }

  // ── Balance ─────────────────────────────────────────────────────
  function loadBalance() {
    var st = $('balStatus');
    if (!inTelegram) { st.textContent = t('openInTg'); return; }
    st.textContent = '';
    api('/api/balance', { auth: true }).then(function (r) {
      if (!r.ok) { st.textContent = r.status === 401 ? t('err_auth') : t('err_generic'); return; }
      $('balUsdt').textContent = usd(r.data.balance_usdt_cents);
      $('balStars').textContent = String(r.data.balance_stars || 0);
    });
  }

  // ── Navigation ──────────────────────────────────────────────────
  function showView(name) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('hidden', v.id !== 'view-' + name); });
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === name); });
    if (name === 'fame') loadFame();
    if (name === 'balance') loadBalance();
    window.scrollTo(0, 0);
  }

  function setBoard(b) {
    if (BOARDS.indexOf(b) === -1) b = 'en';
    state.board = b; state.data = null;
    document.querySelectorAll('.board').forEach(function (el) { el.classList.toggle('active', el.getAttribute('data-board') === b); });
    updateBuyButton();
    loadState();
  }

  // ── Init ────────────────────────────────────────────────────────
  function init() {
    if (tg) {
      try { tg.ready(); tg.expand(); } catch (e) {}
      try { tg.setHeaderColor && tg.setHeaderColor('bg_color'); } catch (e) {}
    }
    applyLang();
    $('outside').classList.toggle('hidden', inTelegram);

    document.querySelectorAll('.board').forEach(function (el) {
      el.addEventListener('click', function () { tick(); setBoard(el.getAttribute('data-board')); });
    });
    document.querySelectorAll('.tab').forEach(function (el) {
      el.addEventListener('click', function () { tick(); showView(el.getAttribute('data-view')); });
    });
    document.querySelectorAll('.method').forEach(function (el) {
      el.addEventListener('click', function () {
        tick(); state.method = el.getAttribute('data-method');
        document.querySelectorAll('.method').forEach(function (m) { m.classList.toggle('selected', m === el); });
        updateBuyButton();
      });
    });
    document.querySelectorAll('[data-start]').forEach(function (el) {
      el.addEventListener('click', function () { openBot(el.getAttribute('data-start')); });
    });
    $('wordInput').addEventListener('input', function () { validate(false); updateBuyButton(); setStatus(''); });
    $('wordInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.target.blur(); } });
    $('buyBtn').addEventListener('click', buy);

    setBoard(lang);
    validate(false);
    setInterval(updateCountdown, 1000);
    setInterval(function () { if (!document.hidden) loadState(true); }, 15000);
    setInterval(function () { if (Date.now() < state.pollUntil && !document.hidden) loadState(true); }, 3000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) loadState(true); });
    if (tg && tg.onEvent) tg.onEvent('activated', function () { loadState(true); });
  }

  init();
})();
