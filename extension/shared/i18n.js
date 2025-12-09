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
    donateTitle: 'Destekle',
    theme: 'Tema',
    themeSystem: 'Sistem',
    themeLight: 'Açık',
    themeDark: 'Koyu',
    downloadAction: 'İndir',
    downloadAudio: 'Ses indir',
    downloadVideo: 'Video indir',
    downloadImageSingle: 'Fotoğraf indir',
    downloadImageMultiple: 'Tüm fotoğrafları indir (ZIP)',
    twitterUrlNotFound: 'Geçerli tweet URL bulunamadı',
    instagramDownloadIcon: 'İndir',
    instagramPhotoUrlMissing: 'Fotoğraf URL bulunamadı'
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
    donateTitle: 'Support',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    downloadAction: 'Download',
    downloadAudio: 'Download audio',
    downloadVideo: 'Download video',
    downloadImageSingle: 'Download photo',
    downloadImageMultiple: 'Download all photos (ZIP)',
    twitterUrlNotFound: 'Could not find a valid tweet URL',
    instagramDownloadIcon: 'Download',
    instagramPhotoUrlMissing: 'Photo URL not found'
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
  'yt-audio-download': {
    label: { tr: 'YouTube Ses İndir', en: 'YouTube Audio Download' },
    description: {
      tr: 'YouTube paylaş paneline Ses indir kısayolu ekler.',
      en: 'Adds an audio download shortcut to the YouTube share panel.'
    }
  },
  'yt-video-download': {
    label: { tr: 'YouTube Video İndir', en: 'YouTube Video Download' },
    description: {
      tr: 'YouTube paylaş paneline Video indir kısayolu ekler.',
      en: 'Adds a video download shortcut to the YouTube share panel.'
    }
  },
  'ig-audio-download': {
    label: { tr: 'Instagram Ses İndir', en: 'Reels Audio Download' },
    description: {
      tr: 'Instagram Reels için Ses indir kısayolu ekler.',
      en: 'Adds an audio download shortcut for Instagram Reels.'
    }
  },
  'ig-video-download': {
    label: { tr: 'Instagram Video İndir', en: 'Reels Video Download' },
    description: {
      tr: 'Instagram Reels için Video indir kısayolu ekler.',
      en: 'Adds a video download shortcut for Instagram Reels.'
    }
  },
  'ig-image-download': {
    label: { tr: 'Instagram Fotoğraf İndir', en: 'Instagram Photo Download' },
    description: {
      tr: 'Instagram Reels için fotoğraf indirme kısayolu ekler.',
      en: 'Adds a photo download shortcut for Instagram Reels.'
    }
  },
  'x-audio-download': {
    label: { tr: 'Twitter Ses İndir', en: 'Twitter Audio Download' },
    description: {
      tr: 'Tweet altındaki indirme menüsüne Ses indir seçeneğini ekler.',
      en: 'Adds an audio download option to the tweet action menu.'
    }
  },
  'x-video-download': {
    label: { tr: 'Twitter Video İndir', en: 'Twitter Video Download' },
    description: {
      tr: 'Tweet altındaki indirme menüsüne Video indir seçeneğini ekler.',
      en: 'Adds a video download option to the tweet action menu.'
    }
  },
  'x-image-download': {
    label: { tr: 'Twitter Fotoğraf İndir', en: 'Twitter Image Download' },
    description: {
      tr: 'Tweet altındaki indirme menüsüne fotoğraf indir seçeneğini ekler.',
      en: 'Adds image download options to the tweet action menu.'
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
