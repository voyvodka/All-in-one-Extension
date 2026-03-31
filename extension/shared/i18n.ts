import type { Locale } from './storage.js';

// Define keys statically to avoid circular reference
export type I18nKey =
  | 'subtabActive'
  | 'subtabHistory'
  | 'sort'
  | 'clearHistory'
  | 'popupSubtitle'
  | 'noRecords'
  | 'loadingTitle'
  | 'loadingBody'
  | 'emptyActiveTitle'
  | 'emptyActiveBody'
  | 'emptyHistoryTitle'
  | 'emptyHistoryBody'
  | 'popupLoadErrorTitle'
  | 'popupLoadErrorBody'
  | 'tryAgain'
  | 'statusPreparing'
  | 'statusDownloading'
  | 'statusCompleted'
  | 'statusFailed'
  | 'statusCancelled'
  | 'statusUserCancelled'
  | 'downloading'
  | 'downloadStarted'
  | 'error'
  | 'errorUnsupportedUrl'
  | 'downloadFallback'
  | 'typeLabel'
  | 'fileNameLabel'
  | 'sourceLabel'
  | 'statusLabel'
  | 'dateLabel'
  | 'errorLabel'
  | 'cancel'
  | 'retry'
  | 'toggleDetails'
  | 'language'
  | 'languageTr'
  | 'languageEn'
  | 'bugTitle'
  | 'theme'
  | 'themeSystem'
  | 'themeLight'
  | 'themeDark'
  | 'downloadAction'
  | 'downloadAudio'
  | 'downloadVideo'
  | 'downloadImageSingle'
  | 'downloadImageMultiple'
  | 'twitterUrlNotFound'
  | 'instagramDownloadIcon'
  | 'instagramPhotoUrlMissing'
  | 'footerVersion'
  | 'updateAvailable'
  | 'updateDownload'
  | 'updateHowTo'
  | 'updateReload'
  | 'updateCheckNow'
  | 'updateChecking'
  | 'updateLatest'
  | 'updateError'
  | 'updateDownloadTitle'
  | 'updateHowToTitle'
  | 'updateReloadTitle'
  | 'updateCheckNowTitle'
  | 'analyzerTitle'
  | 'analyzerAccountLabel'
  | 'analyzerUnknownAccount'
  | 'analyzerNoAccountBody'
  | 'analyzerNoScanBody'
  | 'analyzerRunningBody'
  | 'analyzerCompletedBody'
  | 'analyzerErrorBody'
  | 'analyzerLastScan'
  | 'analyzerLastScanNever'
  | 'analyzerOpenInstagram'
  | 'analyzerOpenInstagramTitle'
  | 'analyzerStatusIdle'
  | 'analyzerStatusRunning'
  | 'analyzerStatusError'
  | 'analyzerFreshnessFresh'
  | 'analyzerFreshnessAging'
  | 'analyzerFreshnessStale'
  | 'analyzerNonFollowerCountLabel'
  | 'analyzerFollowingCountLabel'
  | 'analyzerWhitelistedCountLabel'
  | 'analyzerDrawerOpen'
  | 'analyzerDrawerClose'
  | 'analyzerDrawerHint'
  | 'analyzerDrawerSignedOut'
  | 'analyzerDrawerViewerUnknown'
  | 'analyzerScanStart'
  | 'analyzerScanRescan'
  | 'analyzerScanRunning'
  | 'analyzerScanStartTitle'
  | 'analyzerScanRunningTitle'
  | 'analyzerRunningProgress'
  | 'analyzerTabNonWhitelisted'
  | 'analyzerTabWhitelisted'
  | 'analyzerSearchPlaceholder'
  | 'analyzerCopyVisible'
  | 'analyzerCopyVisibleTitle'
  | 'analyzerExportJson'
  | 'analyzerExportJsonTitle'
  | 'analyzerPagesLabel'
  | 'analyzerProcessedLabel'
  | 'analyzerCursorLabel'
  | 'analyzerLastErrorLabel'
  | 'analyzerCursorDone'
  | 'analyzerResultsEmpty'
  | 'analyzerWhitelistAdd'
  | 'analyzerWhitelistRemove'
  | 'analyzerUnfollow'
  | 'analyzerUnfollowTitle'
  | 'analyzerUnfollowConfirm'
  | 'analyzerPrivateBadge'
  | 'analyzerVerifiedBadge'
  | 'analyzerWhitelistShort'
  | 'analyzerHistoryPillNonFollowers'
  | 'analyzerHistoryPillFollowed'
  | 'analyzerHistoryPillUnfollowed'
  | 'analyzerHistoryPillFollowersGained'
  | 'analyzerHistoryPillFollowersLost'
  | 'analyzerHoverSource'
  | 'analyzerHoverProfileData'
  | 'analyzerHoverVisibility'
  | 'analyzerHoverListStatus'
  | 'analyzerHoverDataRich'
  | 'analyzerHoverDataLimited'
  | 'analyzerHoverPublic'
  | 'analyzerHoverWhitelisted'
  | 'analyzerHoverNotWhitelisted'
  | 'analyzerHoverPending'
  | 'analyzerHoverFollowing'
  | 'analyzerHoverFollower'
  | 'analyzerHoverNonFollower'
  | 'analyzerHoverYes'
  | 'analyzerHoverNo'
  | 'analyzerViewResults'
  | 'analyzerViewHistory'
  | 'analyzerBack'
  | 'analyzerDetail'
  | 'analyzerWhitelistImport'
  | 'analyzerWhitelistExport'
  | 'analyzerWhitelistClear'
  | 'analyzerFollowersUnavailable'
  | 'analyzerFollowerCountLabel'
  | 'analyzerDiffFollowed'
  | 'analyzerDiffUnfollowed'
  | 'analyzerDiffFollowersGained'
  | 'analyzerDiffFollowersLost'
  | 'analyzerOpenProfile'
  | 'analyzerOpenProfileTitle'
  | 'analyzerHistoryEmpty'
  | 'analyzerWhitelistClearConfirm'
  | 'analyzerHistoryTooltipNonFollowers'
  | 'analyzerHistoryTooltipFollowed'
  | 'analyzerHistoryTooltipUnfollowed'
  | 'analyzerHistoryTooltipFollowersGained'
  | 'analyzerHistoryTooltipFollowersLost'
  | 'dashboardSectionOverview'
  | 'dashboardSectionTrends'
  | 'dashboardSectionChanges'
  | 'dashboardSectionCompare'
  | 'dashboardSectionList'
  | 'dashboardSectionHistory'
  | 'dashboardChartFollowingFollowers'
  | 'dashboardChartNonFollowers'
  | 'dashboardChartNeedMore'
  | 'dashboardChangesChartLabel'
  | 'dashboardCompareNeedMore'
  | 'dashboardCompareWas'
  | 'dashboardCompareShow'
  | 'dashboardCompareHide'
  | 'dashboardCompareFromHistory'
  | 'dashboardListNonFollowers'
  | 'dashboardListFollowing'
  | 'dashboardListFollowers'
  | 'dashboardListTotal'
  | 'dashboardListNoResults'
  | 'dashboardExportCsv'
  | 'dashboardMore'
  | 'dashboardOpenDashboard'
  | 'dashboardOpenDashboardTitle';

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
    analyzerNoAccountBody:
      'Instagram içinde oturum açık bir hesap algılandığında özet burada görünür.',
    analyzerNoScanBody:
      'Bu hesap için henüz tarama kaydı yok. Taramayı Instagram içinden başlatabilirsin.',
    analyzerRunningBody:
      'Tarama sürerken özet burada güncel kalır. Sayfa yenilense bile son kayıt korunur.',
    analyzerCompletedBody:
      'Son tarama bu hesap için kaydedildi. Detayları panel içinden inceleyebilirsin.',
    analyzerErrorBody: 'Son tarama tamamlanamadı. Instagram içinde yeniden başlatabilirsin.',
    analyzerLastScan: 'Son tarama: {time}',
    analyzerLastScanNever: 'Son tarama yok',
    analyzerOpenInstagram: "Analyzer'ı aç",
    analyzerOpenInstagramTitle:
      'Instagram sekmesini aç veya odakla, sonra analyzer panelini göster.',
    analyzerStatusIdle: 'Hazır',
    analyzerStatusRunning: 'Taranıyor',
    analyzerStatusError: 'Sorun var',
    analyzerFreshnessFresh: 'Güncel',
    analyzerFreshnessAging: 'Yakında yenile',
    analyzerFreshnessStale: 'Eski veri',
    analyzerNonFollowerCountLabel: 'Takip etmeyen',
    analyzerFollowingCountLabel: 'Takip edilenler',
    analyzerWhitelistedCountLabel: 'Beyaz liste',
    analyzerDrawerOpen: 'Analyzer',
    analyzerDrawerClose: 'Kapat',
    analyzerDrawerHint: 'Tarama ve sonuç akışını bu panelden yönetebilirsin.',
    analyzerDrawerSignedOut: 'Instagram oturumu bulunamadı. Tarama için önce giriş yap.',
    analyzerDrawerViewerUnknown: 'Aktif hesap algılandı ama kullanıcı adı henüz netleşmedi.',
    analyzerScanStart: 'Tarama başlat',
    analyzerScanRescan: 'Yeniden tara',
    analyzerScanRunning: 'Taranıyor...',
    analyzerScanStartTitle: 'Bu hesap için takip ettiğin ama seni takip etmeyen hesapları tara.',
    analyzerScanRunningTitle: 'Tarama devam ediyor. İlerleme bu panelde güncellenecek.',
    analyzerRunningProgress:
      'Tarama sürüyor. {count} hesap tarandı, {matches} takip etmeyen bulundu.',
    analyzerTabNonWhitelisted: 'Liste',
    analyzerTabWhitelisted: 'Beyaz liste',
    analyzerSearchPlaceholder: 'Kullanıcı ara',
    analyzerCopyVisible: 'Listeyi kopyala',
    analyzerCopyVisibleTitle: 'Görünen kullanıcı adlarını panoya kopyala.',
    analyzerExportJson: 'JSON dışa aktar',
    analyzerExportJsonTitle: 'Görünen sonuçları JSON olarak indir.',
    analyzerPagesLabel: 'Sayfa',
    analyzerProcessedLabel: 'Taranan',
    analyzerCursorLabel: 'İmleç',
    analyzerLastErrorLabel: 'Son hata',
    analyzerCursorDone: 'Tamamlandı',
    analyzerResultsEmpty: 'Bu filtrede gösterilecek sonuç yok.',
    analyzerWhitelistAdd: 'Beyaz listeye ekle',
    analyzerWhitelistRemove: 'Beyaz listeden çıkar',
    analyzerUnfollow: 'Takibi bırak',
    analyzerUnfollowTitle: 'Bu hesabı takipten çıkar ve listeden kaldır.',
    analyzerUnfollowConfirm: '@{username} hesabını takipten çıkarmak istediğine emin misin?',
    analyzerPrivateBadge: 'Gizli',
    analyzerVerifiedBadge: 'Onaylı',
    analyzerWhitelistShort: 'WL',
    analyzerHistoryPillNonFollowers: 'TE',
    analyzerHistoryPillFollowed: '+T',
    analyzerHistoryPillUnfollowed: '-T',
    analyzerHistoryPillFollowersGained: '+TK',
    analyzerHistoryPillFollowersLost: '-TK',
    analyzerHoverSource: 'Liste',
    analyzerHoverProfileData: 'Profil verisi',
    analyzerHoverVisibility: 'Görünürlük',
    analyzerHoverListStatus: 'Liste durumu',
    analyzerHoverDataRich: 'Zengin',
    analyzerHoverDataLimited: 'Sınırlı',
    analyzerHoverPublic: 'Açık',
    analyzerHoverWhitelisted: 'Beyaz listede',
    analyzerHoverNotWhitelisted: 'Normal',
    analyzerHoverPending: 'İşlemde',
    analyzerHoverFollowing: 'Takip',
    analyzerHoverFollower: 'Takipçi',
    analyzerHoverNonFollower: 'Geri takip',
    analyzerHoverYes: 'Var',
    analyzerHoverNo: 'Yok',
    analyzerViewResults: 'Sonuçlar',
    analyzerViewHistory: 'Geçmiş',
    analyzerBack: 'Geri',
    analyzerDetail: 'Detay',
    analyzerWhitelistImport: 'Beyaz liste içe al',
    analyzerWhitelistExport: 'Beyaz liste dışa aktar',
    analyzerWhitelistClear: 'Beyaz listeyi temizle',
    analyzerFollowersUnavailable: 'Bu taramada takipçi anlık görüntüsü alınamadı.',
    analyzerFollowerCountLabel: 'Takipçiler',
    analyzerDiffFollowed: '+ Takip',
    analyzerDiffUnfollowed: '- Takip',
    analyzerDiffFollowersGained: '+ Takipçi',
    analyzerDiffFollowersLost: '- Takipçi',
    analyzerOpenProfile: 'Profil',
    analyzerOpenProfileTitle: 'Instagram profilini yeni sekmede aç.',
    analyzerHistoryEmpty: 'Bu hesap için henüz tarama geçmişi yok.',
    analyzerWhitelistClearConfirm: 'Beyaz listedeki tüm kayıtları silmek istediğine emin misin?',
    analyzerHistoryTooltipNonFollowers: 'Bu taramadaki takip etmeyen hesap sayısı.',
    analyzerHistoryTooltipFollowed: 'Önceki taramadan sonra yeni takip edilen hesaplar.',
    analyzerHistoryTooltipUnfollowed: 'Önceki taramadan sonra takibi bırakılan hesaplar.',
    analyzerHistoryTooltipFollowersGained: 'Önceki taramadan sonra kazanılan yeni takipçiler.',
    analyzerHistoryTooltipFollowersLost: 'Önceki taramadan sonra kaybedilen takipçiler.',
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
    dashboardOpenDashboardTitle: "Instagram Analyzer dashboard'ını aç.",
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
    analyzerNoAccountBody:
      'A compact summary will appear here after an Instagram account is detected.',
    analyzerNoScanBody:
      'No scan is stored for this account yet. You can start the flow from inside Instagram.',
    analyzerRunningBody:
      'The scan summary stays live here. The latest checkpoint can survive a page reload.',
    analyzerCompletedBody:
      'The latest scan is stored for this account. You can review the details from the drawer.',
    analyzerErrorBody:
      'The latest scan did not finish successfully. You can restart it inside Instagram.',
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
    analyzerFollowingCountLabel: 'Following',
    analyzerWhitelistedCountLabel: 'Whitelist',
    analyzerDrawerOpen: 'Analyzer',
    analyzerDrawerClose: 'Close',
    analyzerDrawerHint: 'You can manage the scan and result flow from this panel.',
    analyzerDrawerSignedOut: 'No Instagram session was detected. Sign in first to scan.',
    analyzerDrawerViewerUnknown:
      'An active account was detected but the user label is not resolved yet.',
    analyzerScanStart: 'Start scan',
    analyzerScanRescan: 'Scan again',
    analyzerScanRunning: 'Scanning...',
    analyzerScanStartTitle: 'Scan this account for people you follow who do not follow you back.',
    analyzerScanRunningTitle: 'The scan is in progress. Progress will keep updating in this panel.',
    analyzerRunningProgress:
      'Scan in progress. {count} accounts processed, {matches} non-followers found.',
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
    analyzerUnfollow: 'Unfollow',
    analyzerUnfollowTitle: 'Unfollow this account and remove it from the list.',
    analyzerUnfollowConfirm: 'Are you sure you want to unfollow @{username}?',
    analyzerPrivateBadge: 'Private',
    analyzerVerifiedBadge: 'Verified',
    analyzerWhitelistShort: 'WL',
    analyzerHistoryPillNonFollowers: 'NF',
    analyzerHistoryPillFollowed: '+F',
    analyzerHistoryPillUnfollowed: '-F',
    analyzerHistoryPillFollowersGained: '+FG',
    analyzerHistoryPillFollowersLost: '-FG',
    analyzerHoverSource: 'List',
    analyzerHoverProfileData: 'Profile data',
    analyzerHoverVisibility: 'Visibility',
    analyzerHoverListStatus: 'List status',
    analyzerHoverDataRich: 'Rich',
    analyzerHoverDataLimited: 'Limited',
    analyzerHoverPublic: 'Public',
    analyzerHoverWhitelisted: 'Whitelisted',
    analyzerHoverNotWhitelisted: 'Normal',
    analyzerHoverPending: 'Pending',
    analyzerHoverFollowing: 'Following',
    analyzerHoverFollower: 'Follower',
    analyzerHoverNonFollower: 'Follows back',
    analyzerHoverYes: 'Yes',
    analyzerHoverNo: 'No',
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
    dashboardOpenDashboardTitle: 'Open the Instagram Analyzer Dashboard.',
  },
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
