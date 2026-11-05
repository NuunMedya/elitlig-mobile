/**
 * Metin dosyasını (CSV, vCard) paylaşım sayfasıyla dışa verir.
 *
 * NE: dosya önbellek klasörüne yazılır, expo-sharing ile paylaşılır
 * (Dosyalar'a kaydet, WhatsApp, e-posta …). Dosya sistemi ya da paylaşım
 * kullanılamazsa (simülatör, eski istemci) içerik yerleşik Share ile düz
 * metin olarak gönderilir — kullanıcı eli boş kalmaz.
 */

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Share } from "react-native";

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "dosya";

export async function shareTextFile(fileName: string, content: string, mimeType: string, uti?: string): Promise<void> {
  try {
    if (await Sharing.isAvailableAsync()) {
      const file = new File(Paths.cache, safeName(fileName));
      if (file.exists) file.delete();
      file.create();
      file.write(content);
      await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: fileName });
      return;
    }
  } catch {
    // aşağıdaki düz metin yoluna düşülür
  }
  await Share.share({ title: fileName, message: content.replace(/^﻿/, "") });
}

export const shareCsv = (fileName: string, csv: string) =>
  shareTextFile(fileName.endsWith(".csv") ? fileName : `${fileName}.csv`, csv, "text/csv", "public.comma-separated-values-text");

export const shareVcard = (fileName: string, vcf: string) =>
  shareTextFile(fileName.endsWith(".vcf") ? fileName : `${fileName}.vcf`, vcf, "text/vcard", "public.vcard");
