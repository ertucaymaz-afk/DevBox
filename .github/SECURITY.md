# DevBox Güvenlik Politikası

## Desteklenen sürümler

DevBox şu anda açık kaynak işlevsel önizleme aşamasındadır. Güvenlik düzeltmeleri en güncel yayımlanmış sürüme ve varsayılan `main` dalına uygulanır. Eski önizlemeler için geriye dönük güvenlik yaması sözü verilmez; mümkün olduğunda en güncel sürüme geçilmesi önerilir.

## Bir güvenlik açığını bildirme

Exploit ayrıntısını, erişim anahtarını, özel proje verisini, kişisel bilgiyi veya hassas günlüğü herkese açık issue’ya koymayın. Depoda GitHub özel güvenlik bildirimi açıksa bu kanalı kullanın. Kullanılamıyorsa açığın ayrıntısını yazmadan, proje sorumlusundan özel iletişim kanalı oluşturmasını isteyen kısa bir issue açın.

İncelemeyi hızlandırmak için mümkünse şunları ekleyin:

- Etkilenen DevBox sürümü veya commit kimliği.
- Windows sürümü ve ilgili çalışma ortamı.
- Güvenli biçimde tekrarlanabilen adımlar.
- Olası güvenlik etkisi ve saldırganın ihtiyaç duyduğu yetki.
- Gizli bilgileri temizlenmiş ekran görüntüsü, günlük veya örnek dosya.
- Bildiğiniz geçici önlem ya da düzeltme önerisi.

Bildirim mümkün olan en kısa sürede alındı olarak işaretlenir. Düzeltme, geçici önlem ve koordineli açıklama takvimi; etkinin ağırlığına, tekrar üretilebilirliğe ve kullanıcı riskine göre belirlenir. Araştırmacının emeği, güvenli açıklama sürecine uyduğu sürece sürüm notlarında belirtilir.

## Temel güvenlik sınırları

- Renderer doğrudan Node.js yetkisine sahip değildir; ayrıcalıklı işlemler doğrulanan IPC sözleşmelerinden geçer.
- Proje dosyası işlemleri, kullanıcının seçtiği kanonik kök içinde sınırlandırılır.
- HTTP API yalnız loopback adresine bağlanır ve bearer anahtarı ister.
- Dış sağlayıcı anahtarları ana/alt süreç sınırında tutulur ve renderer’a geri verilmez.
- Yüksek etkili entegrasyon ve süreç işlemleri etkin izin profiline tabidir.
- SSH güveni açık host-key sabitlemesiyle kurulur; güven veya imza doğrulaması yoksa paket işlemi güvenli biçimde kapanır.
- Yayın paketleri SHA-256 özetleri ve makine tarafından okunabilen imza kararı içerir.
- Güvenilmeyen dış bağlantılar uygulama tarafından sistem tarayıcısında açılmaz.

## Kapsam dışında olmayan önemli alanlar

Kurucu, otomatik güncelleme, release workflow’u, bağımlılık zinciri, ConPTY, LSP/DAP süreçleri, uzak worker eşleştirmesi, GitHub/Vercel/SSH komutları, eklenti veya MCP kurulumu ve dosya önizleme sınırları güvenlik incelemesinin parçasıdır. “Yerel çalışıyor” olması bu yüzeyleri otomatik olarak güvenli yapmaz.

DevBox’ın kendi güvenliğini iyileştirmek için tarayıcılar, birim/sözleşme testleri ve yayın denetimleri kullanılır. DevBox; istismar, kötü amaçlı yazılım üretimi, kimlik bilgisi toplama veya açıkları silahlandırma aracı olarak pazarlanmaz ve dağıtılmaz.
