# DevBox’a Katkı Rehberi

DevBox’a ayırdığınız zaman için teşekkür ederiz. Küçük bir yazım düzeltmesi, iyi hazırlanmış bir hata kaydı, erişilebilirlik önerisi veya kapsamlı bir özellik katkısı aynı amacı taşır: ürünü daha güvenilir ve daha anlaşılır hâle getirmek.

## Başlamadan önce

- Hata bildirecekseniz aynı konunun daha önce açılıp açılmadığını issue’larda arayın.
- Yeni özellikte kullanıcı sorunu, beklenen davranış ve güvenlik sınırını kısa ama somut biçimde anlatın.
- Hassas açık, anahtar, özel proje verisi veya kişisel bilgi içeren konuları herkese açık issue’ya yazmayın; [Güvenlik Politikası](SECURITY.md) içindeki özel bildirim yolunu kullanın.
- Topluluk etkileşimlerinde [Davranış Kuralları](CODE_OF_CONDUCT.md) geçerlidir.

## Değişmez ürün ilkesi

DevBox’ta çalışmayan bir özellik çalışıyormuş gibi gösterilemez. Katkılarda demo veri, sahte entegrasyon sonucu, simüle edilmiş başarı, uydurma ilerleme, doldurma amaçlı cevap veya çalışma zamanı kanıtı olmayan “hazır” durumu bulunmamalıdır.

Bir güven kökü, kimlik bilgisi, sağlayıcı, yürütülebilir dosya veya dış servis yoksa yol güvenli biçimde kapanmalı ve kullanıcıya doğru neden gösterilmelidir. Başarılı görünmek için hatayı gizlemek kabul edilmez.

## Yerel geliştirme akışı

1. Depoyu fork’layın ve değişikliğinizi anlatan odaklı bir dal oluşturun.
2. `pnpm install --frozen-lockfile` ile kilit dosyasındaki bağımlılıkları kurun.
3. Tek bir sorunu çözen, incelenebilir büyüklükte değişiklik yapın.
4. Değişen sözleşme ve görünür davranışlar için test ekleyin veya mevcut testi güncelleyin.
5. `pnpm verify` çalıştırın.
6. Paketleme alanına dokunduysanız Windows üzerinde `pnpm package:installer`, `pnpm release:prepare` ve `pnpm release:verify` komutlarını da çalıştırın.
7. Sonuçları ve dürüstçe kalan sınırları pull request açıklamasına yazın.

`node_modules`, `dist`, `release`, `outputs`, `work`, `evidence`, `research`, `.env` dosyaları, yerel veritabanları, günlükler, kimlik bilgileri veya kullanıcıya ait proje içeriği commit’e eklenmemelidir.

## Kod ve arayüz beklentileri

- Ayrıcalıklı işlemleri doğrulanan IPC sözleşmelerinin dışına taşımayın.
- Dosya ve süreç işlemlerinde seçilen kanonik proje kökü sınırını koruyun.
- Klavye kullanımı, görünür odak, sağ tık menüleri, ekran okuyucu etiketleri ve hareketi azaltma seçeneğini bozmayın.
- Kullanıcıya gösterilen Türkçe metinleri doğal, kısa ve anlaşılır yazın; teknik terim gerekiyorsa ilk kullanımda açıklayın.
- Yeni bağımlılık eklerken lisansı, bakım durumu, paket boyutu ve tedarik zinciri etkisini açıklayın.
- Mevcut kullanıcı verisini değiştiren bir işlemde geriye dönüş ve veri koruma yolunu belirtin.

## İyi bir pull request nasıl görünür?

Pull request açıklamasında şu soruların yanıtı bulunmalıdır:

- Hangi gerçek kullanıcı sorunu çözülüyor?
- Davranış daha önce nasıldı, şimdi nasıl?
- Hangi testler ve derlemeler çalıştırıldı?
- Güvenlik, gizlilik, erişilebilirlik ve performans etkisi nedir?
- Sorun çıkarsa değişiklik nasıl geri alınabilir?
- Henüz kapanmayan veya yalnız belirli ortamda doğrulanabilen ne var?

İmzalama, güncelleme, kurucu, GitHub Actions, izin, IPC, süreç, dosya yolu, ağ veya kimlik bilgisi sınırlarını değiştiren pull request’ler özellikle dikkatli inceleme gerektirir.

## İnceleme kültürü

Kod incelemesi kişiyi değil değişikliği değerlendirir. Bir öneriye katılmıyorsanız gerekçenizi kanıt, test veya somut kullanım örneğiyle anlatın. İnceleme sırasında yeni bir sorun bulunursa kapsamı sessizce büyütmek yerine ayrı issue açmak çoğu zaman daha sağlıklıdır.
