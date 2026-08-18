# Üçüncü taraf bildirimleri

DevBox, kaynak ve dağıtım paketlerinde aşağıdaki üçüncü taraf bileşenleri kullanır. Bu liste ilgili bileşenin geliştiricisini veya lisansını DevBox adına dönüştürmez.

## Microsoft vscode-js-debug

- Proje: https://github.com/microsoft/vscode-js-debug
- Sürüm: `1.117.0`
- Dağıtım varlığı: `js-debug-dap-v1.117.0.tar.gz`
- Sabitlenen SHA-256: `AD8D04EDE9D4B75CC290FD5438A65047A06F786D04F604B6112485B36F090772`
- Lisans: MIT
- Kullanım: JavaScript ve Node.js için gerçek Debug Adapter Protocol sunucusu.

Upstream lisans metni değiştirilmeden `vendor/microsoft-js-debug/LICENSE` altında tutulur.

## Lucide

- Proje: https://github.com/lucide-icons/lucide
- Paket: `lucide-react`
- Lisans: ISC; Feather'dan gelen ilgili ikon bölümleri MIT
- Kullanım: DevBox masaüstü arayüz ikonları.

## Neon serverless

- Proje: https://github.com/neondatabase/serverless
- Paket: `@neondatabase/serverless`
- Lisans: MIT
- Kullanım: Vercel DevAPI Cloud Control içinde Postgres/Neon bağlantısı.

## Tasarım araştırmasında incelenen ancak bundle'a kopyalanmayan araçlar

Motion (`motiondivision/motion`) ve React Flow (`xyflow/xyflow`) UI/interaction mimarisi araştırmasında incelenir. v0.1.19 DevBox ürün sitesi performans ve supply-chain yüzeyini küçük tutmak için bu paketleri runtime bundle'a eklemez; native CSS/Web Animations/IntersectionObserver kullanır. Bu bölüm bir yeniden dağıtım lisansı bildirimi değil, provenance notudur.
