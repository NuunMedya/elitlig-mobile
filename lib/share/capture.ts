/**
 * Paylaşım görselini YAKALA → KAYDET / PAYLAŞ.
 *
 * CİHAZDA: tuval, ekranın arkasındaki görünmez kapta gerçek piksel boyunda
 * (1080 genişlik ÷ PixelRatio) çizilir; `captureRef` onu `width/height`
 * seçenekleriyle tam 1080 × 1920 / 1080 × 1350 PNG'ye çıkarır ve geçici
 * dosyaya yazar. Ardından yerel paylaşım sayfası açılır: iOS'ta
 * "Görüntüyü Kaydet" fotoğraflara indirir, Instagram / WhatsApp doğrudan
 * hikâyeye ya da gönderiye alır; Android'de "Fotoğraflar'a kaydet" /
 * Instagram vb. Ek izin gerekmez (expo-media-library kurulu değil, bilerek:
 * paylaşım sayfası hem indirme hem paylaşma işini görür).
 *
 * WEB'DE: view-shot html2canvas ile çalışır; sonuç PNG dosyası olarak
 * indirilir. Uzak görseller (CORS) tuvali kirletirse yakalama düşer ve
 * çağırana hata döner.
 */

import * as Sharing from "expo-sharing";
import { Platform, type View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { SHARE_FORMATS, type ShareFormat } from "./canvas";

export type ShareOutcome = "shared" | "downloaded" | "unavailable";

export async function captureAndShare(
  target: React.RefObject<View | null>,
  format: ShareFormat,
  fileName: string,
): Promise<ShareOutcome> {
  const [width, height] = SHARE_FORMATS[format].px;
  if (Platform.OS === "web") {
    const dataUri = await captureRef(target, { format: "png", quality: 1, width, height, result: "data-uri" });
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return "unavailable";
    const link = doc.createElement("a");
    link.href = dataUri;
    link.download = `${fileName}.png`;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    return "downloaded";
  }

  const uri = await captureRef(target, {
    format: "png",
    quality: 1,
    width,
    height,
    result: "tmpfile",
    fileName,
  });
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(uri, {
    mimeType: "image/png",
    UTI: "public.png",
    dialogTitle: "Görseli kaydet ya da paylaş",
  });
  return "shared";
}

/** Dosya adı: "elitlig-mac-sonucu-11192-story" (Türkçe harfler sadeleşir). */
export function shareFileName(...parts: (string | number | null | undefined)[]): string {
  const fold: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" };
  return ["elitlig", ...parts]
    .filter((part) => part != null && String(part).trim() !== "")
    .map((part) =>
      String(part)
        .toLocaleLowerCase("tr-TR")
        .replace(/[çğıİöşü]/g, (ch) => fold[ch] ?? ch)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("-")
    .slice(0, 80);
}
