export type Language = 'ar' | 'en';

export interface Translations {
  title: string;
  reciter: string;
  moshaf: string;
  surah: string;
  playing: string;
  selectReciter: string;
  selectMoshaf: string;
  selectSurah: string;
  loading: string;
  language: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    title: 'Quran Player',
    reciter: 'Reciter',
    moshaf: 'Recitation Style',
    surah: 'Surah',
    playing: 'Playing',
    selectReciter: 'Select a reciter',
    selectMoshaf: 'Select a recitation style',
    selectSurah: 'Select a surah',
    loading: 'Loading...',
    language: 'Language',
  },
  ar: {
    title: 'مشغل القرآن',
    reciter: 'القارئ',
    moshaf: 'نوع القراءة',
    surah: 'السورة',
    playing: 'جاري التشغيل',
    selectReciter: 'اختر قارئاً',
    selectMoshaf: 'اختر نوع القراءة',
    selectSurah: 'اختر سورة',
    loading: 'جاري التحميل...',
    language: 'اللغة',
  },
};

export const getTranslation = (lang: Language): Translations => {
  return translations[lang] || translations.en;
};

