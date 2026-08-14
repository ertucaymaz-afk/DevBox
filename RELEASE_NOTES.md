# DevBox 0.1.1 — işlevsel önizleme

Bu sürüm, sohbet ekranındaki günlük kullanım sorunlarını ve API gelişimi sağlayıcı rotasını birlikte ele alıyor.

## 📦 Arşivler

- `DevBox-source-v0.1.1.zip`: düşük boyutlu, Apache-2.0 açık kaynak arşivi. `node_modules`, derleme çıktıları, installer, yerel veritabanı, kanıt kayıtları, gizli bilgiler ve cache içermez.
- `devbox.zip`: Windows kurulum teslimi. NSIS installer, sağlama toplamı, sürüm manifesti ve üçüncü taraf bildirimlerini içerir; kaynak kod arşivi değildir.

## ✨ Görünür düzeltmeler

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

## ✅ Doğrulama

- TypeScript typecheck
- 17 dosyada 32 birim/sözleşme testi
- Vite/Electron üretim build’i
- Ürün-doğruluk denetimi
- Gerçek Electron Playwright E2E: secure preload, clipboard, boş sohbet, sabitleme, silme, ayar kapatma, PR/Eklenti ayrımı, API gelişimi ve terminal çıkışları

## 🔐 SignPath ve imza durumu

Geliştirici SignPath Foundation açık kaynak başvurusunu 14 Ağustos 2026 tarihinde gönderdi. İnceleme, kimlik doğrulama, proje onboarding’i ve sertifika tahsisi SignPath’in dış sürecidir ve henüz tamamlanmış sayılmaz. Bu nedenle installer yalnızca `release-manifest.json` açıkça `VALID` diyorsa imzalı kabul edilmelidir; mevcut v0.1.1 önizlemesi `NOT_SIGNED` olarak yayımlanır. DevBox self-signed sertifikayı genel yayın kimliği gibi sunmaz.

Ayrıntılar için [CHANGELOG.md](CHANGELOG.md), [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md), [SECURITY.md](SECURITY.md) ve [DEVELOPERS.md](DEVELOPERS.md) dosyalarına bakın.
