# Üçüncü taraf bildirimleri

DevBox, kaynak ve dağıtım paketlerinde aşağıdaki üçüncü taraf bileşenleri kullanır. Bu liste, ilgili bileşenin geliştiricisini veya lisansını DevBox adına dönüştürmez.

## Microsoft vscode-js-debug

- Proje: <https://github.com/microsoft/vscode-js-debug>
- Sürüm: `1.117.0`
- Dağıtım varlığı: `js-debug-dap-v1.117.0.tar.gz`
- Sabitlenen SHA-256: `AD8D04EDE9D4B75CC290FD5438A65047A06F786D04F604B6112485B36F090772`
- Lisans: MIT
- Kullanım: JavaScript ve Node.js için yerleşik, gerçek Debug Adapter Protocol sunucusu.

Upstream lisans metni değiştirilmeden `vendor/microsoft-js-debug/LICENSE` altında tutulur. DevBox’a ait `devbox-stdio-proxy.mjs`, upstream DAP sunucusunun yerel TCP taşımasını Electron ana sürecinin stdio protokol oturumuna bağlayan ince bir taşıma katmanıdır; hata ayıklayıcı davranışını taklit etmez. DevBox deposunun ESM modu üst dizinden miras kalmasın diye vendor kökünde yalnız modül çalışma biçimini `commonjs` olarak bildiren küçük bir `package.json` bulunur.
