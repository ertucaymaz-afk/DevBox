# Değişiklik Günlüğü

DevBox’taki kayda değer bütün değişiklikler burada tutulur. `0.x` serisi işlevsel önizleme aşamasındayken proje anlamsal sürümlemeyi izler.

## [0.1.3] - 2026-08-14

### Düzeltildi

- Uygulamadaki **Yenilikler → Son sürümü aç** bağlantısı, ön sürümleri atlayan genel `/releases/latest` adresi yerine derleme sırasında doğrulanan kurulu sürüm numarasının etiketine gider. DevBox 0.1.3 böylece doğrudan `releases/tag/v0.1.3` sayfasını açar.
- Depo ana sayfasındaki sürüm rozeti ve güncel yayın anlatımı v0.1.3 sayfasına bağlandı.

### Doğrulama ve sınırlar

- 19 test dosyası ve 37 test geçti; TypeScript typecheck, Vite/Electron üretim derlemesi ve ürün-doğruluk denetimi başarılıdır.
- SignPath Foundation incelemesi devam ettiği için v0.1.3 Windows dosyaları da `NOT_SIGNED` olarak yayımlanır; kendinden imzalı sertifika kullanılmaz.

## [0.1.2] - 2026-08-14

### Eklendi

- Kurulu sürümün gerçek değişikliklerini gösteren, sürüm bazında okundu durumunu cihazda saklayan ve hareketi azalt tercihine saygı duyan animasyonlu **Yenilikler** çalışma alanı.
- GitHub sürümleri, açık kaynak depo ve geliştirici hesabı için yalnız izin verilen güvenilir HTTPS adreslerini sistem tarayıcısında açan dış bağlantı sınırı.
- Hukuken bağlayıcı Apache 2.0 metnini değiştirmeden sunan Türkçe lisans özeti ile ayrıntılı Türkçe topluluk davranış, katkı, güvenlik, gizlilik ve imzalama belgeleri.
- Kurulu `typescript-language-server` süreciyle gerçek LSP `initialize`, `didOpen` ve `publishDiagnostics` akışı; TypeScript/JavaScript editöründe satır-sütun seçimine giden hata listesi.
- Kullanıcının seçtiği gerçek hata ayıklama adaptörü sürecine bağlanan DAP konsolu; başlatma/bağlanma, devam, duraklat, adım, iş parçacığı, çağrı yığını, kapsam, değişken ve kesme noktası komutları.
- On dakika geçerli tek kullanımlık eşleştirme kodu, yalnız bir kez gösterilen bearer kimliği, heartbeat, 45 saniyelik lease, crash recovery ve yetki iptali kullanan uzak worker protokolü.
- Uzak worker için komut allowlist’i, proje-kökü sınırı, çıktı sınırı ve yeniden bağlanırken üst sınırlı geri çekilme uygulayan `scripts/remote-worker.mjs` çalıştırıcısı.
- Haftalık veya elle başlatılabilen temiz `windows-latest` dayanıklılık iş akışı; varsayılan üç saatlik gerçek CPU/RAM/I/O yükü, failure-injection ve kanıt arşivi.

### Değiştirildi

- GitHub kök görünümü sadeleştirildi: topluluk sağlık dosyaları `.github/`, ayrıntılı ürün ve imzalama belgeleri `docs/`, araç yapılandırmaları `config/` altında toplandı; bütün komutlar, bağlantılar ve kaynak arşivi doğrulaması yeni yollarla güncellendi.
- GitHub Actions `checkout`, `setup-node` ve `upload-artifact` kullanımları Node 24 tabanlı resmî v6 sürümlerine taşındı.
- DevBox durum veritabanı şeması v5’e çıkarıldı; eşleştirme sırları ve worker token’ları düz metin yerine SHA-256 kimlikleriyle saklanır.
- DAP oturum durumu, kabul edilen komuttan tahmin edilmek yerine adapter’ın gerçek `stopped`, `continued`, `terminated` ve `exited` olaylarından güncellenir.
- Worker API kimlik doğrulama hataları HTTP 401, geçersiz yaşam döngüsü geçişleri ayrık hata kodlarıyla raporlanır.

### Doğrulama ve sınırlar

- TypeScript, gerçek language-server entegrasyon testi, loopback worker eşleştirme/lease testi ve SQLite v5/crash-recovery sözleşmeleri release kapısına eklendi.
- Yerel smoke testi bu sürüm turunda kullanıcı isteğiyle çalıştırılmadı. Çok saatli soak, temiz GitHub-hosted Windows VM iş akışına kondu; workflow sonucu oluşmadan “geçti” sayılmaz.
- Fiziksel güç kesintisi, sürücü arızası ve gerçek çok makineli ağ bölünmesi GitHub-hosted VM tarafından kanıtlanmış değildir; bunlar ayrı donanım/uzak-host doğrulama kapısı olarak açık kalır.
- SignPath Foundation başvurusu dış incelemededir; v0.1.2 dosyaları gerçek sertifika sağlanana kadar `NOT_SIGNED` kalır.

## [0.1.1] - 2026-08-14

### Eklendi

- Sohbetlerden ayrı ve sayılı **Sabit konuşmalar** bölümü; sabit satırlarda görünür pin işareti.
- Pull Request’ler için Eklentiler ekranından ayrılmış gerçek GitHub PR/issue/check/CI/release çalışma alanı.
- Çalışma ekranlarında hem **Sohbete dön** hem de görünür kapatma düğmesi.
- Ana geliştirici markası **Yaaertu**, uygulama içinde hareketli `devbox by yaaertu` imzası ve proje sosyal bağlantıları.
- Gerçek uygulama çalıştırmasından alınan sohbet, API gelişimi ve terminal ekran görüntüleri.
- API gelişimi geçmişinde daha geniş görev/bulgu görünümü ve Codex-first sağlayıcı rotasının açık kanıt metni.

### Değiştirildi

- Yeni sohbet düğmesi artık yalnızca boş taslak açıyor; ilk mesaj/ek gönderilmeden SQLite’da art arda boş sohbet üretmiyor.
- Boş durum daha kompakt, ortalanmış ve hareketi azalt ayarına saygı duyan çizgili sinyal animasyonuyla yenilendi.
- Silme sonucu sağ altta kalıcı uyarı yerine üst-ortada, beyaz, animasyonlu ve dört saniyelik `Sohbet silindi.` bildirimi olarak gösteriliyor.
- Sol üst geri düğmesi çalışma ekranlarından sohbete döner; ileri düğmesi yalnızca gerçek sohbet geçmişinde kullanılabilir.
- Düzenlenebilir metin, sohbet kutusu ve kod editörünün sağ tık yolu Kes/Kopyala/**Yapıştır** durumunu gerçek Electron clipboard menüsüne iletiyor.
- API gelişimi ilk gerçek çevrimde oturumu doğrulanmış yerel OpenAI Codex CLI’ı salt-okunur/ephemeral biçimde dener; yalnızca bu çağrı gerçekten başarısızsa yapılandırılmış Hermes/NVIDIA NIM rotasına geçer.
- API gelişimi açıklamaları “kendi kendine eğitim” iddiasını kaldırdı: kalıcı araştırma/backlog geçmişi üretir, kullanıcı onayı olmadan kaynak kodu değiştirmez.
- README ve sürüm belgeleri Türkçe, geliştirici kimliği ve SignPath başvuru durumu ile genişletildi.

### Doğrulama

- TypeScript ana süreç ve renderer denetimleri geçiyor.
- 17 test dosyasındaki 32 birim/sözleşme testi geçiyor.
- Üretim build’i ve ürün-doğruluk denetimi geçiyor; üretim paketinde test modu veya mock/fake/demo/simulation işareti kabul edilmiyor.
- Electron Playwright akışı boş sohbet üretmeme, gerçek SQLite thread sabitleme/silme, uygulama içi onay, merkez bildirimi, Ayarlar kapatma, Pull Request/Eklenti ayrımı, API gelişimi, terminal çıkışları, clipboard köprüsü ve secure preload sözleşmesini çalıştırıyor.

### Dışta kalan yayın kapısı

- SignPath Foundation başvurusu geliştirici tarafından gönderildi; dış inceleme, onboarding ve gerçek sertifika henüz tamamlanmadığından v0.1.1 dosyaları `NOT_SIGNED` yayımlanır. Self-signed sertifika kullanılmaz.

## [0.1.0] - 2026-08-14

### Eklendi

- Kompakt gezinme, proje bağlamı, mesaj geçmişi, ileti kutusu, ayarlar, API gelişimi, entegrasyonlar, dosyalar, Git, terminal, çalışma ağacı ve test yüzeylerini birleştiren sohbet öncelikli Windows masaüstü düzeni.
- Gerçek yerel proje seçimi; sınırlandırılmış dosya işlemleri; SHA-256 önizlemeleri; sağ tık pano eylemleri; mesaj düzenleme, kopyalama, alıntılama ve yeniden oluşturma; dosya başına 300 MiB’a kadar sürükle-bırak ekleri.
- Yeniden boyutlandırma, giriş, çıkış ve sonlandırma yaşam döngüsüne sahip gerçek `node-pty`/ConPTY terminal oturumları.
- Projeler, sohbetler, ayarlar, ekler, mesaj geri bildirimleri, API gelişimi kampanyaları ve dayanıklı görevler için SQLite WAL kalıcılığı.
- Yalnız yerel geri döngü adresinde dinleyen ve erişim anahtarıyla doğrulanan DevBox v1 HTTP API’si.
- Sağlığı denetlenen NVIDIA NIM/Hermes sohbet yolu ve salt okunur API gelişimi analizi için kimliği doğrulanmış resmî Codex CLI yolu; NVIDIA’ya yalnız gerçek Codex hatasından sonra geçiş.
- On dört API gelişimi alanı, günlük 24 çevrim sınırı, 60 dakikalık zamanlama, düzenlenebilir kalıcı yönerge, kanıt bağlantıları ve yeniden başlatma kurtarması.
- Eksik ön koşullarda başarı uydurmayan GitHub, Vercel, SSH sunucu anahtarı sabitleme, LSP/DAP keşfi, çalışma ağacı ve imzalı paket yaşam döngüsü komut yolları.
- Windows NSIS paketleme, sürüm bildirimi, SHA-256 envanteri, CycloneDX SBOM, üçüncü taraf bildirimleri ve güvenli biçimde başarısız olan Authenticode derleme yolu.
- Apache-2.0 lisansı, katkı/güvenlik/gizlilik politikaları, açık CI ve SignPath Foundation başvuru belgeleri.
- Sabitleme, yeniden adlandırma, arşivleme, okundu durumu, projeyi gösterme, yol/oturum/derin bağlantı kopyalama ve kalıcı silme içeren uygulama içi sohbet bağlam menüsü.
- Uydurma düşünce zinciri göstermeden gerçek komut, sağlayıcı, kanıt ve hata ilerlemesini kalıcılaştıran etkinlik kayıtları.
- Dosya başına gerçek `git diff --numstat` ekleme/silme sayılarını ve bilinmeyen/ikili durumları gösteren açılabilir canlı Git değişiklik kapsülü.
- Bir kez, her zaman ve hiçbir zaman seçeneklerine sahip özgün hareketli DevBox açılış tanıtımı.

### Değiştirildi

- Gezinme ve sohbet yoğunluğu verilen Codex tarzı referansa yaklaştırıldı; ayrı görünür `Çalış` modu ana sohbet yüzeyinden kaldırıldı.
- Hareketli SVG DevBox yazı logosu eklendi ve marka ile gezinme arasındaki güvenli boşluk artırıldı.
- Ayarlar odaklı iç bölümlere ayrıldı ve görünür bir kapatma denetimi eklendi.
- Bağlama göre otomatik sohbet başlıkları, proje/sohbet yolu, tam zaman araç ipucu ve kompakt görünür zaman damgaları eklendi.
- Yanıltıcı sürekli yeşil sohbet işareti gerçek çalışıyor/hata durumlarıyla değiştirildi; sohbet açıldığında sahte okunmamış işareti bırakılmıyor.
- Görev silme sonuç döndüren IPC sözleşmesine geçirildi: iptal görevi korur, onay hem SQLite kaydını hem görünür satırı siler.
- Mesaj işlemleri erişilebilir etiketler ile gerçek pano/düzenleme/alıntı/yeniden oluşturma/geri bildirim davranışlarını koruyan kompakt simgelere dönüştürüldü.
- Eski API gelişimi kampanyaları önceki sonuçlar silinmeden günlük 4 çevrim ve 360 dakikadan günlük 24 çevrim ve 60 dakikaya taşındı; eksik on dört alan tamamlandı.
- Sağlayıcı kabiliyeti denetimi açılışı engelleyen yoldan çıkarıldı; ilk hazır olma durumu gerçek denetim bitene kadar belirsiz gösteriliyor.
- Yerel Windows silme penceresi erişilebilir, koyu renkli uygulama içi onay iletişim kutusu ve sonuç döndüren kalıcı silme akışıyla değiştirildi.

### Doğrulama

- TypeScript ana süreç ve görüntüleyici tür denetimleri geçer.
- Birim ve sözleşme testleri veritabanı geçişi/bütünlüğü, dayanıklı görevler, ajan yönlendirmesi ve gerçek kapatıp açma sonrası API gelişimi kalıcılığını kapsar.
- Electron Playwright uçtan uca akışı görev oluşturma, silmeyi iptal etme, onaylı silme, ayarları kapatma, güvenli ön yükleme köprüsü ve üretim derlemesi başlangıcını kapsar.
- Ürün doğruluğu denetimi üretimde test kiplerini ve sahte/demo/simülasyon işaretlerini reddeder; paketlenen dosya izin listesini doğrular.

### Bilinen yayın kapıları

- SignPath Foundation açık kaynak başvurusunu onaylayıp güven kökünü sağlayana kadar mevcut kurucu Authenticode `NotSigned` durumundadır.
- Tam editör tanılama/hata ayıklama arayüzü, yeniden başlatmada sürdürülebilen çok makineli görev planlama, imzalı pazar yeri barındırma, imzalı otomatik güncelleme/onarım/geri alma, temiz sanal makine mutasyon testleri ve çok saatli hata/yük matrisleri bu ilk sürümde yayın için tamamlanmış değildir.
- Dış sistem kanıtı sağlamadıkça SignPath başvurusu, sertifika, imza veya üçüncü taraf hizmet değişikliği başarılı sayılmaz.
