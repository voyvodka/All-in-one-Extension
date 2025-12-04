const messages = {
  tr: {
    tabFeatures: 'Özellikler',
    tabDownloads: 'İndirmeler',
    subtabActive: 'Aktif',
    subtabHistory: 'Geçmiş',
    sort: 'Sırala',
    clearHistory: 'Geçmişi temizle',
    noRecords: 'Kayıt yok.',
    statusPreparing: 'Hazırlanıyor',
    statusDownloading: 'İndiriliyor',
    statusCompleted: 'Tamamlandı',
    statusFailed: 'Hata',
    statusCancelled: 'İptal edildi',
    statusUserCancelled: 'İndirme kabul edilmedi',
    errorUnsupportedUrl: 'Desteklenmeyen bağlantı',
    downloadFallback: 'İndirme',
    typeLabel: 'Tür',
    fileNameLabel: 'Dosya adı',
    sourceLabel: 'Kaynak',
    statusLabel: 'Durum',
    dateLabel: 'Tarih',
    errorLabel: 'Hata',
    cancel: 'İptal',
    retry: 'İndir',
    toggleDetails: 'Detayları aç/kapat',
    language: 'Dil',
    languageTr: 'Türkçe',
    languageEn: 'İngilizce',
    bugTitle: 'Hata bildir',
    donateTitle: 'Destekle'
  },
  en: {
    tabFeatures: 'Features',
    tabDownloads: 'Downloads',
    subtabActive: 'Active',
    subtabHistory: 'History',
    sort: 'Sort',
    clearHistory: 'Clear history',
    language: 'Language',
    languageTr: 'Türkçe',
    languageEn: 'English',
    noRecords: 'No records.',
    statusPreparing: 'Preparing',
    statusDownloading: 'Downloading',
    statusCompleted: 'Completed',
    statusFailed: 'Error',
    statusCancelled: 'Cancelled',
    statusUserCancelled: 'Download rejected',
    errorUnsupportedUrl: 'Unsupported URL',
    downloadFallback: 'Download',
    typeLabel: 'Type',
    fileNameLabel: 'File name',
    sourceLabel: 'Source',
    statusLabel: 'Status',
    dateLabel: 'Date',
    errorLabel: 'Error',
    cancel: 'Cancel',
    retry: 'Download',
    toggleDetails: 'Toggle details',
    bugTitle: 'Report a bug',
    donateTitle: 'Support'
  }
};

let currentLocale;

export function resolveLocale(preferred) {
  const normalized = preferred?.toLowerCase();
  if (normalized && messages[normalized]) return normalized;
  const browserLang = chrome?.i18n?.getUILanguage?.() || navigator.language || 'en';
  return browserLang.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function setLocale(localeCode) {
  currentLocale = resolveLocale(localeCode);
  return currentLocale;
}

export function getLocale(preferred) {
  if (!currentLocale || preferred) {
    currentLocale = resolveLocale(preferred || currentLocale);
  }
  return currentLocale;
}

export function t(key) {
  const locale = getLocale();
  return messages[locale]?.[key] ?? messages.en[key] ?? key;
}

const featureMessages = {
  'youtube-mp3-download': {
    label: { tr: 'YouTube MP3 İndir', en: 'YouTube MP3 Download' },
    description: {
      tr: 'YouTube paylaş paneline MP3 indir kısayolu ekler.',
      en: 'Adds an MP3 download shortcut to the YouTube share panel.'
    }
  },
  'youtube-mp4-download': {
    label: { tr: 'YouTube MP4 İndir', en: 'YouTube MP4 Download' },
    description: {
      tr: 'YouTube paylaş paneline MP4 indir kısayolu ekler.',
      en: 'Adds an MP4 download shortcut to the YouTube share panel.'
    }
  },
  'instagram-reels-mp3': {
    label: { tr: 'Instagram MP3 İndir', en: 'Reels MP3 Download' },
    description: {
      tr: 'Instagram Reels için MP3 indir kısayolu ekler.',
      en: 'Adds an MP3 download shortcut for Instagram Reels.'
    }
  },
  'instagram-reels-mp4': {
    label: { tr: 'Instagram MP4 İndir', en: 'Reels MP4 Download' },
    description: {
      tr: 'Instagram Reels için MP4 indir kısayolu ekler.',
      en: 'Adds an MP4 download shortcut for Instagram Reels.'
    }
  },
  'twitter-mp3-download': {
    label: { tr: 'Twitter MP3 İndir', en: 'Twitter MP3 Download' },
    description: {
      tr: 'Twitter/X paylaşım menüsüne MP3 indir kısayolu ekler.',
      en: 'Adds an MP3 download shortcut to the Twitter/X share menu.'
    }
  },
  'twitter-mp4-download': {
    label: { tr: 'Twitter MP4 İndir', en: 'Twitter MP4 Download' },
    description: {
      tr: 'Twitter/X paylaşım menüsüne MP4 indir kısayolu ekler.',
      en: 'Adds an MP4 download shortcut to the Twitter/X share menu.'
    }
  }
};

export function translateFeature(feature) {
  const locale = getLocale();
  const msg = featureMessages[feature.id];
  return {
    label: msg?.label?.[locale] ?? msg?.label?.en ?? feature.label,
    description: msg?.description?.[locale] ?? msg?.description?.en ?? feature.description
  };
}
