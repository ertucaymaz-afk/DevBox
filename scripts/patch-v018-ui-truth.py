from pathlib import Path

path = Path("src/renderer/AdvancedViews.tsx")
text = path.read_text(encoding="utf-8")
replacements = [
    ("KALICI GELİŞİM KONTROL DÜZLEMİ · V7", "KALICI GELİŞİM KONTROL DÜZLEMİ · V8"),
    (
        "Ardından <code>git diff --check</code>, <code>typecheck</code> ve <code>test</code> gerçek süreçleri çalışır. Mutasyon veya kanıt yoksa PASS yok.",
        "Ardından <code>git diff --check</code> ve projenin en güçlü <code>verify</code> kapısı gerçek süreç olarak çalışır; <code>verify</code> yoksa <code>typecheck</code> + <code>test</code> + <code>build</code> uygulanır. Mutasyon veya kanıt yoksa PASS yok.",
    ),
]
for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"UI_TRUTH_PATTERN_MISMATCH:{old[:48]}:count={count}")
    text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8", newline="")
print("V018_UI_TRUTH_PATCH_PASS")
