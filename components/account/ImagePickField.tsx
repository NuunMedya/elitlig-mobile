/**
 * GÖRSEL SEÇ + YÜKLE — oyuncu fotoğrafı ve kulüp logosu.
 *
 * Galeriden kare kırpılmış bir görsel seçilir, hemen sunucuya yüklenir
 * (POST /api/panel/me/uploads/:kind) ve dönen adres `onChange` ile forma
 * yazılır. Profil ancak form gönderilip yönetim onaylayınca değişir; bu
 * bileşen yalnız adresi hazırlar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";

import { Avatar, Button, TeamLogo } from "@/components/ui";
import { uploadProfileImage } from "@/lib/api/profile";
import { ApiError } from "@/lib/http";
import { colors, radius, space, textScale, type } from "@/theme";

export interface ImagePickFieldProps {
  kind: "player" | "team";
  /** Önizlemede gösterilecek ad (görsel yoksa baş harfler / arma yer tutucusu). */
  name: string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

export const ImagePickField = React.memo(function ImagePickField({
  kind,
  name,
  value,
  onChange,
  disabled,
}: ImagePickFieldProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        permission.canAskAgain
          ? "Fotoğraflarına erişim izni gerekiyor."
          : "Fotoğraf izni kapalı. Ayarlar'dan ElitLig için fotoğraf iznini aç.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? "image/jpeg";
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    setBusy(true);
    try {
      const { url } = await uploadProfileImage(kind, {
        uri: asset.uri,
        name: asset.fileName ?? `${kind}-${Date.now()}.${ext}`,
        type: mime,
      });
      onChange(url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.userMessage : "Görsel yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }, [kind, onChange]);

  const openSettings = useCallback(() => void Linking.openSettings(), []);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.preview}>
          {kind === "player" ? (
            <Avatar name={name} image={value} size={72} />
          ) : (
            <TeamLogo name={name} logo={value} size={72} />
          )}
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={colors.onDark} />
            </View>
          ) : null}
        </View>
        <View style={styles.actions}>
          <Button
            label={value ? "Değiştir" : kind === "player" ? "Fotoğraf seç" : "Logo seç"}
            icon="image-outline"
            variant="secondary"
            size="sm"
            onPress={pick}
            disabled={disabled || busy}
          />
          {value ? (
            <Button
              label="Kaldır"
              variant="ghost"
              size="sm"
              onPress={() => onChange(null)}
              disabled={disabled || busy}
            />
          ) : null}
        </View>
      </View>
      <Text style={styles.hint} {...textScale.dense}>
        {kind === "player"
          ? "Kare, yüzünün net göründüğü bir fotoğraf en iyi sonucu verir."
          : "Şeffaf arka planlı, kare bir logo önerilir."}
      </Text>
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
          <Text style={styles.error} {...textScale.dense} onPress={error.includes("Ayarlar") ? openSettings : undefined}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: space.s,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  preview: {
    width: 72,
    height: 72,
  },
  busy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
  },
  actions: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  error: {
    ...type.caption,
    color: colors.danger,
    flex: 1,
  },
});
