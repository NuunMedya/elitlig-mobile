/**
 * ImageUploadField — galeriden görsel seç, sunucuya yükle, adresi forma yaz.
 *
 * Sponsor görselleri, Panorama künye logosu ve Junior Cup logo / manşet
 * görselleri bunu kullanır. Yükleme ucu çağıran tarafından verilir
 * (FormData, alan adı "image"); dönen adres `onChange` ile forma yazılır,
 * kayıt ayrıca yapılır (web ile aynı: yükleme tek başına kaydı değiştirmez).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Image, Linking, StyleSheet, Text, View } from "react-native";

import { FieldLabel } from "@/components/admin";
import { Button } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import type { UploadFile } from "@/lib/api/admin/broadcast";
import { mediaUrl } from "@/lib/format";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

/** Galeriden tek görsel seçer; izin yoksa açıklayıcı hata fırlatır. */
export async function pickImageFile(prefix = "gorsel"): Promise<UploadFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(permission.canAskAgain ? "Fotoğraflarına erişim izni gerekiyor." : "Fotoğraf izni kapalı. Ayarlar'dan ElitLig için fotoğraf iznini aç.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const mime = asset.mimeType ?? "image/jpeg";
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return { uri: asset.uri, name: asset.fileName ?? `${prefix}-${Date.now()}.${ext}`, type: mime };
}

export function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  upload,
  disabled,
  wide,
}: {
  label: string;
  hint?: string;
  value: string | null | undefined;
  onChange: (url: string) => void;
  upload: (file: UploadFile) => Promise<string>;
  disabled?: boolean;
  /** Geniş (manşet/banner) önizleme. */
  wide?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = mediaUrl(value);

  const pick = async () => {
    setError(null);
    try {
      const file = await pickImageFile();
      if (!file) return;
      setBusy(true);
      onChange(await upload(file));
    } catch (e) {
      setError(errorText(e, "Görsel yüklenemedi."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.field}>
      <FieldLabel label={label} />
      <View style={styles.row}>
        <View style={[styles.preview, wide ? styles.previewWide : null]}>
          {src ? (
            <Image source={{ uri: src }} style={styles.img} resizeMode="contain" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color={colors.textTertiary} />
              <Text style={styles.emptyText} {...textScale.badge}>
                {hint || "Görsel yok"}
              </Text>
            </>
          )}
        </View>
        <View style={styles.actions}>
          <Button label={value ? "Değiştir" : "Yükle"} icon="cloud-upload-outline" size="sm" variant="secondary" onPress={() => void pick()} loading={busy} disabled={disabled} />
          {value ? <Button label="Kaldır" size="sm" variant="ghost" onPress={() => onChange("")} disabled={disabled || busy} /> : null}
        </View>
      </View>
      {hint ? (
        <Text style={styles.hint} {...textScale.dense}>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text style={styles.error} {...textScale.long} onPress={error.includes("Ayarlar") ? () => void Linking.openSettings() : undefined}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  preview: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    gap: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  previewWide: { width: 140 },
  emptyText: { ...type.nano, color: colors.textTertiary },
  img: { width: "100%", height: "100%" },
  actions: { flex: 1, flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  hint: { ...type.caption, color: colors.textTertiary },
  error: { ...type.caption, color: colors.danger },
});
