/**
 * İÇERİK HAVUZU SUNUM PARÇALARI.
 *
 *   · TemplateCard  şablon kartı: solda gerçek oranında (gönderi 4:5, hikâye
 *                   9:16, kare, YouTube 16:9) kategori degradesinde mini tuval,
 *                   sağda ad · açıklama · boyut hapları (oran çizgisiyle).
 *   · FolderCard    klasör kartı: degrade klasör karosu, içerik sayısı
 *                   (Archivo), içindeki ilk türlerin üst üste minik tuvalleri.
 *   · PresetCard    klasördeki hazır içerik: mini tuval + başlık + tür + tarih.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Badge, IconTile, Touchable, type IconTileTone } from "@/components/ui";
import {
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_SIZE_LABELS,
  templateById,
  type ContentFolder,
  type ContentPreset,
  type ContentTemplate,
  type TemplateCategory,
  type TemplateSize,
} from "@/lib/api/admin/contentPool";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const CATEGORY: Record<TemplateCategory, { icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }> = {
  match: { icon: "football", tone: "mint" },
  rankings: { icon: "podium", tone: "gold" },
  weekly: { icon: "star", tone: "violet" },
  comparison: { icon: "git-compare", tone: "cyan" },
  entity: { icon: "shield", tone: "signature" },
  announcement: { icon: "megaphone", tone: "pink" },
};
export const categoryTile = (key: TemplateCategory | string) => CATEGORY[key as TemplateCategory] ?? { icon: "image" as const, tone: "violet" as IconTileTone };

/** Boyut → en / boy oranı. */
const RATIO: Record<TemplateSize, number> = { portrait: 4 / 5, story: 9 / 16, square: 1, youtube: 16 / 9, "youtube-hd": 16 / 9 };

/** Kategori degradesinde mini tuval: oran gerçek, içinde kategori ikonu ve iki "satır" izi. */
export function Canvas({ category, size, height = 76 }: { category: TemplateCategory | string; size: TemplateSize; height?: number }) {
  const tile = categoryTile(category);
  const ratio = RATIO[size] ?? 1;
  // Tuval karesel yuvaya sığar: yatay oranlarda en, dikeylerde boy sınırdır.
  const w = Math.round(ratio >= 1 ? height : height * ratio);
  const h = Math.round(w / ratio);
  return (
    <View style={[styles.canvas, { width: w, height: Math.min(h, height) }]}>
      <LinearGradient colors={colors.tileTones[tile.tone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Ionicons name={tile.icon} size={Math.round(Math.min(w, h) * 0.34)} color={colors.onDark} />
      <View style={styles.canvasLines}>
        <View style={[styles.canvasLine, { width: "70%" }]} />
        <View style={[styles.canvasLine, { width: "45%" }]} />
      </View>
    </View>
  );
}

function SizePill({ size }: { size: TemplateSize }) {
  const ratio = RATIO[size] ?? 1;
  return (
    <View style={styles.size}>
      <View style={[styles.sizeGlyph, ratio >= 1 ? { width: 12, height: Math.round(12 / ratio) } : { height: 12, width: Math.round(12 * ratio) }]} />
      <Text style={styles.sizeText} {...textScale.badge}>
        {TEMPLATE_SIZE_LABELS[size]}
      </Text>
    </View>
  );
}

export const TemplateCard = memo(function TemplateCard({ item, onPress }: { item: ContentTemplate; onPress: () => void }) {
  return (
    <Touchable feedback="card" onPress={onPress} style={[styles.card, item.featured ? styles.cardFeatured : null]} accessibilityRole="button" accessibilityLabel={`${item.name}, ${TEMPLATE_CATEGORY_LABELS[item.category]}`}>
      <View style={styles.canvasSlot}>
        <Canvas category={item.category} size={item.sizes[0] ?? "square"} />
      </View>
      <View style={styles.body}>
        <View style={styles.kicker}>
          <Text style={styles.kickerText} numberOfLines={1} {...textScale.badge}>
            {TEMPLATE_CATEGORY_LABELS[item.category].toLocaleUpperCase("tr-TR")}
          </Text>
          {item.featured ? <Badge label="Öne çıkan" tone="brand" icon="sparkles" size="xs" /> : null}
        </View>
        <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
          {item.name}
        </Text>
        <Text style={styles.desc} numberOfLines={2} {...textScale.dense}>
          {item.description}
        </Text>
        <View style={styles.sizes}>
          {item.sizes.map((s) => (
            <SizePill key={s} size={s} />
          ))}
        </View>
      </View>
    </Touchable>
  );
});

export const FolderCard = memo(function FolderCard({ item, onPress, onLongPress }: { item: ContentFolder; onPress: () => void; onLongPress?: () => void }) {
  const firsts = item.presets.slice(0, 3).map((p) => templateById(p.templateId)).filter(Boolean) as ContentTemplate[];
  return (
    <Touchable feedback="card" onPress={onPress} onLongPress={onLongPress} style={styles.card} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.presets.length} içerik`}>
      <IconTile icon={item.canEdit ? "folder-open" : "folder"} tone={item.canEdit ? "violet" : "neutral"} size={48} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
          {item.name}
        </Text>
        {item.description ? (
          <Text style={styles.desc} numberOfLines={2} {...textScale.dense}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.folderFoot}>
          {item.canEdit ? <Badge label="Düzenleyebilirsin" tone="brand" size="xs" /> : <Badge label={`Sahibi: ${item.ownerName || "başka bir yönetici"}`} size="xs" />}
          {firsts.length ? (
            <View style={styles.stack}>
              {firsts.map((t, i) => (
                <View key={`${t.id}-${i}`} style={[styles.stackItem, { marginLeft: i ? -8 : 0 }]}>
                  <Canvas category={t.category} size="square" height={22} />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.count}>
        <Text style={styles.countValue} {...textScale.badge}>
          {item.presets.length}
        </Text>
        <Text style={styles.countLabel} {...textScale.badge}>
          İÇERİK
        </Text>
      </View>
    </Touchable>
  );
});

export const PresetCard = memo(function PresetCard({ item, meta, onPress }: { item: ContentPreset; meta?: string | null; onPress: () => void }) {
  const t = templateById(item.templateId);
  return (
    <Touchable feedback="card" onPress={onPress} style={styles.card} accessibilityRole="button" accessibilityLabel={item.title}>
      <View style={styles.canvasSlotSm}>
        <Canvas category={t?.category ?? "announcement"} size={t?.sizes[0] ?? "square"} height={56} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
          {item.title}
        </Text>
        <Text style={styles.desc} numberOfLines={1} {...textScale.dense}>
          {t?.name ?? item.templateId}
        </Text>
        {meta ? (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={11} color={colors.textTertiary} />
            <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
              {meta}
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="ellipsis-horizontal" size={16} color={colors.textTertiary} />
    </Touchable>
  );
});

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  cardFeatured: { borderColor: colors.brand },
  canvasSlot: { width: 84, height: 84, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, backgroundColor: colors.surface2 },
  canvasSlotSm: { width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, backgroundColor: colors.surface2 },
  canvas: { borderRadius: 8, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  canvasLines: { position: "absolute", left: 6, right: 6, bottom: 6, gap: 3 },
  canvasLine: { height: 3, borderRadius: 2, backgroundColor: colors.inkPillBorder },
  body: { flex: 1, minWidth: 0, gap: 3 },
  kicker: { flexDirection: "row", alignItems: "center", gap: space.xs },
  kickerText: { ...type.overline, color: colors.textTertiary, flexShrink: 1 },
  title: { ...type.h4, color: colors.textPrimary },
  desc: { ...type.caption, color: colors.textSecondary },
  sizes: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 2 },
  size: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  sizeGlyph: { borderRadius: 2, borderWidth: 1.5, borderColor: colors.textSecondary },
  sizeText: { ...type.labelXs, color: colors.textSecondary },
  folderFoot: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 2 },
  stack: { flexDirection: "row" },
  stackItem: { borderRadius: 7, borderWidth: 2, borderColor: colors.surface1 },
  count: { alignItems: "flex-end" },
  countValue: { ...type.scoreMd, color: colors.textPrimary },
  countLabel: { ...type.nano, color: colors.textTertiary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
});
