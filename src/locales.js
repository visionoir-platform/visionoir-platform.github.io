export const names = {
  it: 'Italiano', en: 'English', es: 'Español', ru: 'Русский', de: 'Deutsch',
  'zh-Hans': '简体中文', ja: '日本語', 'pt-BR': 'Português do Brasil',
  'pt-PT': 'Português de Portugal', ko: '한국어', pl: 'Polski', fr: 'Français',
  uk: 'Українська', ar: 'العربية', sw: 'Kiswahili', 'de-CH': 'Deutsch, Schweiz',
  'fr-CH': 'Français, Suisse', 'it-CH': 'Italiano, Svizzera', 'rm-CH': 'Rumantsch, Svizra',
};
export const parents = { 'de-CH':'de', 'fr-CH':'fr', 'it-CH':'it', 'pt-BR':'pt-PT' };
export const site = 'https://visionoir-platform.github.io/';
export const localePath = (lang) => `/${lang.toLowerCase()}/`;

export function parseCatalogue(source) {
  const parsed = {};
  for (const line of source.trim().split(/\r?\n/)) {
    const sep = line.indexOf('|');
    const key = line.slice(0, sep);
    const value = line.slice(sep + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9]+$/.test(key) || !value || Object.hasOwn(parsed, key)) {
      throw new Error(`Invalid catalogue entry: ${key}`);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function matchLocale(raw, available) {
  if (!raw) return null;
  let locale;
  try { locale = new Intl.Locale(raw.replaceAll('_','-')); }
  catch { return null; }
  const { language, script, region } = locale;
  if (language === 'zh' && (script === 'Hant' || ['TW','HK','MO'].includes(region))) return null;
  const overrides = { zh:'zh-Hans', rm:'rm-CH', pt: region === 'BR' ? 'pt-BR' : 'pt-PT' };
  const candidates = [locale.baseName, `${language}-${region}`, overrides[language], language];
  return candidates.find(tag => available.includes(tag)) ?? null;
}

const countryLanguages = {
  IT:'it', ES:'es', BR:'pt-BR', PT:'pt-PT', DE:'de', AT:'de', FR:'fr',
  GB:'en', US:'en', AU:'en', PL:'pl', UA:'uk', RU:'ru', CN:'zh-Hans',
  JP:'ja', KR:'ko', SA:'ar', EG:'ar', MA:'ar', AE:'ar', TZ:'sw', KE:'sw',
  MX:'es', CO:'es', AR:'es', CL:'es',
};
const multilingual = {
  CH:['de-CH','fr-CH','it-CH','rm-CH'], CA:['en','fr'], BE:['fr','de'], LU:['fr','de'],
};
export function resolveLocale({ manual, explicit, saved, country, languages = [], available }) {
  for (const raw of [manual,explicit,saved]) {
    const found = matchLocale(raw, available);
    if (found) return found;
  }
  if (country) {
    const regional = multilingual[country];
    if (regional) {
      for (const raw of languages) {
        const choice = regional.find(tag => tag.split('-')[0] === raw.toLowerCase().split('-')[0]);
        if (choice && available.includes(choice)) return choice;
      }
    }
    const found = matchLocale(regional?.[0] || countryLanguages[country], available);
    if (found) return found;
  }
  return languages.map(raw => matchLocale(raw,available)).find(Boolean) || 'it';
}
