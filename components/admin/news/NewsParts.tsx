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

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { FieldLabel } from "@/components/admin";
import { Badge, Button, Input, Touchable, type IconTileTone } from "@/components/ui";
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

const CATEGORY_TILES: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }> = {
  genel: { icon: "newspaper", tone: "violet" },
  transfer: { icon: "swap-horizontal", tone: "cyan" },
  ceza: { icon: "hammer", tone: "red" },
  mac: { icon: "football", tone: "mint" },
  duyuru: { icon: "megaphone", tone: "gold" },
};
export const newsCategoryTile = (key: string) => CATEGORY_TILES[key] ?? { icon: "newspaper" as const, tone: "violet" as IconTileTone };

/**
 * Haber kartı — editoryal düzen: solda kapak küçük resmi (yoksa kategori
 * renginde degrade karo), sağda kategori üst satırı, başlık, özet; dipte durum
 * hapı (yayında / taslak), sabit iğnesi, kapsam ve tarih.
 */
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
  const tile = newsCategoryTile(item.category);
  const draft = item.status !== "published";
  const tones = colors.tileTones[tile.tone];
  return (
    <Touchable
      feedback="card"
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.card, item.pinned ? styles.cardPinned : null]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${NEWS_STATUS_LABELS[item.status] ?? item.status}${item.pinned ? ", sabit" : ""}`}
    >
      {item.pinned ? <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.pinStripe} /> : null}
      <View style={styles.thumb}>
        {item.cover_image_url ? (
          <Image source={{ uri: item.cover_image_url }} style={styles.thumbImage} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <LinearGradient colors={tones} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.thumbFallback}>
            <Ionicons name={tile.icon} size={26} color={colors.onDark} />
          </LinearGradient>
        )}
        {draft ? (
          <View style={styles.draftVeil}>
            <Text style={styles.draftText} {...textScale.badge}>
              TASLAK
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.kicker}>
          <View style={[styles.kickerDot, { backgroundColor: tones[0] }]} />
          <Text style={styles.kickerText} numberOfLines={1} {...textScale.badge}>
            {(item.category_label || "").toLocaleUpperCase("tr-TR")}
          </Text>
          {item.pinned ? <Ionicons name="pin" size={12} color={colors.brandAccent} /> : null}
        </View>
        <Text style={[styles.title, draft ? styles.titleDraft : null]} numberOfLines={2} {...textScale.dense}>
          {item.title}
        </Text>
        {item.summary ? (
          <Text style={styles.summary} numberOfLines={2} {...textScale.dense}>
            {item.summary}
          </Text>
        ) : null}
        <View style={styles.foot}>
          <Badge label={NEWS_STATUS_LABELS[item.status] ?? item.status} tone={draft ? "neutral" : "win"} dot={!draft} size="xs" />
          {locked ? <Badge label="Türkiye geneli" icon="lock-closed" size="xs" /> : null}
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {scope} · {formatDateTime(item.published_at || item.created_at)}
          </Text>
        </View>
      </View>
    </Touchable>
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
  card: {
    flexDirection: "row",
    gap: space.md,
    padding: space.sm,
    paddingRight: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardPinned: { borderColor: colors.brand },
  pinStripe: { position: "absolute", left: 0, top: space.md, bottom: space.md, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  thumb: { width: 92, height: 104, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surface2 },
  thumbImage: { width: "100%", height: "100%" },
  thumbFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  draftVeil: { position: "absolute", left: 0, right: 0, bottom: 0, paddingVertical: 3, alignItems: "center", backgroundColor: colors.overlay },
  draftText: { ...type.nano, color: colors.onDark },
  body: { flex: 1, minWidth: 0, gap: 3, paddingVertical: space.xxs },
  kicker: { flexDirection: "row", alignItems: "center", gap: 5 },
  kickerDot: { width: 6, height: 6, borderRadius: 3 },
  kickerText: { ...type.overline, color: colors.textSecondary, flexShrink: 1 },
  title: { ...type.h4, color: colors.textPrimary },
  titleDraft: { color: colors.textSecondary },
  summary: { ...type.caption, color: colors.textTertiary },
  foot: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: "auto" },
  meta: { ...type.micro, color: colors.textTertiary, flexShrink: 1 },
  field: { gap: space.sm },
  cover: {
    aspectRatio: 16 / 9,
    borderRadius: radius.xl,
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
