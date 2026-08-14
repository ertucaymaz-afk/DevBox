# SignPath Foundation Açık Kaynak Başvuru Kaydı

Bu belge, gönderilen başvurunun proje içinde izlenebilmesi ve yayın zincirinin herkese açık biçimde denetlenebilmesi için tutulur. SignPath onayı yerine geçmez.

## Proje kimliği

- **Proje:** DevBox
- **Depo:** https://github.com/ertucaymaz-afk/DevBox
- **Ana sayfa:** https://github.com/ertucaymaz-afk/DevBox#readme
- **Lisans:** Apache License 2.0 — OSI onaylı
- **Ana dosya:** Windows x64 NSIS kurucusu `DevBox-Setup.exe`
- **Ürün türü:** Windows öncelikli açık kaynak mühendislik masaüstü
- **Kısa tanım:** Gerçek sağlayıcı, terminal, Git ve entegrasyon yollarını kanıtlarıyla bir araya getiren yerel geliştirme çalışma alanı.
- **Başvuruya dayanak yayın:** https://github.com/ertucaymaz-afk/DevBox/releases/tag/v0.1.1
- **Başvuru tarihi:** 14 Ağustos 2026
- **Dış durum:** İnceleme, kimlik doğrulama, onboarding ve sertifika tahsisi bekleniyor.

## Başvuruda anlatılan ürün

DevBox; yerel yazılım projeleriyle kalıcı sohbetler, sınırlandırılmış dosya işlemleri, Git incelemesi, gerçek ConPTY terminali, worktree’ler, dayanıklı görevler, loopback API ve sağlık denetimli dış sağlayıcı entegrasyonları üzerinden çalışmayı sağlayan Electron/React Windows uygulamasıdır.

Projede uydurulmuş kabiliyet durumları yasaktır. Kimlik bilgisi, araç, protokol, imzalama kimliği veya uzak servis kullanılamıyorsa özellik “hazır” gösterilmez; doğrulanabilir bir hata verir.

`0.1.x` serisi Apache-2.0 altında yayımlanan işlevsel önizlemedir. Özel ücretli sürüm veya kapalı özellik kapısı yoktur. Yeni bir açık kaynak proje olduğu için kanıtlanmamış kullanıcı sayısı, paket yöneticisi popülerliği veya üçüncü taraf itibarı iddia edilmez. Başvuruya dayanak `v0.1.1` GitHub release, imza istenen Windows paket biçimini imzasız olarak içerir.

## Yönetişim ve güvenlik belgeleri

- Katkı rehberi: `.github/CONTRIBUTING.md`
- Topluluk davranış kuralları: `.github/CODE_OF_CONDUCT.md`
- Güvenlik politikası: `.github/SECURITY.md`
- Gizlilik ve veri akışı: `docs/policies/PRIVACY.md`
- İmzalama rolleri ve olay müdahalesi: `docs/policies/CODE_SIGNING_POLICY.md`
- Esas lisans: `LICENSE`
- Derleme ve doğrulama workflow’u: `.github/workflows/ci.yml`
- İndirme ve kaldırma yolu: `README.md` ile `v0.1.1` GitHub release

Projenin şu anda tek sorumlusu olduğu için yazar, inceleyen ve imza onaylayıcısı rolleri aynı kişidedir. Yayın imzalamaya katılan hesaplarda çok faktörlü kimlik doğrulama kullanılacaktır. Yeni güvenilir sorumlular katıldığında görevler ayrılacaktır.

## Önerilen güvenilen derleme zinciri

1. Korunan GitHub Actions workflow’u incelenmiş herkese açık commit’i GitHub’ın Windows runner’ına alır.
2. Node.js ve sabitlenmiş pnpm sürümü, `pnpm-lock.yaml` bağımlılıklarını frozen-lockfile zorlamasıyla kurar.
3. Tür denetimi, birim/sözleşme testleri, üretim derlemesi, ürün-doğruluk denetimi, kurucu paketleme, yayın envanteri ve özet doğrulaması geçer.
4. Güncel resmî `actions/upload-artifact` adımı, `release/devbox-package` klasörünü yerel imzalama anahtarı olmadan yükler.
5. SignPath onboarding kuruluş/proje/politika kimliklerini sağladıktan sonra resmî SignPath GitHub adımı; depoya, workflow’a, commit’e ve dosyaya bağlı kaynak doğrulamasıyla paketi gönderir.
6. Yetkili kişi SignPath içindeki isteği elle onaylar.
7. İmzalı dosya indirilir; Authenticode zinciri ve üst verisi denetlenir. Eşleşen SHA-256 değerleri, SBOM ve yayın manifesti release ile paylaşılır.

Depodaki hiçbir workflow şu anda SignPath’e gönderim yapıyormuş gibi davranmaz. İmzalama işi yalnız SignPath gerçek kimlikleri ve güven kökünü sağladıktan sonra etkinleştirilecektir.

## Güncel kanıt ve dürüst sınırlar

- Yerel TypeScript, birim/sözleşme, üretim derlemesi ve ürün-doğruluk denetimleri çalışır.
- Windows kurucu paketlemesi ve SHA-256 yayın envanteri işlevseldir.
- Mevcut önizleme kurucuları Authenticode açısından `NotSigned` sonucunu verir.
- SignPath incelemesi, kimlik doğrulaması, proje onboarding’i ve sertifika tahsisi dışarıdaki insan onayına bağlıdır; SignPath doğrulamadıkça tamamlanmış gösterilmez.

## İstenen SignPath kapsamı

- Kuruluş/proje: DevBox
- Platform: Windows x64
- Derleme hizmeti: GitHub Actions `windows-latest`
- Kaynak: korunan `main` release commit/etiketi, `ertucaymaz-afk/DevBox`
- İmzalanacak dosya: herkese açık release commit’inden üretilen NSIS kurucusu
- Sertifika sağlayıcı: SignPath Foundation
- Politika: her release için elle onay, zorunlu kaynak doğrulaması, yerel özel anahtar yok
