# DevBox 0.1.4 — doğrulanabilir entegrasyon önizlemesi

Bu sürüm, “hazır” yazısını kanıt saymak yerine gerçek süreç/protokol yanıtını esas alır. Codex öncelikli API gelişim kuyruğu, imzalı eklenti sözleşmesi, ayrı süreçte MCP araç çağrısı, resmî Microsoft JavaScript hata ayıklayıcısı ve dayanıklı uzak görev yaşam döngüsü aynı doğruluk modeli altında birleştirildi.

## 📦 Arşivler

- `DevBox-source-v0.1.4.zip`: düşük boyutlu, Apache-2.0 açık kaynak arşivi. `node_modules`, derleme çıktıları, installer, yerel veritabanı, kanıt kayıtları, gizli bilgiler, geçici katalog sahnesi ve cache içermez.
- `devbox.zip`: Windows kurulum teslimi. NSIS installer, sağlama toplamı, sürüm manifesti ve üçüncü taraf bildirimlerini içerir; kaynak kod arşivi değildir.

## ✨ Görünür düzeltmeler

- Sürümle birlikte gelen gerçek değişiklikleri gösteren, hareketi azalt tercihine saygılı animasyonlu **Yenilikler** çalışma alanı eklendi. Okundu bilgisi sürüm bazında cihazda saklanır; uydurma çevrimiçi içerik üretilmez.
- Yenilikler ekranından güncel GitHub sürümüne, tüm sürümlere, açık kaynak depoya ve geliştirici hesabına yalnız güvenilen HTTPS adresleri üzerinden ulaşılabilir.
- Topluluk davranış kuralları, katkı rehberi, güvenlik, gizlilik ve kod imzalama belgeleri doğal ve ayrıntılı Türkçeyle yeniden yazıldı. Hukuken bağlayıcı Apache 2.0 metni aynen korunurken ayrıca açık bir Türkçe bilgilendirme özeti eklendi.
- Yeni sohbet düğmesine tekrar tekrar basmak, ilk mesaj gönderilmeden kalıcı boş sohbet oluşturmaz.
- Sabitlenen sohbetler ayrı **Sabit konuşmalar** bölümüne taşınır ve görünür pin işareti alır.
- Sohbeti silme, uygulama içi koyu onay penceresiyle doğrulanır; sonuç üst-ortada dört saniye görünen temiz beyaz bildirimle gösterilir.
- Terminal ve Dosyalar çalışma alanlarında hem **Sohbete dön** hem de görünür kapatma düğmesi vardır.
- Pull Request’ler ile Eklentiler farklı gerçek çalışma alanlarına gider.
- Sol üst geri/ileri düğmeleri gerçek gezinme durumuna göre çalışır; kullanılamayan ileri düğmesi etkin görünmez.
- Mesaj kutusu ve diğer düzenlenebilir alanlarda sağ tık menüsü Kes, Kopyala ve **Yapıştır** işlemlerini içerir. Enter gönderir; Shift+Enter yeni satır açar.
- Mesaj eylemleri düzenleme, kopyalama, alıntılama/yanıtlama, yeniden oluşturma ve geri bildirim işlevlerini erişilebilir ikonlarla sunar.
- Boş sohbet ekranı, geliştirici imzası ve görünür zaman/konu hiyerarşisi daha kompakt hale getirildi.

## 🧭 Codex öncelikli API gelişimi

DevBox ilk olarak sağlık ve oturum denetimi geçen resmî Codex CLI yolunu `gpt-5.6-sol` ve yüksek düşünme düzeyiyle salt-okunur/ephemeral çalıştırır. Gerçek Codex çağrısı başarısız olursa ve NVIDIA NIM yapılandırılmışsa Hermes rotasına geçer. İki yol da çalışmazsa görev başarısız kaydedilir; içerik uydurulmaz. Sabit günlük dört/yirmi dört görev tavanı kaldırılmıştır; aynı araştırmanın sonsuz döngüde tekrarlanmasını önleyen değişken görev bağlamı ve kalıcı bulgu geçmişi kullanılır.

Bu alan model eğitimi veya kendi kendine kod yazma iddiası taşımaz. Araştırma ve backlog görevleri; sağlayıcı, zaman, durable-job ve hata kanıtlarıyla SQLite WAL içinde kalıcıdır. Uygulama yeniden açıldığında önceki çevrimler korunur. Kaynak kod değişikliği kullanıcı onayı olmadan yapılmaz.

Masaüstündeki kapsamlı `geliştirme.md` bu sürümde bütünüyle ayrıştırıldı: 51.468 satır, 22 faz ve 3.362 benzersiz görev sürüm kontrollü grafa alındı. Alım işlemi görev tamamlamak değildir; ilk durumların tamamı `TODO`dur. `pnpm spec:verify`, ileride `PASS` verilen her maddede çalışma kanıtı, test, inceleyen ve tamamlanma zamanı bulunmasını zorunlu kılar.

## 🧩 Eklentiler, Beceriler ve MCP

Eklenti paketleri yüklenmeden önce sıkı manifest şemasından, uyumluluk sınırından, izin bildiriminden ve içerik özetinden geçer. Yerel sideload paketi hiçbir zaman “yönetilen katalog imzalı” gibi gösterilmez. Yönetilen yol, kullanıcı tarafından kaydedilmiş yayıncı güven kökü, Ed25519 imza, güncel iptal listesi ve hash-zincirli audit bütünlüğü ister. MCP sunucusu DevBox ana sürecinin içine alınmaz; ayrı child process’te başlar ve ancak `initialize` ile `tools/list` başarıyla dönerse çalışıyor sayılır. Araç çağrıları gerçek JSON-RPC `tools/call` sonucunu gösterir.

## 🧩 LSP, DAP ve uzak çalışan

TypeScript/JavaScript dosyaları, kurulu gerçek dil sunucusu sürecine LSP üzerinden gönderilir; tanılama satır ve sütunları editör seçimine bağlanır. Yerleşik hata ayıklama yolu, sabitlenmiş resmi Microsoft `vscode-js-debug` varlığını ayrı süreçte çalıştırır. DAP paneli iş parçacığı, çağrı yığını, kapsam, değişken, kesme noktası ve yürütme kontrollerini gerçek protokol yanıtlarıyla gösterir. Kaynak yolu seçili proje kökünün dışına veya symlink ile dışarı taşarsa breakpoint isteği adaptöre gönderilmeden reddedilir.

Uzak çalışan yalnız uygulama içinden onayla üretilen tek kullanımlık kodla eşleşir. Kalıcı erişim anahtarı bir kez verilir, veritabanında yalnız özeti saklanır. Uzak çalışan komutları izin listesi ve çalışma kökü sınırına tabidir; ağ kesilirse üst sınırlı geri çekilmeyle yeniden bağlanır, süresi dolan görev kiralaması yeniden kuyruğa alınır. Bu sürüm çok makineli protokolü sağlar; gerçek iki sunuculu ağ bölünmesi kanıtı henüz ayrı yayın kapısıdır.

## ✅ Doğrulama

- TypeScript typecheck
- Gerçek LSP ve DAP süreçleri, uzak-worker API/lease/iptal akışı, eklenti imzası/iptali/audit/MCP ve SQLite kalıcılığı dâhil 27 dosyada 52 test
- Vite/Electron üretim build’i
- Ürün-doğruluk denetimi
- Gerçek Electron Playwright E2E: secure preload, clipboard, boş sohbet, sabitleme, silme, ayar kapatma, PR/Eklenti ayrımı, API gelişimi ve terminal çıkışları

## 🔐 SignPath ve imza durumu

Geliştirici SignPath Foundation açık kaynak başvurusunu 14 Ağustos 2026 tarihinde gönderdi. İnceleme, kimlik doğrulama, proje onboarding’i ve sertifika tahsisi SignPath’in dış sürecidir ve henüz tamamlanmış sayılmaz. Bu nedenle installer yalnızca `release-manifest.json` açıkça `VALID` diyorsa imzalı kabul edilmelidir; mevcut v0.1.4 önizlemesi `NOT_SIGNED` olarak yayımlanır. DevBox self-signed sertifikayı genel yayın kimliği gibi sunmaz.

## Açık doğrulama kapıları

- Fiziksel ikinci makineyle pairing, gerçek ağ bölünmesi ve görev devamlılığı kanıtı.
- Saatler süren temiz Windows VM CPU/RAM/I/O soak; disk dolması, sürücü arızası ve fiziksel güç kesintisi matrisi.
- Windows AppContainer seviyesinde üçüncü taraf süreç sandbox’ı ve üçüncü taraf WebContentsView host’u.
- Sunucu taraflı katalog portalı, yayıncı MFA/RBAC, tarama kuyruğu ve iptal listesinin dağıtım hizmeti.
- SignPath onayı sonrası gerçek Authenticode sertifikasıyla imzalama, zaman damgası ve imzalı otomatik güncelleme kanalı.

Ayrıntılar için [CHANGELOG.md](../CHANGELOG.md), [kod imzalama politikası](policies/CODE_SIGNING_POLICY.md), [SECURITY.md](../.github/SECURITY.md) ve [DEVELOPERS.md](DEVELOPERS.md) dosyalarına bakın.
