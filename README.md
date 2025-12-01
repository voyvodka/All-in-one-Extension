## All-in-One Extension (yerel taslak)

Manifest v3 uyumlu, hafif ve derleme gerektirmeyen bir Chrome eklentisi taslağı. Injected UI, popup ve context menu içeriyor; özellikler per-site yönetilebilir ve varsayılanlar local storage üzerinde tutuluyor.

### Yapı

- `extension/manifest.json` — izinler, popup, content script, service worker tanımı.
- `extension/background.js` — context menu kurulumları ve ayar mesajları.
- `extension/content.js` — sayfaya UI inject eder, özellikleri çalıştırır.
- `extension/ui/panel.{js,css}` — sayfa içi kontrol paneli.
- `extension/popup/*` — toolbar popup arayüzü.
- `extension/features/index.js` — özellik listesi ve eşleşme mantığı.
- `extension/shared/storage.js` — chrome.storage.local için basit yardımcılar.

### Özellik modeli

`features/index.js` içinde her özellik `{ id, label, description, matches(url), apply(ctx) }` şeklinde tanımlanır. `matches` ile hangi sitelerde aktif olacağı belirtilir, `apply` bir cleanup fonksiyonu döndürerek feature kapatıldığında çağrılır.

Hazır örnekler:

- Quiet reader: gürültülü layout parçalarını yumuşatır.
- Save selection: kopyalanan metni local storage’a saklar.
- YouTube MP3 share: paylaş paneline “MP3 indir” butonu ekler (varsayılan yönlendirme `ddownr.com`).

### Kurulum

1. Chrome’da `chrome://extensions` sayfasını açın.
2. Sağ üstten **Developer mode**’u açın.
3. **Load unpacked** > `extension` klasörünü seçin.
4. Content UI’yi sayfada sağ alttaki panelden, global ayarları popup’dan yönetin.

### Sonraki adımlar

- Chrome sync’e geçmek için `chrome.storage.sync` kullanımını `shared/storage.js` içinde parametreye bağlayabilirsiniz.
- Yeni sitelere özel özellikleri `features/index.js` altında ekleyip `matches` fonksiyonunda domaine göre filtreleyin.
