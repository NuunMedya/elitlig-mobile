/**
 * CSV / metin paylaşımı — web'deki "CSV indir" düğmelerinin mobil karşılığı.
 *
 * NE: CSV metnini önbellek klasörüne .csv olarak yazar ve sistem paylaşım
 * sayfasını açar (Excel, Drive, WhatsApp, e-posta...). Dosya yazılamazsa ya
 * da paylaşım kullanılamıyorsa metnin kendisi RN `Share` ile paylaşılır —
 * kullanıcı hiçbir durumda boş elle kalmaz.
 *
 * NEDEN expo-file-system: `expo` paketinin kendi bağımlılığıdır (node_modules
 * içinde kurulu, ek yerel modül gerektirmez).
 */

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Share } from "react-native";

/** Dosya adını güvenli hâle getirir ("muhasebe-2026-09-01_2026-09-30.csv"). */
const safeName = (name: string) => name.replace(/[^\w.\-]+/g, "_");

export async function shareCsv(filename: string, csv: string): Promise<void> {
  try {
    if (await Sharing.isAvailableAsync()) {
      const file = new File(Paths.cache, safeName(filename));
      file.create({ overwrite: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text", dialogTitle: filename });
      return;
    }
  } catch {
    // Dosya yazılamadı → metin olarak paylaş.
  }
  await Share.share({ title: filename, message: csv.replace(/^﻿/, "") });
}

/** Düz metin paylaşımı (ekstre → WhatsApp). */
export async function shareText(title: string, message: string): Promise<void> {
  await Share.share({ title, message });
}
