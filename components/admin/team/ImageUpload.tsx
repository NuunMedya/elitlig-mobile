/**
 * Görsel seçip yükleme — takım logosu, lig logosu, oyuncu fotoğrafı.
 *
 * NE: galeriden kare kırpılmış görsel seçtirir ve { uri, name, type }
 * üçlüsünü verir; yüklemeyi çağıran yapar (her uç kendi alan adını bekler:
 * "logo", "player_img"). İzin reddedilirse Ayarlar'a yönlendiren mesaj döner.
 */

import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

import { Avatar, Button, TeamLogo, Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import type { UploadFile } from "@/lib/api/admin/leagues";
import { colors, radius, space, textScale, type } from "@/theme";

export async function pickImageFile(prefix: string): Promise<UploadFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      "Fotoğraf izni gerekli",
      permission.canAskAgain
        ? "Görsel seçmek için fotoğraflarına erişim izni ver."
        : "Fotoğraf izni kapalı. Ayarlar'dan ElitLig için fotoğraf iznini aç.",
      permission.canAskAgain
        ? [{ text: "Tamam" }]
        : [
            { text: "Vazgeç", style: "cancel" },
            { text: "Ayarları aç", onPress: () => void Linking.openSettings() },
          ]
    );
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const mime = asset.mimeType ?? "image/jpeg";
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return { uri: asset.uri, name: asset.fileName ?? `${prefix}-${Date.now()}.${ext}`, type: mime };
}

/** Seç + yükle akışı (ImageUploadRow ve ImageEditBadge ortak). */
function useImageUpload(kind: "logo" | "photo", prefix: string, upload: (file: UploadFile) => Promise<unknown>, onDone?: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const file = await pickImageFile(prefix);
    if (!file) return;
    setBusy(true);
    try {
      await upload(file);
      toast.show({ message: kind === "logo" ? "Logo güncellendi." : "Fotoğraf güncellendi.", tone: "success" });
      onDone?.();
    } catch (error) {
      toast.show({ message: errorText(error, "Görsel yüklenemedi."), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Önizleme + açıklama + "Görsel seç / değiştir" düğmesi; seçince hemen yükler. */
export function ImageUploadRow({
  kind,
  name,
  image,
  prefix,
  upload,
  onDone,
  disabled,
}: {
  kind: "logo" | "photo";
  name?: string | null;
  image?: string | null;
  prefix: string;
  upload: (file: UploadFile) => Promise<unknown>;
  onDone?: () => void;
  disabled?: boolean;
}) {
  const { busy, run } = useImageUpload(kind, prefix, upload, onDone);
  const noun = kind === "logo" ? "Logo" : "Fotoğraf";
  return (
    <View style={styles.row}>
      {kind === "logo" ? <TeamLogo name={name} logo={image} size={56} /> : <Avatar name={name} image={image} size={56} />}
      <View style={styles.text}>
        <Text style={styles.title} {...textScale.dense}>
          {noun}
        </Text>
        <Text style={[styles.hint, image ? null : styles.hintWarn]} {...textScale.dense}>
          {image ? "Yüklü · değiştirmek için seç" : `${noun} yok · kare görsel önerilir`}
        </Text>
      </View>
      <Button label={image ? "Değiştir" : "Yükle"} icon="image-outline" variant="secondary" size="sm" loading={busy} disabled={disabled} onPress={run} />
    </View>
  );
}

/**
 * Kimlik sahnesindeki büyük görselin sağ altına oturan kamera düğmesi:
 * görsele dokununca seçici açılır, seçilen hemen yüklenir.
 */
export function ImageEditBadge({
  kind,
  prefix,
  upload,
  onDone,
  disabled,
  children,
}: {
  kind: "logo" | "photo";
  prefix: string;
  upload: (file: UploadFile) => Promise<unknown>;
  onDone?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { busy, run } = useImageUpload(kind, prefix, upload, onDone);
  return (
    <Touchable
      feedback="card"
      onPress={run}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={kind === "logo" ? "Logoyu değiştir" : "Fotoğrafı değiştir"}
    >
      {children}
      <View style={styles.badge}>
        {busy ? <ActivityIndicator size="small" color={colors.textOnBrand} /> : <Ionicons name="camera" size={13} color={colors.textOnBrand} />}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  text: { flex: 1, minWidth: 0 },
  title: { ...type.h4, color: colors.textPrimary },
  hint: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
  hintWarn: { color: colors.warn },
  badge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: colors.adminBar,
  },
});
