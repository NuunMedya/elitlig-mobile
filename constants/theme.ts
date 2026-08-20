/**
 * ESKİ TEMA GİRİŞİ — artık yalnızca `@/theme` paketine açılan bir kapı.
 *
 * NEDEN BU DOSYA DURUYOR: kod tabanında 58 ekran/bileşen dosyası
 * `@/constants/theme` yolundan `{ colors, radius, spacing, type, isDark }`
 * içe aktarıyor (~1542 renk, ~326 tipografi kullanımı). Tasarım sistemi
 * `theme/` klasörüne taşındı; ama import yollarını ve token adlarını tek
 * seferde değiştirmek gereksiz risk. Bu dosya yeni sistemi olduğu gibi yeniden
 * dışa aktarır, böylece:
 *   - eski adlar (colors.line, colors.turf, spacing.md, type.title …) çalışır,
 *   - yeni adlar (colors.textPrimary, space.md, type.h1 …) da AYNI nesnelerden
 *     okunabilir — birleşik sözlük,
 *   - renkler ve tipografi hiçbir ekran dosyasına dokunmadan yenilenir.
 *
 * KADEMELİ GEÇİŞ PLANI:
 *   1) Bu adım: `theme/` yazıldı, `constants/theme` yeniden dışa aktarıyor.
 *      Tüm ekranlar derleniyor, görünüm yeni palete geçti.
 *   2) Ekran ekran: import yolu `@/theme`'e çekilir, eski token adları
 *      yenileriyle değiştirilir (colors.line → colors.textPrimary,
 *      spacing.md → space.lg gibi — DİKKAT: space.md=12, spacing.md=16).
 *   3) Son ekran da geçince `theme/legacy.ts` ve bu dosya silinir.
 *
 * Tema seçimi mantığı değişmedi: `getStoredTheme()` varsa o, yoksa
 * `Appearance.getColorScheme()`; palet modül yüklenirken donar ve tema
 * değişimi `lib/themeToggle.ts` ile yeniden yükleme yapar.
 */

export * from "@/theme";
