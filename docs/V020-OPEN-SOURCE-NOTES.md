# v0.1.20 Açık Kaynak / Premium Tasarım Notları

DevBox ve DevAPI görsel/ürün mimarisinde yalnız izinli ve doğrulanabilir bileşen/desenler kullanılmalıdır.

- Masaüstünde mevcut `lucide-react` ikon sistemi korunur.
- Web animasyonları CSS/Web Animations/IntersectionObserver ile çalışır; sırf animasyon için zorunlu runtime bağımlılığı eklenmez.
- Motion açık kaynak/MIT bir seçenek olarak değerlendirilmiştir; mevcut animasyon kapsamı native tarayıcı API'leriyle karşılandığı için yeni supply-chain bağımlılığı eklenmemiştir.
- Strict command FIFO, Vercel Queues'a taşınmaz. Control path sequence + ACK + idempotency kullanır.
- Queue/Workflow benzeri altyapılar ileride telemetry fan-out, immutable evidence ve async rapor üretimi gibi non-control işler için değerlendirilebilir.
- Crack/warez/kırılmış binary production zincirine alınmaz; provenance ve lisans doğrulanamıyorsa capability BLOCKED/UNAVAILABLE kalır.
