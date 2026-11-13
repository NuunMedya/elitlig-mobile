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
 * WEB'DE: view-shot'ın web sürümü `findNodeHandle` çağırdığı için RN-web'de
 * düşüyor; DOM düğümü doğrudan html2canvas'a verilir ve PNG indirilir.
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
  if (Platform.OS === "web") return downloadOnWeb(target, width, height, fileName);
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

async function downloadOnWeb(
  target: React.RefObject<View | null>,
  width: number,
  height: number,
  fileName: string,
): Promise<ShareOutcome> {
  const node = target.current as unknown as HTMLElement | null;
  const doc = (globalThis as { document?: Document }).document;
  if (!node || !doc) return "unavailable";
  const { default: html2canvas } = await import("html2canvas");
  // Tuval tam 1080 genişliğe çizilir: ölçek = hedef / düğümün CSS genişliği.
  const scale = width / Math.max(1, node.getBoundingClientRect().width);
  const canvas = await html2canvas(node, { scale, useCORS: true, backgroundColor: null, logging: false });
  const out = doc.createElement("canvas");
  out.width = width;
  out.height = height;
  out.getContext("2d")?.drawImage(canvas, 0, 0, width, height);
  const link = doc.createElement("a");
  link.href = out.toDataURL("image/png");
  link.download = `${fileName}.png`;
  doc.body.appendChild(link);
  link.click();
  link.remove();
  return "downloaded";
}

export { shareFileName } from "./shareFileName";
