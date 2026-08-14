# DevBox

> Windows üzerinde proje, sohbet, Git, terminal ve kanıt akışını tek yerde toplayan açık kaynak mühendislik masaüstü.

![DevBox sohbet görünümü](docs/images/devbox-chat-ui.png)

DevBox; yerel projeyle konuşmayı, dosyaları incelemeyi, değişiklikleri izlemeyi ve gerçek araçları çalıştırmayı aynı çalışma alanında buluşturur. Bir özellik makinede gerçekten hazır değilse yeşil bir “başarılı” rozeti göstermez: neden kullanılamadığını açıkça söyler.

## ✨ Neler var?

- Sohbet odaklı, koyu ve sıkı bir Windows arayüzü
- Mesaj gönderme, düzenleme, kopyalama, yapıştırma, alıntılama ve yeniden oluşturma kontrolleri
- Kes / Kopyala / Yapıştır içeren yerel sağ tık menüleri
- Her dosya için en fazla 300 MiB sürükle-bırak eki ve SHA-256 içerik kimliği
- Gerçek `node-pty` / Windows ConPTY terminal oturumları
- Gerçek Git durum, diff ve dosya bazlı ekleme/silme sayacı
- Sabit konuşmalar, arşiv, okunma durumu, otomatik başlıklar ve kalıcı SQLite geçmişi
- GitHub PR / issue / check / CI / release ve Vercel komut yolları
- Worktree yaşam döngüsü, dayanıklı görevler, lease ve yeniden başlatma kurtarması
- Gerçek TypeScript/JavaScript LSP diagnostics ve seçilebilir Debug Adapter üzerinden DAP kontrol yüzeyi
- Tek kullanımlık eşleştirme, iptal edilebilir kimlik, heartbeat ve crash-recovery kullanan uzak worker protokolü
- Loopback üzerinde bearer kimlik doğrulamalı DevBox v1 API
- Sağlık ve oturum denetimi geçen Codex CLI öncelikli API gelişim araştırması; yalnızca gerçek çağrı başarısız olursa yapılandırılmış Hermes/NVIDIA NIM geri dönüşü

DevBox’ta demo yanıt, sahte entegrasyon sonucu, simüle edilmiş ilerleme ya da uydurma “hazır” durumu bulunmaz. Çalışmayan bir yol, kanıt üretmek yerine hata durumuna geçer.

## 🧭 Çalışma alanı

![DevBox API gelişimi](docs/images/devbox-api-evolution.png)

API gelişimi ekranı bir modelin kendi kendine eğitim gördüğünü iddia etmez. Gerçek sağlayıcı çağrılarından gelen araştırma sonucu, görev kimliği, zaman, sağlayıcı ve hata kanıtı SQLite WAL veritabanında saklanır. Uygulama kapatıldığında geçmiş kaybolmaz. Otomatik çevrimler güvenli araştırma ve backlog üretir; kaynak kodu kullanıcı onayı olmadan değiştirmez.

![DevBox terminal görünümü](docs/images/devbox-terminal.png)

Terminal görünümü Windows pseudo-console üzerinde çift yönlüdür. Giriş, çıkış, yeniden boyutlandırma ve sonlandırma yaşam döngüsü gerçek süreçle bağlıdır; hem “Sohbete dön” hem de görünür kapatma düğmesi vardır.

## 📦 Kurulum

En güncel `DevBox-Setup.exe`, `devbox.zip`, sağlama toplamları ve sürüm manifesti için [GitHub Releases](https://github.com/ertucaymaz-afk/DevBox/releases) sayfasını kullanın.

1. `SHA256SUMS.txt` içindeki özeti indirdiğiniz dosyayla karşılaştırın.
2. `DevBox-Setup.exe` dosyasını çalıştırın.
3. Kurulum Başlat menüsüne ve masaüstüne DevBox kısayolu ekler.

Kaldırmak için **Windows Ayarları → Uygulamalar → Yüklü uygulamalar → DevBox → Kaldır** yolunu kullanın. Yanlışlıkla kaldırmanın sohbet geçmişini yok etmemesi için kullanıcı verileri otomatik silinmez.

## 🛠️ Kaynaktan derleme

Gerekenler: Windows 11, Node.js 24+, pnpm 11.19.0 ve Git.

```powershell
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm verify
pnpm package:installer
```

`pnpm verify`; TypeScript denetimini, birim/sözleşme testlerini, üretim derlemesini ve ürün-doğruluk denetimini çalıştırır. İmzalı paket yolu olan `pnpm package:signed`, kullanılabilir gerçek bir Authenticode kimliği yoksa bilinçli olarak başarısız olur.

## 🌐 Uzak worker

DevBox API yalnız `127.0.0.1` üzerinde dinler. Uzak bir makineyi doğrudan internete açık bir porta bağlamak yerine güvenilen SSH tüneli kullanın:

1. **Eklentiler ve entegrasyonlar → Dayanıklı uzak worker’lar** bölümünden eşleştirme kodu oluşturun.
2. Uzak makinede ekranda verilen SSH local-forward komutunu çalıştırın.
3. Açık kaynak arşivindeki `scripts/remote-worker.mjs` dosyasını, ekranda verilen ortam değişkenleriyle başlatın.
4. Worker ilk bağlantıda token’ı kullanıcı profilindeki `.devbox/worker-token` dosyasına yazar. Kod tekrar kullanılamaz; uygulamadan worker yetkisi kalıcı olarak kaldırılabilir.

Worker yalnız `git`, `node`, `pnpm`, `npm`, `pwsh` ve `dotnet` komutlarını `shell: false` ile çalıştırır; çalışma dizini seçilen proje kökünün dışına çıkamaz. Çok saatli temiz Windows VM dayanıklılık işi `.github/workflows/windows-resilience.yml` içindedir. Workflow sonucu yayımlanmadan veya gerçek iki makine testi yapılmadan uzak ağ dayanıklılığı “kanıtlandı” diye sunulmaz.

## 🔐 Gizlilik ve güvenlik

DevBox reklam telemetrisi veya ürün analitiği göndermez. Yerel proje, sohbet, ayar, ek ve kanıt verileri; kullanıcı dış sağlayıcı ya da entegrasyon çağrısını açıkça başlatmadıkça makineden çıkmaz. Ayrıntılar [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md) ve [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md) dosyalarında bulunur.

SignPath Foundation açık kaynak başvurusu proje geliştiricisi tarafından **14 Ağustos 2026 tarihinde gönderildi**. Başvuru şu anda dış inceleme/onboarding aşamasındadır. SignPath onayı ve gerçek güven kökü gelene kadar yayımlanan Windows dosyaları `NOT_SIGNED` olarak işaretlenir; self-signed bir sertifika yayın kimliği gibi sunulmaz.

## 👤 Geliştirici

DevBox, **Yaaertu** tarafından geliştiriliyor.

- GitHub ve depo sahibi: [@ertucaymaz-afk](https://github.com/ertucaymaz-afk)
- Instagram: [@yaaertu](https://www.instagram.com/yaaertu/)
- Ürün/geliştirici imzası: **devbox by yaaertu**

`yaaertu` ürün ve sosyal medya kimliğidir. GitHub’da doğrulanmış mevcut hesap ve bu deponun gerçek sahibi `ertucaymaz-afk` olduğu için CODEOWNERS ve yayın kaynağı bu hesapta tutulur. Geliştirici, sorumluluk ve iletişim ayrıntıları için [DEVELOPERS.md](DEVELOPERS.md) dosyasına bakın.

## 🤝 Katkı

Katkılar Apache-2.0 kapsamında açıktır. Başlamadan önce [CONTRIBUTING.md](CONTRIBUTING.md) ve [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) dosyalarını okuyun. Kimlik bilgisi, özel kullanıcı verisi, yerel veritabanı, derleme klasörü veya doğrulanmamış başarı iddiası göndermeyin.

## 📄 Lisans

Copyright 2026 DevBox contributors. [Apache License 2.0](LICENSE) ile lisanslanmıştır.
