// Bot profile texts per language (set by POST /api/setup-profile). '' = default (English).
export const PROFILE_LANGS = ['', 'en', 'ar', 'ru'] as const;
export type ProfileLang = typeof PROFILE_LANGS[number];

export const BOT_NAME = 'Last Word ✍️👑';

const SHORT: Record<'en' | 'ar' | 'ru', string> = {
  en: 'One word. Shown to everyone. Until someone pays more to replace it. 🌍 EN · AR · RU',
  ar: 'كلمة وحدة يشوفها الكل… لحد ما حدا يدفع أكتر ويستبدلها. 🌍 EN · AR · RU',
  ru: 'Одно слово. Его видят все. Пока кто-то не заплатит больше и не заменит его. 🌍 EN · AR · RU',
};

const DESC: Record<'en' | 'ar' | 'ru', string> = {
  en: `✍️ The Last Word on the Internet

There is one public word on each board, and anyone can see it.
Want it to be yours? Buy it, and your word replaces it.

👑 Every new purchase costs 20% more
⏳ Weekly rounds, Hall of Fame for the legends
🌍 Three boards: English · العربية · Русский
💳 Pay with Telegram Stars or USDT

What will your word be?`,
  ar: `✍️ الكلمة الأخيرة على الإنترنت

بكل لوح في كلمة وحدة، وكل الناس بتشوفها.
بدك تكون كلمتك؟ اشتريها، وبتصير كلمتك مكانها.

👑 كل شراء جديد سعره أعلى بـ 20%
⏳ جولات أسبوعية، ولوحة شرف للأساطير
🌍 تلات ألواح: English · العربية · Русский
💳 الدفع بنجوم تيليغرام أو USDT

شو رح تكون كلمتك؟`,
  ru: `✍️ Последнее слово в интернете

На каждой доске есть одно публичное слово, и его видят все.
Хочешь, чтобы оно было твоим? Купи его, и твоё слово займёт его место.

👑 Каждая новая покупка дороже на 20%
⏳ Еженедельные раунды и Зал славы для легенд
🌍 Три доски: English · العربية · Русский
💳 Оплата Telegram Stars или USDT

Каким будет твоё слово?`,
};

const COMMANDS: Record<'en' | 'ar' | 'ru', { command: string; description: string }[]> = {
  en: [
    { command: 'start', description: 'Open the game' },
    { command: 'balance', description: 'My balance' },
    { command: 'withdraw', description: 'Withdraw USDT' },
    { command: 'scores', description: 'Hall of Fame' },
    { command: 'terms', description: 'Terms of use' },
    { command: 'support', description: 'Support' },
    { command: 'paysupport', description: 'Payment help' },
  ],
  ar: [
    { command: 'start', description: 'افتح اللعبة' },
    { command: 'balance', description: 'رصيدي' },
    { command: 'withdraw', description: 'سحب USDT' },
    { command: 'scores', description: 'لوحة الشرف' },
    { command: 'terms', description: 'شروط الاستخدام' },
    { command: 'support', description: 'الدعم' },
    { command: 'paysupport', description: 'مساعدة بالدفع' },
  ],
  ru: [
    { command: 'start', description: 'Открыть игру' },
    { command: 'balance', description: 'Мой баланс' },
    { command: 'withdraw', description: 'Вывести USDT' },
    { command: 'scores', description: 'Зал славы' },
    { command: 'terms', description: 'Условия' },
    { command: 'support', description: 'Поддержка' },
    { command: 'paysupport', description: 'Помощь с оплатой' },
  ],
};

const base = (lang: ProfileLang): 'en' | 'ar' | 'ru' => (lang === '' ? 'en' : lang);

export function profileFor(lang: ProfileLang) {
  const b = base(lang);
  return { name: BOT_NAME, short_description: SHORT[b], description: DESC[b], commands: COMMANDS[b] };
}
