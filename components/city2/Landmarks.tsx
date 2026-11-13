/**
 * SEMBOL YAPILAR — mağaza, depo ve yerleşim ızgarası.
 *
 * Sembol yapılar kozmetiktir: yıldızla alınır, sonra şehrin meydanındaki
 * yuvalara yerleştirilir. Yalnız YERLEŞMİŞ olanlar güzellik puanına sayılır.
 * Bazıları satılmaz (seri ödülü), bazıları merdivende açılır, bazılarından
 * tek tane olur — gerekçeyi sunucu `lock` ile yollar.
 *
 * Yerleştirme sahnede yapılır (yuvaya dokun); sahne yoksa ya da tercih
 * edilirse aynı ızgara burada düz bir tablo olarak da seçilebilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, SegmentedControl, Touchable, type SegmentedItem } from "@/components/ui";
import {
  grantText,
  landmarkLockText,
  slotId,
  type City2CatalogueItem,
  type City2Ladder,
  type City2Landmarks,
  type City2OwnedLandmark,
} from "@/lib/puzzle/city2";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

import { CostButton, LandmarkIcon, StarCost, cardStyle, fmt } from "./shared";

export type LandmarkTab = "shop" | "depot" | "grid";

/** Yerleştirilmekte olan yapı: id varsa o kopya (taşıma), yoksa anahtarın ilk boş kopyası. */
export interface Placing {
  id: string | null;
  key: string;
  title: string;
}

/* ═════════════════════════ IZGARA ═════════════════════════ */

export function SlotGrid({
  landmarks,
  placing,
  onSlot,
}: {
  landmarks: City2Landmarks;
  placing: Placing | null;
  onSlot: (slot: string, id: string | null) => void;
}) {
  const { grid } = landmarks;
  const [width, setWidth] = useState(0);
  const gap = space.xs;
  const cell = width ? Math.floor((width - gap * (grid.cols - 1)) / grid.cols) : 0;
  const byId = useMemo(() => new Map(landmarks.owned.map((l) => [l.id, l])), [landmarks.owned]);
  const tierOf = useMemo(() => new Map(landmarks.catalogue.map((c) => [c.key, c.tier])), [landmarks.catalogue]);
  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {cell > 0
        ? Array.from({ length: grid.rows }, (_, r) => (
            <View key={r} style={[styles.gridRow, { gap }]}>
              {Array.from({ length: grid.cols }, (_, c) => {
                const slot = slotId(r, c);
                const open = r < grid.open_rows;
                const id = grid.taken[slot] ?? null;
                const item = id ? byId.get(id) : null;
                const target = Boolean(placing) && open && !id;
                const moving = Boolean(placing?.id && id === placing.id);
                const size = { width: cell, height: cell, borderRadius: cell > 36 ? radius.sm : radius.xs };
                if (!open) {
                  return (
                    <View key={c} style={[styles.cell, styles.cellLocked, size]}>
                      {c === 0 ? <Ionicons name="lock-closed" size={12} color={colors.textTertiary} /> : null}
                    </View>
                  );
                }
                return (
                  <Touchable
                    key={c}
                    feedback="chip"
                    onPress={() => onSlot(slot, id)}
                    style={[styles.cell, size, target ? styles.cellTarget : null, moving ? styles.cellMoving : null]}
                    accessibilityRole="button"
                    accessibilityLabel={item ? `${item.title}, yuva ${r + 1}-${c + 1}` : `Boş yuva ${r + 1}-${c + 1}`}
                  >
                    {item ? (
                      <LandmarkIcon landmarkKey={item.key} tier={tierOf.get(item.key) ?? "sus"} size={cell - 4} />
                    ) : target ? (
                      <Ionicons name="add" size={16} color={colors.brandAccent} />
                    ) : null}
                  </Touchable>
                );
              })}
            </View>
          ))
        : null}
    </View>
  );
}

/* ═════════════════════════ MAĞAZA ═════════════════════════ */

function ShopItem({
  item,
  ladder,
  available,
  busy,
  onBuy,
}: {
  item: City2CatalogueItem;
  ladder: City2Ladder;
  available: number;
  busy: boolean;
  onBuy: () => void;
}) {
  const reason = landmarkLockText(item.lock, ladder, grantText(item.grant));
  const locked = Boolean(item.lock) && item.lock?.code !== "MAX_OWNED";
  return (
    <View style={styles.item}>
      <LandmarkIcon landmarkKey={item.key} tier={item.tier} size={44} off={locked && item.owned === 0} />
      <View style={styles.itemTexts}>
        <Text style={styles.itemTitle} numberOfLines={1} {...textScale.dense}>
          {item.title}
        </Text>
        <View style={styles.itemMeta}>
          <Ionicons name="sparkles" size={11} color={colors.brandAccent} />
          <Text style={styles.itemBeauty} {...textScale.dense}>
            +{fmt(item.beauty)} güzellik
          </Text>
          {item.owned > 0 ? (
            <Text style={styles.itemOwned} {...textScale.dense}>
              · {item.owned} sende
            </Text>
          ) : null}
        </View>
        {reason ? (
          <View style={styles.itemLock}>
            <Ionicons name={item.lock?.code === "GRANT_ONLY" ? "flame" : item.lock?.code === "MAX_OWNED" ? "checkmark-done" : "lock-closed"} size={11} color={colors.textTertiary} />
            <Text style={styles.itemLockText} numberOfLines={1} {...textScale.dense}>
              {reason}
            </Text>
          </View>
        ) : null}
      </View>
      {item.buyable && item.cost != null ? (
        <CostButton cost={item.cost} available={available} busy={busy} onPress={onBuy} accessibilityLabel={`${item.title} al, ${item.cost} yıldız`} />
      ) : item.cost != null ? (
        <StarCost value={item.cost} muted />
      ) : null}
    </View>
  );
}

/* ═════════════════════════ DEPO ═════════════════════════ */

function OwnedRow({ l, tier, onPlace, onStore }: { l: City2OwnedLandmark; tier: string; onPlace: () => void; onStore?: () => void }) {
  return (
    <View style={styles.item}>
      <LandmarkIcon landmarkKey={l.key} tier={tier} size={40} />
      <View style={styles.itemTexts}>
        <Text style={styles.itemTitle} numberOfLines={1} {...textScale.dense}>
          {l.title}
        </Text>
        <Text style={styles.itemSub} numberOfLines={1} {...textScale.dense}>
          {l.slot ? "Şehirde" : "Depoda"} · +{fmt(l.beauty)} güzellik{l.granted ? " · seri ödülü" : ""}
        </Text>
      </View>
      {onStore ? (
        <Touchable feedback="icon" onPress={onStore} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={`${l.title}: depoya kaldır`}>
          <Ionicons name="archive-outline" size={18} color={colors.textSecondary} />
        </Touchable>
      ) : null}
      <Touchable feedback="button" onPress={onPlace} style={styles.placeBtn} accessibilityRole="button" accessibilityLabel={`${l.title}: ${l.slot ? "taşı" : "yerleştir"}`}>
        <Ionicons name={l.slot ? "move" : "location"} size={14} color={colors.brandAccent} />
        <Text style={styles.placeText} {...textScale.badge}>
          {l.slot ? "Taşı" : "Yerleştir"}
        </Text>
      </Touchable>
    </View>
  );
}

/* ═════════════════════════ PENCERE ═════════════════════════ */

export function LandmarkSheet({
  visible,
  onClose,
  tab,
  onTab,
  landmarks,
  ladder,
  beauty,
  available,
  busy,
  placing,
  onBuy,
  onPlace,
  onStore,
  onSlot,
  onCancelPlacing,
}: {
  visible: boolean;
  onClose: () => void;
  tab: LandmarkTab;
  onTab: (tab: LandmarkTab) => void;
  landmarks: City2Landmarks | null;
  ladder: City2Ladder | null;
  beauty: number;
  available: number;
  busy: boolean;
  placing: Placing | null;
  onBuy: (key: string) => void;
  onPlace: (l: City2OwnedLandmark) => void;
  onStore: (l: City2OwnedLandmark) => void;
  onSlot: (slot: string, id: string | null) => void;
  onCancelPlacing: () => void;
}) {
  const unplaced = landmarks?.owned.filter((l) => !l.slot) ?? [];
  const placed = landmarks?.owned.filter((l) => l.slot) ?? [];
  const tierOf = new Map((landmarks?.catalogue ?? []).map((c) => [c.key, c.tier]));
  const items: SegmentedItem<LandmarkTab>[] = [
    { key: "shop", label: "Mağaza" },
    { key: "depot", label: unplaced.length ? `Depo · ${unplaced.length}` : "Depo" },
    { key: "grid", label: "Yerleşim" },
  ];
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sembol yapılar" snap="full">
      {landmarks && ladder ? (
        <View style={styles.sheet}>
          <View style={styles.beauty}>
            <Ionicons name="sparkles" size={18} color={colors.brandAccent} />
            <Text style={styles.beautyValue} {...textScale.dense}>
              {fmt(beauty)}
            </Text>
            <Text style={styles.beautyLabel} numberOfLines={2} {...textScale.dense}>
              güzellik puanı · yerleşik yapılar ve kurulan her aşama sayılır
            </Text>
          </View>
          <SegmentedControl items={items} value={tab} onChange={onTab} stretch size="sm" />

          {tab === "shop"
            ? landmarks.tiers.map((t) => {
                const list = landmarks.catalogue.filter((c) => c.tier === t.key);
                if (!list.length) return null;
                return (
                  <View key={t.key} style={styles.group}>
                    <Text style={styles.groupTitle} {...textScale.dense}>
                      {t.title.toLocaleUpperCase("tr-TR")}
                    </Text>
                    {list.map((c) => (
                      <ShopItem key={c.key} item={c} ladder={ladder} available={available} busy={busy} onBuy={() => onBuy(c.key)} />
                    ))}
                  </View>
                );
              })
            : null}

          {tab === "depot" ? (
            <View style={styles.group}>
              <Text style={styles.groupTitle} {...textScale.dense}>
                DEPODA BEKLEYENLER
              </Text>
              {unplaced.length ? (
                unplaced.map((l) => <OwnedRow key={l.id} l={l} tier={tierOf.get(l.key) ?? "sus"} onPlace={() => onPlace(l)} />)
              ) : (
                <Text style={styles.empty} {...textScale.long}>
                  Depon boş. Mağazadan aldığın yapılar ve seri ödülleri burada bekler.
                </Text>
              )}
              {placed.length ? (
                <>
                  <Text style={[styles.groupTitle, styles.groupGap]} {...textScale.dense}>
                    ŞEHİRDE · {placed.length}
                  </Text>
                  {placed.map((l) => (
                    <OwnedRow key={l.id} l={l} tier={tierOf.get(l.key) ?? "sus"} onPlace={() => onPlace(l)} onStore={() => onStore(l)} />
                  ))}
                </>
              ) : null}
            </View>
          ) : null}

          {tab === "grid" ? (
            <View style={styles.group}>
              {placing ? (
                <View style={styles.placing}>
                  <Ionicons name="location" size={16} color={colors.brandAccent} />
                  <Text style={styles.placingText} numberOfLines={2} {...textScale.dense}>
                    {placing.title} için boş bir yuva seç
                  </Text>
                  <Touchable feedback="icon" onPress={onCancelPlacing} hitSlop={8} accessibilityRole="button" accessibilityLabel="Yerleştirmeyi bırak">
                    <Text style={styles.placingCancel} {...textScale.dense}>
                      Vazgeç
                    </Text>
                  </Touchable>
                </View>
              ) : (
                <Text style={styles.empty} {...textScale.long}>
                  Bir yapıya dokunup taşıyabilir ya da depoya kaldırabilirsin. Depodaki bir yapıyı yerleştirmek için Depo sekmesine geç.
                </Text>
              )}
              <SlotGrid landmarks={landmarks} placing={placing} onSlot={onSlot} />
              <Text style={styles.gridNote} {...textScale.long}>
                {landmarks.grid.open_slots} yuva açık · yeni satırlar merdivende ilerledikçe açılır.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: space.lg, paddingBottom: space.lg },
  beauty: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.brandDim },
  beautyValue: { ...type.metricSm, color: colors.textPrimary },
  beautyLabel: { ...type.caption, color: colors.textSecondary, flex: 1 },
  group: { gap: space.sm },
  groupGap: { marginTop: space.md },
  groupTitle: { ...type.overline, color: colors.textTertiary },
  item: { ...cardStyle, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  itemTexts: { flex: 1, gap: 2 },
  itemTitle: { ...type.labelSm, color: colors.textPrimary },
  itemSub: { ...type.caption, color: colors.textSecondary },
  itemMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  itemBeauty: { ...type.caption, color: colors.brandAccent },
  itemOwned: { ...type.caption, color: colors.textTertiary },
  itemLock: { flexDirection: "row", alignItems: "center", gap: 3 },
  itemLockText: { ...type.caption, color: colors.textTertiary, flex: 1 },
  iconBtn: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  placeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    backgroundColor: colors.brandDim,
  },
  placeText: { ...type.labelSm, color: colors.brandAccent },
  empty: { ...type.bodySm, color: colors.textSecondary },
  placing: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.brandDim },
  placingText: { ...type.labelSm, color: colors.textPrimary, flex: 1 },
  placingCancel: { ...type.label, fontFamily: fonts.semibold, color: colors.brandAccent },
  grid: { gap: space.xs },
  gridRow: { flexDirection: "row" },
  cell: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border },
  cellLocked: { backgroundColor: colors.surface3, borderColor: colors.surface3, opacity: 0.6 },
  cellTarget: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  cellMoving: { borderColor: colors.brandAccent, borderWidth: 2 },
  gridNote: { ...type.caption, color: colors.textTertiary },
});
