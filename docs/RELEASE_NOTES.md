# DevBox 0.1.2 — işlevsel önizleme

Bu sürüm; gerçek LSP/DAP kontrol yüzeyini, eşleştirilmiş uzak worker yaşam döngüsünü ve temiz Windows VM dayanıklılık kapısını ekler. Sohbet ve API gelişimi iyileştirmeleri korunur.

## 📦 Arşivler

- `DevBox-source-v0.1.2.zip`: düşük boyutlu, Apache-2.0 açık kaynak arşivi. `node_modules`, derleme çıktıları, installer, yerel veritabanı, kanıt kayıtları, gizli bilgiler ve cache içermez.
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

## 🧭 API gelişimi

DevBox ilk olarak sağlık ve oturum denetimi geçen resmî Codex CLI yolunu salt-okunur/ephemeral çalıştırır. Gerçek Codex çağrısı başarısız olursa ve NVIDIA NIM yapılandırılmışsa Hermes rotasına geçer. İki yol da çalışmazsa görev başarısız kaydedilir; içerik uydurulmaz.

Bu alan model eğitimi veya kendi kendine kod yazma iddiası taşımaz. Araştırma ve backlog görevleri; sağlayıcı, zaman, durable-job ve hata kanıtlarıyla SQLite WAL içinde kalıcıdır. Uygulama yeniden açıldığında önceki çevrimler korunur. Kaynak kod değişikliği kullanıcı onayı olmadan yapılmaz.

## 🧩 LSP, DAP ve uzak çalışan

TypeScript/JavaScript dosyaları, kurulu gerçek dil sunucusu sürecine LSP üzerinden gönderilir; tanılama satır ve sütunları editör seçimine bağlanır. Hata ayıklayıcı, kullanıcı tarafından seçilmiş kurulu bir hata ayıklama adaptörü olmadan oturum açmaz. DAP paneli iş parçacığı, çağrı yığını, kapsam, değişken, kesme noktası ve yürütme kontrollerini gerçek protokol yanıtlarıyla gösterir.

Uzak çalışan yalnız uygulama içinden onayla üretilen tek kullanımlık kodla eşleşir. Kalıcı erişim anahtarı bir kez verilir, veritabanında yalnız özeti saklanır. Uzak çalışan komutları izin listesi ve çalışma kökü sınırına tabidir; ağ kesilirse üst sınırlı geri çekilmeyle yeniden bağlanır, süresi dolan görev kiralaması yeniden kuyruğa alınır. Bu sürüm çok makineli protokolü sağlar; gerçek iki sunuculu ağ bölünmesi kanıtı henüz ayrı yayın kapısıdır.

## ✅ Doğrulama

- TypeScript typecheck
- LSP süreci, uzak-worker API/lease ve SQLite v5 dâhil birim/sözleşme testleri
- Vite/Electron üretim build’i
- Ürün-doğruluk denetimi
- Gerçek Electron Playwright E2E: secure preload, clipboard, boş sohbet, sabitleme, silme, ayar kapatma, PR/Eklenti ayrımı, API gelişimi ve terminal çıkışları

## 🔐 SignPath ve imza durumu

Geliştirici SignPath Foundation açık kaynak başvurusunu 14 Ağustos 2026 tarihinde gönderdi. İnceleme, kimlik doğrulama, proje onboarding’i ve sertifika tahsisi SignPath’in dış sürecidir ve henüz tamamlanmış sayılmaz. Bu nedenle installer yalnızca `release-manifest.json` açıkça `VALID` diyorsa imzalı kabul edilmelidir; mevcut v0.1.2 önizlemesi `NOT_SIGNED` olarak yayımlanır. DevBox self-signed sertifikayı genel yayın kimliği gibi sunmaz.

Ayrıntılar için [CHANGELOG.md](../CHANGELOG.md), [kod imzalama politikası](policies/CODE_SIGNING_POLICY.md), [SECURITY.md](../.github/SECURITY.md) ve [DEVELOPERS.md](DEVELOPERS.md) dosyalarına bakın.
