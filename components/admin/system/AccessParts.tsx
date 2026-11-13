/**
 * YETKİ SUNUM PARÇALARI — kullanıcı yetkilendirme ve yönetim kullanıcıları
 * ekranlarının ortak çizimi.
 *
 *   · RoleTile          rolün kimlik karosu: rol renginde degrade zemin,
 *                       beyaz ikon (rol rengi sunucudan gelir).
 *   · roleIcon          rol anahtarı → ikon.
 *   · AccessPersonCard  kişi kartı: avatar · ad · ünvan · rol hapı (rol
 *                       renginde nokta) · il; sağda yetki kapsama halkası.
 *                       Toplu seçimde seçili kart brandDim + imza şerit.
 *   · RoleCard          rol kartı: RoleTile · ad · açıklama · kapsam;
 *                       sağda kişi sayısı (Archivo); altta yetki kapsama çubuğu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Badge, GradientBar, ProgressRing, Touchable, withAlpha, type IconTileTone } from "@/components/ui";
import { ACCESS_SOURCE_LABELS, ROLE_FALLBACK_COLOR, type AccessUser, type RoleRecord } from "@/lib/api/admin/system";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const ROLE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  admin: "shield-checkmark",
  il_yoneticisi: "business",
  lig_yoneticisi: "trophy",
  mac_yoneticisi: "football",
  editor: "create",
  sosyal_medya_yoneticisi: "share-social",
  disiplin_kurulu: "hammer",
  kaptan: "ribbon",
  oyuncu: "person",
};

export const roleIcon = (key: string): keyof typeof Ionicons.glyphMap => ROLE_ICONS[key] ?? "people";

const ROLE_TONES: Record<string, IconTileTone> = {
  admin: "gold",
  il_yoneticisi: "violet",
  lig_yoneticisi: "cyan",
  mac_yoneticisi: "mint",
  editor: "pink",
  sosyal_medya_yoneticisi: "signature",
  disiplin_kurulu: "red",
};

/** Rengi sunucudan gelmeyen yerlerde (yönetim hesapları) rolün IconTile tonu. */
export const roleTone = (key: string): IconTileTone => ROLE_TONES[key] ?? "neutral";

export function RoleTile({ roleKey, color, size = 40 }: { roleKey: string; color?: string | null; size?: number }) {
  const c = color || ROLE_FALLBACK_COLOR;
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: Math.round(size * 0.3) }]}>
      <LinearGradient colors={[c, withAlpha(c, 0.55)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Ionicons name={roleIcon(roleKey)} size={Math.round(size * 0.48)} color={colors.onDark} />
    </View>
  );
}

export const AccessPersonCard = memo(function AccessPersonCard({
  item,
  total,
  roleColor,
  selecting,
  checked,
  onPress,
  onLongPress,
}: {
  item: AccessUser;
  total: number;
  roleColor?: string | null;
  selecting?: boolean;
  checked?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const full = item.source === "full";
  const ratio = full ? 1 : total ? item.permissions.length / total : 0;
  const c = roleColor || ROLE_FALLBACK_COLOR;
  return (
    <Touchable
      feedback="card"
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.card, checked ? styles.cardOn : null]}
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityState={selecting ? { checked } : undefined}
      accessibilityLabel={`${item.name}, ${item.roleLabel}, ${full ? "tüm yetkiler" : `${item.permissions.length} yetki`}`}
    >
      {checked ? <LinearGradient colors={colors.gradientSignature} style={styles.stripe} /> : null}
      {selecting ? (
        <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? colors.brandAccent : item.editable ? colors.textTertiary : colors.textDisabled} />
      ) : null}
      <Avatar name={item.name} size={44} />
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
          {item.name}
        </Text>
        {item.title ? (
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {item.title}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <View style={[styles.rolePill, { backgroundColor: withAlpha(c, 0.16) }]}>
            <View style={[styles.roleDot, { backgroundColor: c }]} />
            <Text style={styles.roleText} numberOfLines={1} {...textScale.badge}>
              {item.roleLabel}
            </Text>
          </View>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {item.nationwide ? "Türkiye geneli" : item.city || "İl yok"}
          </Text>
        </View>
        <View style={styles.badges}>
          <Badge label={ACCESS_SOURCE_LABELS[item.source] ?? item.source} tone={item.source === "personal" ? "accent" : full ? "warn" : "neutral"} size="xs" />
          {item.status === "suspended" ? <Badge label="Askıda" tone="danger" size="xs" /> : null}
          {!item.editable ? <Badge label="Kilitli" icon="lock-closed-outline" size="xs" /> : null}
        </View>
      </View>
      <ProgressRing value={ratio} size={48} thickness={5} tone={full ? "warn" : "brand"} label={full ? "∞" : String(item.permissions.length)} />
    </Touchable>
  );
});

export const RoleCard = memo(function RoleCard({ item, total, onPress }: { item: RoleRecord; total: number; onPress: () => void }) {
  const on = item.editable ? item.permissions.length : total;
  return (
    <Touchable feedback="card" onPress={onPress} style={styles.role} accessibilityRole="button" accessibilityLabel={`${item.label}, ${item.userCount} kişi, ${on}/${total} yetki`}>
      <View style={styles.roleHead}>
        <RoleTile roleKey={item.key} color={item.color} size={42} />
        <View style={styles.main}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {item.label}
          </Text>
          <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
            {item.description || (item.custom ? "Panelden eklenen rol" : "Yerleşik rol")}
          </Text>
        </View>
        <View style={styles.count}>
          <Text style={styles.countValue} {...textScale.badge}>
            {item.userCount.toLocaleString("tr-TR")}
          </Text>
          <Text style={styles.countLabel} {...textScale.badge}>
            KİŞİ
          </Text>
        </View>
      </View>
      <View style={styles.roleBar}>
        <GradientBar value={total ? on / total : 0} height={5} gradient={[item.color || ROLE_FALLBACK_COLOR, withAlpha(item.color || ROLE_FALLBACK_COLOR, 0.5)]} style={styles.flex} />
        <Text style={styles.roleBarText} {...textScale.badge}>
          {item.editable ? `${on}/${total} yetki` : "Tüm yetkiler"}
        </Text>
      </View>
      <View style={styles.badges}>
        {item.isManagement ? <Badge label={item.nationwide ? "Türkiye geneli" : "İl bazlı"} icon={item.nationwide ? "globe-outline" : "location-outline"} size="xs" /> : null}
        {item.custom ? <Badge label="Özel" tone="accent" size="xs" /> : null}
        {!item.custom && item.customized ? <Badge label="Düzenlendi" tone="info" size="xs" /> : null}
        {item.editable && !item.isDefault && item.isSystem ? <Badge label="Özelleştirilmiş yetkiler" tone="warn" size="xs" /> : null}
        {!item.editable ? <Badge label="Kilitli" icon="lock-closed-outline" size="xs" /> : null}
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tile: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardOn: { backgroundColor: colors.brandDim, borderColor: colors.brand },
  stripe: { position: "absolute", left: 0, top: space.md, bottom: space.md, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  name: { ...type.h4, color: colors.textPrimary },
  title: { ...type.caption, color: colors.textSecondary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rolePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, flexShrink: 1 },
  roleDot: { width: 7, height: 7, borderRadius: 4 },
  roleText: { ...type.labelXs, color: colors.textPrimary, flexShrink: 1 },
  meta: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  role: { gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  roleHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  count: { alignItems: "flex-end" },
  countValue: { ...type.scoreMd, color: colors.textPrimary },
  countLabel: { ...type.nano, color: colors.textTertiary },
  roleBar: { flexDirection: "row", alignItems: "center", gap: space.sm },
  roleBarText: { ...type.numSmStrong, color: colors.textSecondary },
});
