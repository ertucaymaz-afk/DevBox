# `geliştirme.md` işleme ve izlenebilirlik kaydı

Bu belge, masaüstündeki kapsamlı geliştirme şartnamesinin DevBox deposuna nasıl alındığını ve bundan sonra nasıl kanıt temelli yürütüleceğini açıklar.

## Kaynak kimliği

- Kaynak: `C:\Users\cayxm\Desktop\geliştirme.md`
- SHA-256: `C6C9F157389E93FFC3F912C9D79583EB40F9BA7D6428ADC6D99405A1B9509750`
- Satır sayısı: 51.468
- Faz sayısı: 22
- Ayrıştırılan benzersiz atomik görev: 3.362
- Yinelenen görev referansı: 411
- Otomatik olarak başarılı sayılan görev: 0

Kaynak dosya uygulama paketine kopyalanmaz. Bunun yerine sürüm kontrollü ve makine tarafından okunabilir görev grafiği üretilir. Böylece büyük şartname bir çalışma zamanı bağımlılığına dönüştürülmeden, her madde dosya/kanıt/test bağlantılarıyla izlenebilir.

## Tekrarlanabilir alım hattı

```powershell
pnpm spec:import -- --input "C:\Users\cayxm\Desktop\geliştirme.md"
```

Komut şu çıktıları üretir:

- `specs/development/geliştirme-spec-task-graph.json`: 22 faz ve 3.362 benzersiz atomik görevin sürüm kontrollü, makine tarafından okunabilir grafiği.
- `docs/GELISTIRME-MD-ALIM-RAPORU.md`: kaynak özeti, faz başına görev sayıları ve alım kuralları.

Her görev başlangıçta `TODO` durumundadır. Bir görevin durumu yalnızca gerçek uygulama dosyaları, çalıştırılmış doğrulama komutları ve gözlenen sonuç bağlandığında değiştirilecektir. Benzer başlık veya geçmişte yazılmış doküman, görev tamamlama kanıtı değildir.

## Bu sürümde fiilen başlayan alanlar

Bu sürüm şartnamenin tamamlandığını iddia etmez. Aşağıdaki fazlarla doğrudan ilişkili üretim temelleri uygulanmış ve test edilmiştir:

- Faz 04 — DevBox API ve durum veritabanı: kalıcı, dinamik ve kanıt temelli API gelişim kuyruğu; gerçek sağlayıcı çalıştırmaları; 4/24 gibi yapay kullanım sınırlarının kaldırılması.
- Faz 05 — sağlayıcılar ve modeller: gerçek yerel Codex oturumu, `gpt-5.6-sol` ve yüksek düşünme düzeyi; erişilemezse açıkça raporlanan gerçek NVIDIA/Hermes geri dönüşü.
- Faz 07 — depo zekâsı, LSP ve DAP: gerçek TypeScript/JavaScript dil sunucusu akışı, Microsoft JavaScript Debug Adapter ile thread/call-stack/scope/variable yüzeyi.
- Faz 10 — eklenti/MCP/beceriler: imza ve güven sınıfı sözleşmeleri, kayıt defteri, izole çocuk süreçte MCP oturumu, gerçek araç keşfi ve çağrısı.
- Faz 14 — uzak çalışma: süreli eşleşme belirteçleri, worker yetkileri, kalıcı işler, heartbeat, iptal ve aynı makinede gerçek worker E2E kanıtı.
- Faz 15 — güvenlik ve tedarik zinciri: kurcalamaya dayanıklı denetim zinciri, imzalı iptal listesi ve paket yaşam döngüsü denetimi.
- Faz 17 — performans ve kaynak yönetimi: bounded çıktı, işlem ağacı iptali ve çalışma zamanı sağlık sınırları.
- Faz 18 — kurulum, güncelleme ve imzalama: tekrar üretilebilir paketleme ve imza politikası. Authenticode yayın sertifikası SignPath incelemesi sonuçlanana kadar mevcut değildir.
- Faz 19 — failure injection ve temiz makine E2E: otomatik test temelleri mevcut; uzun temiz-VM soak, fiziksel güç kesintisi ve gerçek ikinci makine matrisi hâlâ gereklidir.
- Faz 20 — yayın paketleme: kaynak/kurucu/ZIP ayrımı, bütünlük kimlikleri ve masaüstü teslim senkronizasyonu.

## İşleme sırası

1. Görev grafiğindeki kimlikleri mevcut üretim kodu ve test kanıtlarıyla eşleştir.
2. Sahipsiz maddeleri faz, bağımlılık ve risk sırasına göre küçük uygulanabilir değişikliklere böl.
3. Her değişiklikte gerçek entegrasyonu çalıştır; bulunmayan sağlayıcı veya sistemleri `hazır`, `başarılı` ya da `kurulu` gösterme.
4. Test, güvenlik, performans ve paketleme kapılarını geçir.
5. Yalnızca kanıt bağlantısı olan atomik görevleri `PASS`; dış bağımlılığı olanları gerekçeli `BLOCKED`; diğerlerini `TODO` tut.

## Gerçeklik kuralı

DevBox'ta demo, fake, mock veya simülasyon üretim özelliği olarak sunulamaz. Test doubles yalnızca test dosyalarının içinde kalabilir. Fiziksel ikinci makine, güvenilir kod imzalama sertifikası, uzun Windows VM soak veya dış pazaryeri sunucusu gibi henüz doğrulanmamış alanlar açık engel olarak raporlanır.
