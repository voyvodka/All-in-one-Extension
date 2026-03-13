import type { Locale } from './storage.js';

// Define keys statically to avoid circular reference
type I18nKey =
  | 'subtabActive' | 'subtabHistory' | 'sort' | 'clearHistory' | 'popupSubtitle'
  | 'noRecords' | 'loadingTitle' | 'loadingBody'
  | 'emptyActiveTitle' | 'emptyActiveBody' | 'emptyHistoryTitle' | 'emptyHistoryBody'
  | 'popupLoadErrorTitle' | 'popupLoadErrorBody' | 'tryAgain'
  | 'statusPreparing' | 'statusDownloading' | 'statusCompleted' | 'statusFailed'
  | 'statusCancelled' | 'statusUserCancelled'
  | 'downloading' | 'downloadStarted' | 'error' | 'errorUnsupportedUrl' | 'downloadFallback'
  | 'typeLabel' | 'fileNameLabel' | 'sourceLabel' | 'statusLabel' | 'dateLabel' | 'errorLabel'
  | 'cancel' | 'retry' | 'toggleDetails'
  | 'language' | 'languageTr' | 'languageEn'
  | 'bugTitle' | 'theme' | 'themeSystem' | 'themeLight' | 'themeDark'
  | 'downloadAction' | 'downloadAudio' | 'downloadVideo'
  | 'downloadImageSingle' | 'downloadImageMultiple'
  | 'twitterUrlNotFound' | 'instagramDownloadIcon' | 'instagramPhotoUrlMissing'
  | 'footerVersion' | 'updateAvailable' | 'updateDownload' | 'updateHowTo'
  | 'updateChecking' | 'updateLatest' | 'updateError';

type I18nDictionary = Record<I18nKey, string>;

const messages: Record<Locale, I18nDictionary> = {
  tr: {
    subtabActive: 'Aktif',
    subtabHistory: 'Geçmiş',
    sort: 'Sırala',
    clearHistory: 'Geçmişi temizle',
    popupSubtitle: 'Desteklenen platformlardaki indirmeleri tek panelden yönet.',
    noRecords: 'Kayıt yok.',
    loadingTitle: 'Panel hazırlanıyor',
    loadingBody: 'İndirme durumu ve ayarlar yükleniyor.',
    emptyActiveTitle: 'Aktif indirme yok',
    emptyActiveBody: 'Yeni bir indirme başlattığında kuyruk burada görünür.',
    emptyHistoryTitle: 'Geçmiş hazır değil',
    emptyHistoryBody: 'Tamamlanan veya hata alan indirmeler burada listelenir.',
    popupLoadErrorTitle: 'Popup yüklenemedi',
    popupLoadErrorBody: 'Yerel durum okunurken bir sorun oluştu.',
    tryAgain: 'Tekrar dene',
    statusPreparing: 'Hazırlanıyor',
    statusDownloading: 'İndiriliyor',
    statusCompleted: 'Tamamlandı',
    statusFailed: 'Hata',
    statusCancelled: 'İptal edildi',
    statusUserCancelled: 'İndirme kabul edilmedi',
    downloading: 'İndiriliyor...',
    downloadStarted: 'İndirme başladı!',
    error: 'Hata!',
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
    instagramPhotoUrlMissing: 'Fotoğraf URL bulunamadı',
    footerVersion: 'All-in-One Toolkit v{version}',
    updateAvailable: 'Yeni sürüm: v{version}',
    updateDownload: 'İndir',
    updateHowTo: 'Nasıl güncellenir?',
    updateChecking: 'Güncelleme kontrol ediliyor...',
    updateLatest: 'Güncel sürümü kullanıyorsunuz.',
    updateError: 'Güncelleme kontrol edilemedi.'
  },
  en: {
    subtabActive: 'Active',
    subtabHistory: 'History',
    sort: 'Sort',
    clearHistory: 'Clear history',
    popupSubtitle: 'Track every supported download flow from one compact panel.',
    language: 'Language',
    languageTr: 'Türkçe',
    languageEn: 'English',
    noRecords: 'No records.',
    loadingTitle: 'Preparing panel',
    loadingBody: 'Loading download state and settings.',
    emptyActiveTitle: 'No active downloads',
    emptyActiveBody: 'When you start a new download, the queue will appear here.',
    emptyHistoryTitle: 'History is empty',
    emptyHistoryBody: 'Completed or failed downloads will appear here.',
    popupLoadErrorTitle: 'Popup failed to load',
    popupLoadErrorBody: 'There was a problem while reading local state.',
    tryAgain: 'Try again',
    statusPreparing: 'Preparing',
    statusDownloading: 'Downloading',
    statusCompleted: 'Completed',
    statusFailed: 'Error',
    statusCancelled: 'Cancelled',
    statusUserCancelled: 'Download rejected',
    downloading: 'Downloading...',
    downloadStarted: 'Download started!',
    error: 'Error!',
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
    instagramPhotoUrlMissing: 'Photo URL not found',
    footerVersion: 'All-in-One Toolkit v{version}',
    updateAvailable: 'New version: v{version}',
    updateDownload: 'Download',
    updateHowTo: 'How to update?',
    updateChecking: 'Checking for updates...',
    updateLatest: 'You are using the latest version.',
    updateError: 'Could not check for updates.'
  }
};

let currentLocale: Locale | undefined;

export function resolveLocale(preferred?: string | null): Locale {
  const normalized = preferred?.toLowerCase();
  if (normalized && normalized in messages) return normalized as Locale;
  const browserLang = chrome?.i18n?.getUILanguage?.() ?? navigator.language ?? 'en';
  return browserLang.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function setLocale(localeCode?: string | null): Locale {
  currentLocale = resolveLocale(localeCode);
  return currentLocale;
}

export function getLocale(preferred?: string | null): Locale {
  if (!currentLocale || preferred) {
    currentLocale = resolveLocale(preferred ?? currentLocale);
  }
  return currentLocale;
}

export function t(key: I18nKey): string {
  const locale = getLocale();
  return messages[locale]?.[key] ?? messages.en[key] ?? key;
}

interface FeatureMessage {
  label: Record<Locale, string>;
  description: Record<Locale, string>;
}

const featureMessages: Record<string, FeatureMessage> = {
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

export interface FeatureTranslation {
  label: string;
  description: string;
}

export function translateFeature(feature: { id: string; label?: string; description?: string }): FeatureTranslation {
  const locale = getLocale();
  const msg = featureMessages[feature.id];
  return {
    label: msg?.label?.[locale] ?? msg?.label?.en ?? feature.label ?? feature.id,
    description: msg?.description?.[locale] ?? msg?.description?.en ?? feature.description ?? ''
  };
}
