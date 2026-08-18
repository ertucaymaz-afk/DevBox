# v0.1.9 Codex Windows runtime araştırması

Kaynak: OpenAI Codex upstream `scripts/install/install.ps1` ve güncel standalone kurulum değişiklikleri.

Doğrulanan Windows yolları:

- `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe`
- `%CODEX_HOME%\packages\standalone\current\bin\codex.exe`
- geriye dönük uyumluluk için `%CODEX_HOME%\packages\standalone\current\codex.exe`

DevBox v0.1.8 resolver'ı bu standalone yerleşimleri aramadığından, güncel resmi installer ile kurulu Codex mevcut olsa bile API Gelişimi `CODEX_EXECUTABLE_UNAVAILABLE` sonucuna düşebiliyordu. v0.1.9 resolver onarımı bu gerçek konumları, açık `DEVBOX_CODEX_EXECUTABLE`, mevcut npm vendor düzeni ve doğrudan PATH adaylarıyla birlikte fail-closed biçimde araştırır.

Bu araştırma uygulama kanıtı değildir. Uygulama ancak kaynak değişikliği, regresyon testi ve Windows CI doğrulaması geçtikten sonra tamamlanmış sayılır.
