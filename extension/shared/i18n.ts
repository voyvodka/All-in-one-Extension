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
  | 'footerVersion' | 'updateAvailable' | 'updateDownload' | 'updateHowTo' | 'updateReload' | 'updateCheckNow'
  | 'updateChecking' | 'updateLatest' | 'updateError'
  | 'updateDownloadTitle' | 'updateHowToTitle' | 'updateReloadTitle' | 'updateCheckNowTitle'
  | 'analyzerTitle' | 'analyzerAccountLabel' | 'analyzerUnknownAccount' | 'analyzerNoAccountBody'
  | 'analyzerNoScanBody' | 'analyzerRunningBody' | 'analyzerCompletedBody' | 'analyzerErrorBody' | 'analyzerLastScan'
  | 'analyzerLastScanNever' | 'analyzerOpenInstagram' | 'analyzerOpenInstagramTitle'
  | 'analyzerStatusIdle' | 'analyzerStatusRunning' | 'analyzerStatusError'
  | 'analyzerFreshnessFresh' | 'analyzerFreshnessAging' | 'analyzerFreshnessStale'
  | 'analyzerNonFollowerCountLabel' | 'analyzerFollowingCountLabel' | 'analyzerWhitelistedCountLabel'
  | 'analyzerDrawerOpen' | 'analyzerDrawerClose' | 'analyzerDrawerHint'
  | 'analyzerDrawerSignedOut' | 'analyzerDrawerViewerUnknown'
  | 'analyzerDrawerActionSoon' | 'analyzerDrawerActionSoonTitle'
  | 'analyzerScanStart' | 'analyzerScanRescan' | 'analyzerScanRunning'
  | 'analyzerScanStartTitle' | 'analyzerScanRunningTitle' | 'analyzerRunningProgress'
  | 'analyzerTabNonWhitelisted' | 'analyzerTabWhitelisted' | 'analyzerSearchPlaceholder'
  | 'analyzerCopyVisible' | 'analyzerCopyVisibleTitle' | 'analyzerExportJson' | 'analyzerExportJsonTitle'
  | 'analyzerPagesLabel' | 'analyzerProcessedLabel' | 'analyzerCursorLabel' | 'analyzerLastErrorLabel'
  | 'analyzerCursorDone' | 'analyzerResultsEmpty' | 'analyzerWhitelistAdd' | 'analyzerWhitelistRemove'
  | 'analyzerPrivateBadge' | 'analyzerVerifiedBadge'
  | 'analyzerViewResults' | 'analyzerViewHistory' | 'analyzerBack' | 'analyzerDetail'
  | 'analyzerWhitelistImport' | 'analyzerWhitelistExport' | 'analyzerWhitelistClear'
  | 'analyzerFollowersUnavailable' | 'analyzerFollowerCountLabel'
  | 'analyzerDiffFollowed' | 'analyzerDiffUnfollowed' | 'analyzerDiffFollowersGained' | 'analyzerDiffFollowersLost'
  | 'analyzerOpenProfile' | 'analyzerOpenProfileTitle' | 'analyzerHistoryEmpty'
  | 'analyzerWhitelistClearConfirm' | 'analyzerHistoryTooltipNonFollowers'
  | 'analyzerHistoryTooltipFollowed' | 'analyzerHistoryTooltipUnfollowed'
  | 'analyzerHistoryTooltipFollowersGained' | 'analyzerHistoryTooltipFollowersLost'
  | 'dashboardSectionOverview' | 'dashboardSectionTrends' | 'dashboardSectionChanges'
  | 'dashboardSectionCompare' | 'dashboardSectionList' | 'dashboardSectionHistory'
  | 'dashboardChartFollowingFollowers' | 'dashboardChartNonFollowers' | 'dashboardChartNeedMore'
  | 'dashboardChangesChartLabel'
  | 'dashboardCompareNeedMore' | 'dashboardCompareWas' | 'dashboardCompareShow' | 'dashboardCompareHide'
  | 'dashboardCompareFromHistory'
  | 'dashboardListNonFollowers' | 'dashboardListFollowing' | 'dashboardListFollowers'
  | 'dashboardListTotal' | 'dashboardListNoResults'
  | 'dashboardExportCsv' | 'dashboardMore'
  | 'dashboardOpenDashboard' | 'dashboardOpenDashboardTitle';

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
    updateReload: 'Yeniden yükle',
    updateCheckNow: 'Kontrol et',
    updateChecking: 'Güncelleme kontrol ediliyor...',
    updateLatest: 'Güncel sürümü kullanıyorsunuz.',
    updateError: 'Güncelleme kontrol edilemedi.',
    updateDownloadTitle: 'Son sürüm zip paketini indir.',
    updateHowToTitle: 'Manuel güncelleme adımlarını aç.',
    updateReloadTitle: 'Dosyaları çıkardıktan sonra uzantıyı yeniden yükle.',
    updateCheckNowTitle: 'GitHub üzerinden güncellemeyi şimdi tekrar kontrol et.',
    analyzerTitle: 'Instagram Analyzer',
    analyzerAccountLabel: 'Hesap',
    analyzerUnknownAccount: 'Bilinmeyen hesap',
    analyzerNoAccountBody: 'Instagram içinde oturum açık bir hesap algılandığında özet burada görünür.',
    analyzerNoScanBody: 'Bu hesap için henüz tarama kaydı yok. Tarama akisini Instagram icinden baslatabilirsin.',
    analyzerRunningBody: 'Tarama surerken ozet burada guncel kalir. Sayfa yenilense bile son kayit korunur.',
    analyzerCompletedBody: 'Son tarama bu hesap icin kaydedildi. Detaylari drawer icinden inceleyebilirsin.',
    analyzerErrorBody: 'Son tarama tamamlanamadı. Instagram içinde yeniden başlatabilirsin.',
    analyzerLastScan: 'Son tarama: {time}',
    analyzerLastScanNever: 'Son tarama yok',
    analyzerOpenInstagram: 'Analyzer\'i ac',
    analyzerOpenInstagramTitle: 'Instagram sekmesini ac veya odakla, sonra analyzer panelini goster.',
    analyzerStatusIdle: 'Hazır',
    analyzerStatusRunning: 'Taranıyor',
    analyzerStatusError: 'Sorun var',
    analyzerFreshnessFresh: 'Güncel',
    analyzerFreshnessAging: 'Yakında yenile',
    analyzerFreshnessStale: 'Eski veri',
    analyzerNonFollowerCountLabel: 'Takip etmeyen',
    analyzerFollowingCountLabel: 'Taranan',
    analyzerWhitelistedCountLabel: 'Whitelist',
    analyzerDrawerOpen: 'Analyzer',
    analyzerDrawerClose: 'Kapat',
    analyzerDrawerHint: 'Tarama ve sonuc akisini bu panelden yonetebilirsin.',
    analyzerDrawerSignedOut: 'Instagram oturumu bulunamadi. Tarama icin once hesaba giris yap.',
    analyzerDrawerViewerUnknown: 'Aktif hesap algilandi ama kullanici etiketi henuz netlesmedi.',
    analyzerDrawerActionSoon: 'Manual scan yakinda',
    analyzerDrawerActionSoonTitle: 'Gercek tarama akisi bir sonraki adimda bu butona baglanacak.',
    analyzerScanStart: 'Scan baslat',
    analyzerScanRescan: 'Yeniden tara',
    analyzerScanRunning: 'Taraniyor...',
    analyzerScanStartTitle: 'Bu hesap icin takip ettigin ama seni takip etmeyen hesaplari tara.',
    analyzerScanRunningTitle: 'Tarama devam ediyor. Ilerleme bu panelde guncellenecek.',
    analyzerRunningProgress: 'Tarama suruyor. {count} hesap tarandi, {matches} takip etmeyen bulundu.',
    analyzerTabNonWhitelisted: 'Liste',
    analyzerTabWhitelisted: 'Whitelist',
    analyzerSearchPlaceholder: 'Kullanici ara',
    analyzerCopyVisible: 'Listeyi kopyala',
    analyzerCopyVisibleTitle: 'Gorunen kullanici adlarini panoya kopyala.',
    analyzerExportJson: 'JSON disa aktar',
    analyzerExportJsonTitle: 'Gorunen sonuclari JSON olarak indir.',
    analyzerPagesLabel: 'Sayfa',
    analyzerProcessedLabel: 'Taranan',
    analyzerCursorLabel: 'Cursor',
    analyzerLastErrorLabel: 'Son hata',
    analyzerCursorDone: 'Tamamlandi',
    analyzerResultsEmpty: 'Bu filtrede gosterilecek sonuc yok.',
    analyzerWhitelistAdd: 'Whitelist\'e ekle',
    analyzerWhitelistRemove: 'Whitelist\'ten cikar',
    analyzerPrivateBadge: 'Gizli',
    analyzerVerifiedBadge: 'Onayli',
    analyzerViewResults: 'Sonuclar',
    analyzerViewHistory: 'Gecmis',
    analyzerBack: 'Geri',
    analyzerDetail: 'Detay',
    analyzerWhitelistImport: 'Whitelist ice al',
    analyzerWhitelistExport: 'Whitelist disa aktar',
    analyzerWhitelistClear: 'Whitelist temizle',
    analyzerFollowersUnavailable: 'Bu taramada followers snapshot alinamadi.',
    analyzerFollowerCountLabel: 'Followers',
    analyzerDiffFollowed: '+ Takip',
    analyzerDiffUnfollowed: '- Takip',
    analyzerDiffFollowersGained: '+ Followers',
    analyzerDiffFollowersLost: '- Followers',
    analyzerOpenProfile: 'Profil',
    analyzerOpenProfileTitle: 'Instagram profilini yeni sekmede ac.',
    analyzerHistoryEmpty: 'Bu hesap icin henuz tarama gecmisi yok.',
    analyzerWhitelistClearConfirm: 'Whitelist icindeki tum kayitlari silmek istedigine emin misin?',
    analyzerHistoryTooltipNonFollowers: 'Bu taramadaki takip etmeyen hesap sayisi.',
    analyzerHistoryTooltipFollowed: 'Onceki taramadan sonra yeni takip edilen hesaplar.',
    analyzerHistoryTooltipUnfollowed: 'Onceki taramadan sonra takibi birakilan hesaplar.',
    analyzerHistoryTooltipFollowersGained: 'Onceki taramadan sonra yeni gelen followers.',
    analyzerHistoryTooltipFollowersLost: 'Onceki taramadan sonra kaybedilen followers.',
    dashboardSectionOverview: 'Özet',
    dashboardSectionTrends: 'Trendler',
    dashboardSectionChanges: 'Değişimler',
    dashboardSectionCompare: 'Karşılaştır',
    dashboardSectionList: 'Kullanıcı Listesi',
    dashboardSectionHistory: 'Tarama Geçmişi',
    dashboardChartFollowingFollowers: 'Takip / Takipçi Trendi',
    dashboardChartNonFollowers: 'Takip Etmeyenler Trendi',
    dashboardChartNeedMore: 'Trend için en az 2 tarama gerekiyor.',
    dashboardChangesChartLabel: 'Takip / Takipçi Değişimleri',
    dashboardCompareNeedMore: 'Karşılaştırma için en az 2 tarama gerekiyor.',
    dashboardCompareWas: 'önceki:',
    dashboardCompareShow: 'Değişen kullanıcıları göster ▾',
    dashboardCompareHide: 'Gizle ▴',
    dashboardCompareFromHistory: 'Bu taramayı karşılaştır',
    dashboardListNonFollowers: 'Takip etmeyenler',
    dashboardListFollowing: 'Takip edilenler',
    dashboardListFollowers: 'Takipçiler',
    dashboardListTotal: 'sonuç',
    dashboardListNoResults: 'Arama sonucu bulunamadı.',
    dashboardExportCsv: 'CSV indir',
    dashboardMore: 'daha fazla',
    dashboardOpenDashboard: 'Dashboard',
    dashboardOpenDashboardTitle: 'Instagram Analyzer Dashboard\'ı aç.'
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
    updateReload: 'Reload',
    updateCheckNow: 'Check now',
    updateChecking: 'Checking for updates...',
    updateLatest: 'You are using the latest version.',
    updateError: 'Could not check for updates.',
    updateDownloadTitle: 'Download the latest unpacked zip package.',
    updateHowToTitle: 'Open the manual update guide.',
    updateReloadTitle: 'Reload the extension after replacing the files.',
    updateCheckNowTitle: 'Check GitHub for updates again right now.',
    analyzerTitle: 'Instagram Analyzer',
    analyzerAccountLabel: 'Account',
    analyzerUnknownAccount: 'Unknown account',
    analyzerNoAccountBody: 'A compact summary will appear here after an Instagram account is detected.',
    analyzerNoScanBody: 'No scan is stored for this account yet. You can start the flow from inside Instagram.',
    analyzerRunningBody: 'The scan summary stays live here. The latest checkpoint can survive a page reload.',
    analyzerCompletedBody: 'The latest scan is stored for this account. You can review the details from the drawer.',
    analyzerErrorBody: 'The latest scan did not finish successfully. You can restart it inside Instagram.',
    analyzerLastScan: 'Last scan: {time}',
    analyzerLastScanNever: 'No scan yet',
    analyzerOpenInstagram: 'Open analyzer',
    analyzerOpenInstagramTitle: 'Open or focus an Instagram tab, then reveal the analyzer panel.',
    analyzerStatusIdle: 'Ready',
    analyzerStatusRunning: 'Scanning',
    analyzerStatusError: 'Issue',
    analyzerFreshnessFresh: 'Fresh',
    analyzerFreshnessAging: 'Refresh soon',
    analyzerFreshnessStale: 'Stale',
    analyzerNonFollowerCountLabel: 'Non-followers',
    analyzerFollowingCountLabel: 'Scanned',
    analyzerWhitelistedCountLabel: 'Whitelist',
    analyzerDrawerOpen: 'Analyzer',
    analyzerDrawerClose: 'Close',
    analyzerDrawerHint: 'You can manage the scan and result flow from this panel.',
    analyzerDrawerSignedOut: 'No Instagram session was detected. Sign in first to scan.',
    analyzerDrawerViewerUnknown: 'An active account was detected but the user label is not resolved yet.',
    analyzerDrawerActionSoon: 'Manual scan soon',
    analyzerDrawerActionSoonTitle: 'The real scan flow will be wired to this button in the next step.',
    analyzerScanStart: 'Start scan',
    analyzerScanRescan: 'Scan again',
    analyzerScanRunning: 'Scanning...',
    analyzerScanStartTitle: 'Scan this account for people you follow who do not follow you back.',
    analyzerScanRunningTitle: 'The scan is in progress. Progress will keep updating in this panel.',
    analyzerRunningProgress: 'Scan in progress. {count} accounts processed, {matches} non-followers found.',
    analyzerTabNonWhitelisted: 'List',
    analyzerTabWhitelisted: 'Whitelist',
    analyzerSearchPlaceholder: 'Search username',
    analyzerCopyVisible: 'Copy list',
    analyzerCopyVisibleTitle: 'Copy the visible usernames to the clipboard.',
    analyzerExportJson: 'Export JSON',
    analyzerExportJsonTitle: 'Download the visible results as JSON.',
    analyzerPagesLabel: 'Pages',
    analyzerProcessedLabel: 'Processed',
    analyzerCursorLabel: 'Cursor',
    analyzerLastErrorLabel: 'Last error',
    analyzerCursorDone: 'Done',
    analyzerResultsEmpty: 'No results match this filter.',
    analyzerWhitelistAdd: 'Add to whitelist',
    analyzerWhitelistRemove: 'Remove from whitelist',
    analyzerPrivateBadge: 'Private',
    analyzerVerifiedBadge: 'Verified',
    analyzerViewResults: 'Results',
    analyzerViewHistory: 'History',
    analyzerBack: 'Back',
    analyzerDetail: 'Details',
    analyzerWhitelistImport: 'Import whitelist',
    analyzerWhitelistExport: 'Export whitelist',
    analyzerWhitelistClear: 'Clear whitelist',
    analyzerFollowersUnavailable: 'Followers snapshot was not available for this scan.',
    analyzerFollowerCountLabel: 'Followers',
    analyzerDiffFollowed: '+ Following',
    analyzerDiffUnfollowed: '- Following',
    analyzerDiffFollowersGained: '+ Followers',
    analyzerDiffFollowersLost: '- Followers',
    analyzerOpenProfile: 'Profile',
    analyzerOpenProfileTitle: 'Open the Instagram profile in a new tab.',
    analyzerHistoryEmpty: 'There is no scan history for this account yet.',
    analyzerWhitelistClearConfirm: 'Are you sure you want to clear the entire whitelist?',
    analyzerHistoryTooltipNonFollowers: 'The non-follower count captured in this scan.',
    analyzerHistoryTooltipFollowed: 'Accounts you started following since the previous scan.',
    analyzerHistoryTooltipUnfollowed: 'Accounts you unfollowed since the previous scan.',
    analyzerHistoryTooltipFollowersGained: 'New followers gained since the previous scan.',
    analyzerHistoryTooltipFollowersLost: 'Followers lost since the previous scan.',
    dashboardSectionOverview: 'Overview',
    dashboardSectionTrends: 'Trends',
    dashboardSectionChanges: 'Changes',
    dashboardSectionCompare: 'Compare',
    dashboardSectionList: 'User List',
    dashboardSectionHistory: 'Scan History',
    dashboardChartFollowingFollowers: 'Following & Followers',
    dashboardChartNonFollowers: 'Non-followers Over Time',
    dashboardChartNeedMore: 'Need at least 2 scans to show trends.',
    dashboardChangesChartLabel: 'Follow / Follower Changes Per Scan',
    dashboardCompareNeedMore: 'Need at least 2 scans to compare.',
    dashboardCompareWas: 'was',
    dashboardCompareShow: 'Show changed users ▾',
    dashboardCompareHide: 'Hide ▴',
    dashboardCompareFromHistory: 'Compare this scan',
    dashboardListNonFollowers: 'Non-followers',
    dashboardListFollowing: 'Following',
    dashboardListFollowers: 'Followers',
    dashboardListTotal: 'results',
    dashboardListNoResults: 'No results match your search.',
    dashboardExportCsv: 'Download CSV',
    dashboardMore: 'more',
    dashboardOpenDashboard: 'Dashboard',
    dashboardOpenDashboardTitle: 'Open the Instagram Analyzer Dashboard.'
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
  'ig-unfollowers': {
    label: { tr: 'Instagram Analyzer', en: 'Instagram Analyzer' },
    description: {
      tr: 'Instagram içinde compact analyzer paneli ekler.',
      en: 'Adds a compact analyzer panel inside Instagram.'
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
