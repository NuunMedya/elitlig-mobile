/**
 * Haber yönetimi parçaları.
 *
 *   useNewsScope   kullanıcının yayın kapsamı (Türkiye geneli mi, kendi ili hangisi)
 *                  ve liste satırındaki "İl · lig · sezon" etiketi
 *   NewsCard       liste kartı (kapak, durum, kategori, sabit, kapsam, tarih)
 *   CoverField     kapak görseli: galeriden yükle (expo-image-picker + FormData),
 *                  kaldır ya da bağlantı yapıştır
 *   pickAndUpload  galeriden görsel seç + /api/news/admin/images'a yükle
 */

import { useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { FieldLabel, RecordCard } from "@/components/admin";
import { Button, Input } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDateTime } from "@/lib/admin/format";
import { getScopeCatalog, NEWS_STATUS_LABELS, uploadNewsImage, type AdminNews } from "@/lib/api/admin/news";
import { getCities } from "@/lib/api/meta";
import type { AuthUser } from "@/lib/types";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

type SessionExtras = { roleInfo?: { nationwide?: boolean } | null; actingCity?: { id: number; name: string } | null };

const NATIONWIDE_ROLES = ["admin", "disiplin_kurulu"];
const fold = (text: string | null | undefined) => String(text ?? "").trim().toLocaleLowerCase("tr-TR");

/**
 * Web NewsManager kuralı: Türkiye geneli yetkili (admin, disiplin kurulu ya da
 * rol kataloğunda nationwide) haberi "Türkiye geneli" ya da bir il için
 * yayınlar; il kısıtlı yetkili yalnız kendi ilinde yayınlar (sunucu da zorlar).
 */
export function useNewsScope(user: AuthUser | null | undefined) {
  const extras = (user ?? {}) as SessionExtras;
  const nationwide = Boolean(
    user && (extras.roleInfo?.nationwide ?? NATIONWIDE_ROLES.includes(user.role)) && !extras.actingCity
  );
  const catalog = useQuery({ queryKey: ["admin", "news", "scope-catalog"], queryFn: getScopeCatalog, staleTime: 10 * 60_000 });
  const cities = useQuery({ queryKey: ["admin", "meta", "cities"], queryFn: getCities, staleTime: 10 * 60_000 });

  const ownCityId = useMemo(() => {
    if (extras.actingCity?.id) return extras.actingCity.id;
    const name = fold(user?.city);
    if (!name) return null;
    return cities.data?.find((c) => fold(c.label) === name)?.id ?? catalog.data?.cities.find((c) => fold(c.city_name) === name)?.id ?? null;
  }, [cities.data, catalog.data, user?.city, extras.actingCity?.id]);

  const scopeLabel = useCallback(
    (item: Pick<AdminNews, "city_id" | "league_id" | "season_id">) => {
      if (!item.city_id) return "Türkiye geneli";
      const data = catalog.data;
      const city = data?.cities.find((c) => c.id === item.city_id)?.city_name ?? cities.data?.find((c) => c.id === item.city_id)?.label ?? `İl #${item.city_id}`;
      const league = item.league_id ? data?.leagues.find((l) => l.id === item.league_id)?.league_name ?? `Lig #${item.league_id}` : "tüm ligler";
      const season = item.season_id ? data?.seasons.find((s) => s.id === item.season_id)?.season_name ?? `Sezon #${item.season_id}` : "tüm sezonlar";
      return `${city} · ${league} · ${season}`;
    },
    [catalog.data, cities.data]
  );

  /** Türkiye geneli haber yalnız Türkiye geneli yetkilice düzenlenir. */
  const canEditItem = useCallback(
    (item: Pick<AdminNews, "city_id">) => nationwide || (item.city_id != null && item.city_id === ownCityId),
    [nationwide, ownCityId]
  );

  return { nationwide, ownCityId, ownCityName: user?.city ?? null, scopeLabel, canEditItem };
}

export const NewsCard = React.memo(function NewsCard({
  item,
  scope,
  locked,
  onPress,
  onLongPress,
}: {
  item: AdminNews;
  scope: string;
  locked?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  return (
    <RecordCard
      title={item.title}
      subtitle={item.summary}
      meta={`${scope} · ${formatDateTime(item.published_at || item.created_at)}`}
      avatar={item.cover_image_url ? { name: item.title, image: item.cover_image_url } : undefined}
      icon={item.cover_image_url ? undefined : "newspaper-outline"}
      iconTone="brand"
      muted={item.status === "draft"}
      badges={[
        { label: NEWS_STATUS_LABELS[item.status] ?? item.status, tone: item.status === "published" ? "win" : "warn" },
        { label: item.category_label },
        item.pinned ? { label: "Sabit", tone: "brand", icon: "pin" } : null,
        locked ? { label: "Türkiye geneli", tone: "neutral", icon: "lock-closed" } : null,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
});

/** Galeriden görsel seçer ve haber görseli olarak yükler; iptalde null döner. */
export async function pickAndUpload(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      permission.canAskAgain ? "Fotoğraflarına erişim izni gerekiyor." : "Fotoğraf izni kapalı. Ayarlar'dan ElitLig için fotoğraf iznini aç."
    );
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const mime = asset.mimeType ?? "image/jpeg";
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return uploadNewsImage({ uri: asset.uri, name: asset.fileName ?? `haber-${Date.now()}.${ext}`, type: mime });
}

export function CoverField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    setError(null);
    setBusy(true);
    try {
      const url = await pickAndUpload();
      if (url) onChange(url);
    } catch (e) {
      setError(errorText(e, "Görsel yüklenemedi."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.field}>
      <FieldLabel label="Kapak görseli" />
      <View style={styles.cover}>
        {value ? (
          <Image source={{ uri: value }} style={styles.coverImage} resizeMode="cover" accessibilityLabel="Kapak önizlemesi" />
        ) : (
          <Text style={styles.coverEmpty} {...textScale.dense}>
            Kapak seçilmedi
          </Text>
        )}
      </View>
      <View style={styles.row}>
        <Button label={busy ? "Yükleniyor" : "Görsel yükle"} icon="cloud-upload-outline" variant="secondary" size="sm" onPress={upload} loading={busy} style={styles.grow} />
        {value ? <Button label="Kaldır" icon="close" variant="ghost" size="sm" onPress={() => onChange("")} /> : null}
      </View>
      <Input value={value} onChangeText={onChange} placeholder="veya bağlantı: https://…" autoCapitalize="none" keyboardType="url" size="sm" />
      {error ? (
        <Text style={styles.error} {...textScale.dense}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  cover: {
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  coverImage: { width: "100%", height: "100%" },
  coverEmpty: { ...type.bodySm, color: colors.textTertiary },
  row: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  grow: { flex: 1 },
  error: { ...type.caption, color: colors.danger },
});
