# DevBox Gizlilik ve Veri Akışı Politikası

Son güncelleme: 14 Ağustos 2026

DevBox, yerel öncelikli bir Windows masaüstü uygulamasıdır. Proje; reklam analitiği, kullanıcı profilleme veritabanı veya arka planda çalışan ürün telemetrisi hizmeti işletmez.

## Cihazda saklanan veriler

DevBox, özelliklerini sürdürebilmek ve kesilen işleri geri getirebilmek için geçerli Windows kullanıcısının profilinde şu bilgileri saklayabilir:

- Seçilen proje yolları ve proje üst verileri.
- Sohbet, görev ve mesaj geçmişi.
- Kullanıcı ayarları ve izin politikaları.
- Kullanıcının seçtiği eklerin üst verileri ve yerel kopyaları.
- SHA-256 içerik kimlikleri, komut sonuçları, entegrasyon kanıtları ve dayanıklı görev durumu.
- SSH known-host parmak izleri ve imzalı paket üst verileri gibi yerel güven kayıtları.

Bu bilgiler uygulamanın çalışması, yarım kalan işin kurtarılması ve sonuçların dürüst kanıtla gösterilmesi için kullanılır. DevBox bu verileri satmaz; proje geliştiricisine arka planda göndermez.

## Üçüncü taraflara giden veriler

Ağ erişimi seçilen izin profiliyle yönetilir ve kapatılabilir. Veri yalnız kullanıcı gerçek bir dış işlemi etkinleştirdiğinde veya başlattığında cihazdan çıkar. Yapılan işleme göre:

- NVIDIA NIM; kullanıcı görevini, sınırlandırılmış sohbet bağlamını ve geliştirme/araştırma yönergesini alabilir. NVIDIA API anahtarı ana süreçte okunur, renderer’a verilmez.
- GitHub CLI; depo, pull request, issue, check, workflow veya release verisini makinede oturum açılmış GitHub hesabına gönderebilir.
- Vercel CLI; proje ve deployment verisini makinede yapılandırılan Vercel hesabına gönderebilir.
- SSH işlemleri yalnız kullanıcının seçtiği hedefe bağlanır ve sıkı host-key güven kaydını kullanır.
- Paket, MCP, eklenti veya toolkit işlemleri yalnız açıkça seçilen dosyaları işler; gerekli imza ya da güven kökü yoksa güvenli biçimde durur.

Bu sağlayıcılar veriyi kendi sözleşmeleri ve gizlilik politikaları kapsamında işler. İstekler DevBox tarafından işletilen bir sunucudan geçirilmez.

## Ekler ve arşivler

Her ek için üst sınır 300 MiB’dir. ZIP, RAR ve benzeri arşivler etkisiz dosya olarak eklenebilir; DevBox bunları kendiliğinden çalıştırmaz veya otomatik açmaz. Önizleme boyutu sınırlandırılır, ikili veri yürütülebilir içerik olarak çizilmez.

## Saklama ve silme

Veri; kullanıcı sohbeti veya eki silene ya da uygulama veri dizinini kaldırana kadar cihazda kalır. Windows kaldırıcı, yanlışlıkla program kaldırmanın sohbet geçmişini de yok etmemesi için kullanıcı verisini bilinçli olarak korur. Uygulamayı kaldırdıktan sonra veriyi tamamen silmek isteyen kullanıcı, kendi Windows uygulama verisi altındaki DevBox klasörünü ayrıca kaldırabilir.

## Sorular ve güvenlik bildirimleri

Hassas bir açık için [Güvenlik Politikası](../../.github/SECURITY.md) içindeki özel bildirim yolunu kullanın. Gizli olmayan gizlilik soruları için GitHub issue açabilirsiniz; kişisel veri, anahtar, özel depo içeriği veya gizli bilgi taşıyan günlük eklemeyin.
