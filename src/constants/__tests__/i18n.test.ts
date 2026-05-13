import { translations } from '../i18n';

describe('i18n translations', () => {
  const bgKeys = Object.keys(translations.bg);
  const enKeys = Object.keys(translations.en);

  it('should have both bg and en locales', () => {
    expect(translations.bg).toBeDefined();
    expect(translations.en).toBeDefined();
  });

  it('should have the same keys in both locales', () => {
    const missingInEn = bgKeys.filter((k) => !(k in translations.en));
    const missingInBg = enKeys.filter((k) => !(k in translations.bg));

    expect(missingInEn).toEqual([]);
    expect(missingInBg).toEqual([]);
  });

  it('should have no empty translation values', () => {
    const emptyBg = bgKeys.filter((k) => translations.bg[k].trim() === '');
    const emptyEn = enKeys.filter((k) => translations.en[k].trim() === '');

    expect(emptyBg).toEqual([]);
    expect(emptyEn).toEqual([]);
  });

  it('should resolve known keys correctly in BG', () => {
    expect(translations.bg['tab.home']).toBe('Начало');
    expect(translations.bg['tab.workouts']).toBe('Тренировки');
    expect(translations.bg['profile.logout']).toBe('Излез');
  });

  it('should resolve known keys correctly in EN', () => {
    expect(translations.en['tab.home']).toBe('Home');
    expect(translations.en['tab.workouts']).toBe('Workouts');
    expect(translations.en['profile.logout']).toBe('Log Out');
  });

  it('should have matching interpolation placeholders', () => {
    const placeholderPattern = /\{(\w+)\}/g;

    for (const key of bgKeys) {
      const bgPlaceholders = [...translations.bg[key].matchAll(placeholderPattern)].map((m) => m[1]).sort();
      const enValue = translations.en[key];
      if (!enValue) continue;
      const enPlaceholders = [...enValue.matchAll(placeholderPattern)].map((m) => m[1]).sort();

      expect({ key, placeholders: bgPlaceholders }).toEqual({ key, placeholders: enPlaceholders });
    }
  });
});
