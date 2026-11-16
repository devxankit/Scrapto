/**
 * Translations for the i18next keys (`t('tabs.home')`). English is the source.
 * Hindi is written by hand here; every key it doesn't cover, and every other
 * language, is filled from generated/<lang>.json (machine translated by
 * `npm run i18n`). Text written directly in the screens is translated by
 * auto.ts. All non-English text is a draft for language reviewers.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { GENERATED } from './generated';

const en = {
  common: {
    continue: 'Continue', next: 'Next', save: 'Save', cancel: 'Cancel', done: 'Done', call: 'Call', chat: 'Chat',
    seeAll: 'See all', submit: 'Submit', ok: 'OK', retry: 'Try again', edit: 'Edit', change: 'Change', back: 'Back',
  },
  tabs: { home: 'Home', market: 'Market', jobs: 'Jobs', wallet: 'Wallet', profile: 'Profile' },
  lang: { title: 'Choose your language', sub: 'You can change this later in Profile' },
  phone: {
    title: 'Log in or sign up', sub: "We'll send a 6-digit code to verify your number", getOtp: 'Get OTP',
  },
  otp: { title: 'Verify your number', verify: 'Verify & continue', resend: 'Resend code' },
};

const hi = {
  common: {
    continue: 'आगे बढ़ें', next: 'आगे', save: 'सेव करें', cancel: 'रद्द करें', done: 'हो गया', call: 'कॉल', chat: 'चैट',
    seeAll: 'सभी देखें', submit: 'जमा करें', ok: 'ठीक है', retry: 'फिर कोशिश करें', edit: 'बदलें', change: 'बदलें', back: 'वापस',
  },
  tabs: { home: 'होम', market: 'मार्केट', jobs: 'पिकअप', wallet: 'वॉलेट', profile: 'प्रोफ़ाइल' },
  lang: { title: 'अपनी भाषा चुनें', sub: 'आप इसे बाद में प्रोफ़ाइल में बदल सकते हैं' },
  phone: { title: 'लॉग इन या साइन अप करें', sub: 'आपका नंबर जाँचने के लिए हम 6 अंकों का कोड भेजेंगे', getOtp: 'OTP पाएँ' },
  otp: { title: 'अपना नंबर सत्यापित करें', verify: 'सत्यापित करें और आगे बढ़ें', resend: 'कोड फिर भेजें' },
};

type Tree = { [key: string]: string | Tree };

/** Generated flat keys ("tabs.home") as a tree, with the hand-written `own` text on top. */
function complete(lang: string, own: Tree): Tree {
  const out: Tree = {};
  for (const [key, text] of Object.entries(GENERATED[lang]?.keys ?? {})) {
    const path = key.split('.');
    let at = out;
    path.slice(0, -1).forEach((p) => {
      if (typeof at[p] !== 'object') at[p] = {};
      at = at[p] as Tree;
    });
    at[path[path.length - 1]] = text;
  }
  const lay = (to: Tree, from: Tree) => {
    for (const [k, v] of Object.entries(from)) {
      if (typeof v === 'object') {
        if (typeof to[k] !== 'object') to[k] = {};
        lay(to[k] as Tree, v);
      } else to[k] = v;
    }
  };
  lay(out, own);
  return out;
}

const written: Record<string, Tree> = { hi };

const resources: Record<string, { translation: Tree }> = { en: { translation: en } };
for (const lang of Object.keys(GENERATED)) {
  resources[lang] = { translation: complete(lang, written[lang] ?? {}) };
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
