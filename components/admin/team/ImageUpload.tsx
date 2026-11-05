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
import { Alert, StyleSheet, View } from "react-native";

import { Avatar, Button, TeamLogo, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import type { UploadFile } from "@/lib/api/admin/leagues";
import { space } from "@/theme";

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

/** Önizleme + "Görsel seç / değiştir" düğmesi; seçince hemen yükler. */
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
  return (
    <View style={styles.row}>
      {kind === "logo" ? <TeamLogo name={name} logo={image} size={56} /> : <Avatar name={name} image={image} size={56} />}
      <Button
        label={image ? (kind === "logo" ? "Logoyu değiştir" : "Fotoğrafı değiştir") : kind === "logo" ? "Logo yükle" : "Fotoğraf yükle"}
        icon="image-outline"
        variant="secondary"
        size="sm"
        loading={busy}
        disabled={disabled}
        onPress={run}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
});
