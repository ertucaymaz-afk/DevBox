# DevBox Kod İmzalama Politikası

Ücretsiz kod imzalama hizmetinin [SignPath.io](https://signpath.io/), sertifikanın ise [SignPath Foundation](https://signpath.org/) tarafından sağlanması planlanmaktadır.

## Güncel durum

Proje geliştiricisi SignPath Foundation açık kaynak başvurusunu **14 Ağustos 2026** tarihinde gönderdi. SignPath incelemesi, kimlik doğrulaması, onboarding ve sertifika tahsisi birbirinden ayrı dış süreçlerdir. SignPath tarafından açık onay gelene kadar bunların hiçbiri tamamlanmış sayılmaz.

Mevcut işlevsel önizleme paketleri imzasızdır ve `release-manifest.json` içindeki imza kararı `NOT_SIGNED` değerini taşır. Self-signed bir sertifika, güvenilir kamu yayın kimliği gibi gösterilmez.

## Roller ve sorumluluklar

Projenin şu anda tek sorumlusu bulunduğu için başlangıçta üç rolü de aynı kişi yürütür:

- **Yazar:** [@ertucaymaz-afk](https://github.com/ertucaymaz-afk)
- **İnceleyen:** [@ertucaymaz-afk](https://github.com/ertucaymaz-afk)
- **Onaylayan:** [@ertucaymaz-afk](https://github.com/ertucaymaz-afk)

Yeni güvenilir sorumlular katıldığında görevler ayrılacaktır. Derleme veya imzalama sürecine katılan GitHub ve SignPath hesaplarında çok faktörlü kimlik doğrulama zorunludur.

## Güvenilen kaynak ve derleme

Bir dosya ancak aşağıdaki koşulların tümü sağlanırsa genel yayın imzasına gönderilebilir:

1. Kaynak commit bu herkese açık GitHub deposundan erişilebilir olmalıdır.
2. Derleme, aynı commit içindeki workflow kullanılarak GitHub’ın barındırdığı Windows runner üzerinde yapılmalıdır.
3. Bağımlılıklar `pnpm-lock.yaml` üzerinden `--frozen-lockfile` zorlamasıyla kurulmalıdır.
4. Tür denetimi, testler, üretim derlemesi, ürün-doğruluk denetimi, paket doğrulaması, gizli bilgi taraması ve yayın envanteri başarıyla tamamlanmalıdır.
5. İmzasız dosya güncel resmî `actions/upload-artifact` adımıyla yüklenmeli; SignPath onboarding tamamlandıktan sonra resmî GitHub entegrasyonuyla gönderilmelidir.
6. SignPath kaynak doğrulaması; isteği depoya, workflow’a, commit’e ve derleme çıktısına bağlamalıdır.
7. Yetkili bir onaylayan her imza isteğini elle onaylamalıdır.

Workflow ve bağımlılık değişiklikleri uygulama koduyla aynı incelemeden geçer. Yayın işleri en az GitHub yetkisiyle çalışır; güvenilmeyen pull request kodu imzalama kimlikleriyle yürütülmez.

## Dosya kimliği

İmzalanan dosyalar tutarlı ürün üst verisi taşımalıdır:

- Ürün: `DevBox`
- Yayıncı/sertifika sahibi: SignPath Foundation sürecinde verilen gerçek kimlik
- Dosya ve ürün sürümü: `package.json` sürümü ile release etiketi
- Özgün dosya adı: kurulu uygulama için `DevBox.exe`, kurucu için `DevBox-Setup.exe`

Her release; SHA-256 sağlama toplamı, yayın manifesti, üçüncü taraf bildirimleri ve CycloneDX SBOM içerir. Kod imzası, sağlama toplamı doğrulamasının veya yayın testlerinin yerine geçmez.

## İptal ve olay müdahalesi

İmzalı bir dosyada ihlal şüphesi oluşursa dağıtım durdurulur, etkilenen GitHub release açıkça işaretlenir, SignPath’e bildirim yapılır ve gerekirse sertifika ya da dosya iptali istenir. Etkilenen özetler ve göstergeler yayımlanır; düzeltilmiş sürüm temiz ve incelenmiş bir commit’ten yeniden üretilir. Ele geçirilen hesaplar veya izinsiz workflow değişiklikleri güvenlik olayı kabul edilir.
