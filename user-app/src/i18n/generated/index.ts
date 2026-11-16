/**
 * Translations made by `npm run i18n` (scripts/i18n-extract.mjs, then
 * scripts/i18n-translate.mjs). Do not edit the JSON by hand for app text: fix
 * the wording in `overrides.json` instead, which the script always keeps.
 *
 *  - keys: translations of the i18next keys in ../index.ts (flat "a.b" keys)
 *  - auto: English text -> translation, for text written directly in the screens,
 *          the server's messages and the admin's price list
 */
import hi from './hi.json';
import bn from './bn.json';
import mr from './mr.json';
import te from './te.json';
import ta from './ta.json';
import gu from './gu.json';
import ur from './ur.json';
import kn from './kn.json';
import or from './or.json';
import ml from './ml.json';
import pa from './pa.json';
import asm from './as.json';
import source from './source.json';

export type Generated = { keys: Record<string, string>; auto: Record<string, string> };

export const GENERATED: Record<string, Generated> = { hi, bn, mr, te, ta, gu, ur, kn, or, ml, pa, as: asm };

/** Every English text and pattern ("{0} items selected") the dictionaries cover. */
export const SOURCES: string[] = source;
