/**
 * Tasarım sistemi giriş noktası — tek içe aktarma noktası.
 *
 * MİMARİ (korunuyor): tema, uygulama açılışında `index.js` içindeki ThemedGate
 * AsyncStorage'ı okuyup `setStoredTheme()` çağırdıktan SONRA bu modül ilk kez
 * yüklendiğinde donar. Yani palet, modül yükleme anında sabitlenir; ekranlar
 * hangi temada olduklarını bilmez ve tema değişimi `lib/themeToggle.ts`
 * üzerinden JS'in yeniden yüklenmesiyle uygulanır. Bu, her satırda context
 * okumak zorunda kalmadan (canlı skor listesi için önemli) tema desteği verir.
 *
 * Kullanım:
 *   import { colors, space, type, radius, elevate, haptics } from "@/theme";
 *
 * `colors` = aktif palet + eski takma adlar (bkz. theme/legacy.ts).
 * `palette` = takma adsız, saf yeni palet.
 */

import { Appearance } from "react-native";
import type { ViewStyle } from "react-native";
import { getStoredTheme } from "@/constants/themePreference";
import { paletteFor, type Palette, type ThemeName } from "./palette";
import { withLegacy, type LegacyPalette } from "./legacy";
import { createDividers, elevation, type Dividers, type ElevationLevel } from "./elevation";

export * from "./palette";
export * from "./legacy";
export * from "./rating";
export * from "./zones";
export * from "./typography";
export * from "./space";
export * from "./elevation";
export * from "./motion";

/** Kullanıcı tercihi (güneş/ay düğmesi) varsa o, yoksa sistem teması. */
const override = getStoredTheme();

export const isDark: boolean =
  override ? override === "dark" : Appearance.getColorScheme() === "dark";

/** Aktif tema adı — bileşenler yerine altyapı (StatusBar, harita) içindir. */
export const themeName: ThemeName = isDark ? "dark" : "light";

/** Aktif palet — yalnız yeni token adları. */
export const palette: Palette = paletteFor(themeName);

/** Aktif palet + eski token adları. Ekranların kullandığı sözlük budur. */
export const colors: LegacyPalette = withLegacy(palette);

/** Aktif temaya bağlı ayraç seti. */
export const dividers: Dividers = createDividers(palette);

/** Aktif temaya bağlı yükselti stili — `elevate(1)` gibi kullanılır. */
export function elevate(level: ElevationLevel): ViewStyle {
  return elevation(level, palette, isDark);
}
