/**
 * KULÜP ŞEHRİ 2.0 · FAZ 5 — sezon parçaları.
 *
 *   · TierMedal / CrestBadge — sezon dilimi madalyası; arma (sezon çerçevesi +
 *     prestij yıldızları). Yıldızlar Ionicons ile çizilir (sunucunun `stars_text`
 *     karakteri gösterilmez).
 *   · SeasonCard — şehir ekranındaki sezon kartı (sezon öncesi de).
 *   · SeasonParts — puan kırılımı (kalem, birim, tavan, puan).
 *   · SeasonHistoryList, RewardTiers — geçmiş sezonlar ve dilim kuralları.
 *   · SeasonEndSheet — yeni bir sezon dilimi verildiğinde bir kez (cihazda
 *     "görüldü" olarak saklanır).
 *
 * Kupa, rozet ve çerçeve yalnız görünüştür; hiçbir şey satın alınmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { BottomSheet, Button, Reveal, Touchable } from "@/components/ui";
import {
  SEASON_TIER_TITLE,
  estimateTier,
  seasonLeftText,
  spanText,
  type City2Crest,
  type City2Season,
  type City2SeasonHistory,
  type City2SeasonPart,
  type City2State,
} from "@/lib/puzzle/city2";
import { CITY2_UI, seasonTierStyle } from "@/lib/puzzle/cityPalette";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

import { Bar, cardStyle, fmt } from "./shared";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export const tierTitle = (tier: string | null | undefined, fallback?: string | null) => fallback ?? (tier ? SEASON_TIER_TITLE[tier] ?? tier : "Dilim yok");

/* ───────────────────────── Madalya ve arma ───────────────────────── */

/** Sezon dilimi madalyası (altın · gümüş · bronz; dilim yoksa gri). */
export function TierMedal({ tier, size = 40, icon = "trophy" }: { tier: string | null | undefined; size?: number; icon?: keyof typeof Ionicons.glyphMap }) {
  const s = seasonTierStyle(tier);
  return (
    <LinearGradient colors={s.colors} start={TOP} end={BOTTOM} style={[styles.medal, { width: size, height: size, borderRadius: size / 2, borderColor: s.edge }]}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={s.ink} />
    </LinearGradient>
  );
}

/** Prestij yıldızları (en çok 5 tane çizilir, fazlası "×N"). */
export function PrestigeStars({ count, size = 12, color = CITY2_UI.star, style }: { count: number; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  const shown = Math.min(5, count);
  return (
    <View style={[styles.starsRow, style]} accessibilityLabel={`${count} prestij yıldızı`}>
      {Array.from({ length: shown }, (_, i) => (
        <Ionicons key={i} name="star" size={size} color={color} />
      ))}
      {count > shown ? (
        <Text style={[styles.starsMore, { color }]} {...textScale.badge}>
          ×{count}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Kulüp arması: kalkan, sezon çerçevesinin rengiyle halka; altında prestij
 * yıldızları. Çerçeve ve yıldız yoksa sade kalkan.
 */
export function CrestBadge({ crest, size = 44, onDark }: { crest: City2Crest | null | undefined; size?: number; onDark?: boolean }) {
  const framed = Boolean(crest?.frame);
  const s = seasonTierStyle(crest?.frame);
  const inner = Math.round(size * 0.78);
  const label = [crest?.frame_title, crest?.prestige_stars ? `${crest.prestige_stars} prestij yıldızı` : null].filter(Boolean).join(", ") || "Kulüp arması";
  return (
    <View style={styles.crestWrap} accessibilityLabel={label}>
      {framed ? (
        <LinearGradient colors={s.colors} start={TOP} end={BOTTOM} style={[styles.crestRing, { width: size, height: size, borderRadius: size / 2 }]}>
          <View style={[styles.crestInner, { width: inner, height: inner, borderRadius: inner / 2 }]}>
            <Ionicons name="shield" size={Math.round(inner * 0.55)} color={CITY2_UI.star} />
          </View>
        </LinearGradient>
      ) : (
        <View style={[styles.crestInner, onDark ? styles.crestPlainDark : styles.crestPlain, { width: size, height: size, borderRadius: size / 2 }]}>
          <Ionicons name="shield" size={Math.round(size * 0.5)} color={onDark ? CITY2_UI.star : colors.brandAccent} />
        </View>
      )}
      {crest?.prestige_stars ? <PrestigeStars count={crest.prestige_stars} size={Math.max(9, Math.round(size * 0.24))} style={styles.crestStars} /> : null}
    </View>
  );
}

/**
 * Sahne üstündeki küçük arma şeridi (koyu yarı saydam zemin): çerçeve
 * renginde kalkan + prestij yıldızları.
 */
export function CrestChip({ crest }: { crest: City2Crest }) {
  const s = seasonTierStyle(crest.frame);
  return (
    <View style={styles.crestChip} accessibilityLabel={[crest.frame_title, crest.prestige_stars ? `${crest.prestige_stars} prestij yıldızı` : null].filter(Boolean).join(", ")}>
      <LinearGradient colors={s.colors} start={TOP} end={BOTTOM} style={styles.crestChipShield}>
        <Ionicons name="shield" size={11} color={s.ink} />
      </LinearGradient>
      {crest.prestige_stars > 0 ? <PrestigeStars count={crest.prestige_stars} size={11} /> : null}
    </View>
  );
}

/* ───────────────────────── Şehir ekranındaki kart ───────────────────────── */

export function SeasonCard({ season, crest, onPress }: { season: City2Season; crest: City2Crest | null | undefined; onPress: () => void }) {
  const cur = season.current;
  const est = estimateTier(season);
  const last = season.history[0] ?? null;
  if (!cur) {
    const pre = season.preseason;
    return (
      <Touchable onPress={onPress} feedback="card" style={styles.card} accessibilityRole="button" accessibilityLabel={`${pre?.text ?? "Sezon yakında"}. Sezon ayrıntıları`}>
        <View style={styles.cardHead}>
          <TierMedal tier={null} size={44} icon="calendar" />
          <View style={styles.flex}>
            <Text style={styles.over} {...textScale.badge}>
              SEZON
            </Text>
            <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
              {pre?.text ?? "Sezon yakında başlıyor"}
            </Text>
            {pre ? (
              <Text style={styles.cardMeta} numberOfLines={1} {...textScale.dense}>
                {pre.season.range_text}
                {spanText(pre.starts_at) ? ` · ${spanText(pre.starts_at)} sonra` : ""}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
      </Touchable>
    );
  }
  const maxScore = cur.parts.reduce((a, p) => a + p.max_points, 0);
  return (
    <Touchable onPress={onPress} feedback="card" style={styles.card} accessibilityRole="button" accessibilityLabel={`${cur.title}, ${fmt(cur.score)} puan, ${seasonLeftText(cur)} kaldı. Sezon ayrıntıları`}>
      <View style={styles.cardHead}>
        <TierMedal tier={est?.tier ?? null} size={44} />
        <View style={styles.flex}>
          <Text style={styles.over} {...textScale.badge}>
            {`${cur.title.toLocaleUpperCase("tr-TR")} · ${cur.name.toLocaleUpperCase("tr-TR")}`}
          </Text>
          <View style={styles.scoreLine}>
            <Text style={styles.score} {...textScale.dense}>
              {fmt(cur.score)}
            </Text>
            <Text style={styles.scoreUnit} {...textScale.dense}>
              sezon puanı
            </Text>
          </View>
        </View>
        <View style={styles.left}>
          <Text style={styles.leftValue} {...textScale.badge}>
            {seasonLeftText(cur)}
          </Text>
          <Text style={styles.leftLabel} {...textScale.badge}>
            kaldı
          </Text>
        </View>
      </View>
      <Bar value={maxScore ? cur.score / maxScore : 0} tone="brand" />
      <View style={styles.cardFoot}>
        <Text style={styles.cardMeta} numberOfLines={1} {...textScale.dense}>
          {cur.rank != null && cur.ranked ? `${fmt(cur.rank)}. sıra · ${fmt(cur.ranked)} kişi` : "Sıraya girmek için 100 puan"}
          {est ? ` · tahmini ${est.title.toLocaleLowerCase("tr-TR")}` : ""}
        </Text>
        {crest?.frame || last?.badge ? (
          <View style={styles.badgeChip}>
            <TierMedal tier={crest?.frame ?? last?.tier ?? null} size={18} icon="ribbon" />
            <Text style={styles.badgeChipText} numberOfLines={1} {...textScale.badge}>
              {`${season.badges.length} rozet`}
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </View>
    </Touchable>
  );
}

/* ───────────────────────── Puan kırılımı ───────────────────────── */

const GROUPS: { key: string; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "real", title: "Sahada ve tribünde", icon: "football" },
  { key: "city", title: "Şehrin", icon: "business" },
  { key: "quest", title: "Görevler", icon: "checkbox" },
  { key: "social", title: "Ziyaretçiler", icon: "hand-left" },
];

/** "4 maç · maç başına 150" gibi kısa birim metni. */
function unitText(p: City2SeasonPart): string {
  const have = p.per > 1 ? `${fmt(p.have)} (${fmt(p.per)} başına ${fmt(p.points_per)})` : `${fmt(p.have)} × ${fmt(p.points_per)}`;
  const cap = p.per > 1 ? `tavan ${fmt(p.cap * p.per)}` : `tavan ${fmt(p.cap)}`;
  return `${have} · ${cap}`;
}

export function SeasonParts({ parts }: { parts: City2SeasonPart[] }) {
  return (
    <View style={styles.parts}>
      {GROUPS.map((g) => {
        const rows = parts.filter((p) => p.group === g.key);
        if (!rows.length) return null;
        const sum = rows.reduce((a, p) => a + p.points, 0);
        return (
          <View key={g.key} style={styles.group}>
            <View style={styles.groupHead}>
              <Ionicons name={g.icon} size={15} color={colors.brandAccent} />
              <Text style={styles.groupTitle} {...textScale.dense}>
                {g.title}
              </Text>
              <Text style={styles.groupSum} {...textScale.badge}>
                {fmt(sum)} puan
              </Text>
            </View>
            {rows.map((p) => {
              const full = p.counted >= p.cap;
              return (
                <View key={p.key} style={styles.part} accessible accessibilityLabel={`${p.label}: ${fmt(p.points)} puan, ${unitText(p)}`}>
                  <View style={styles.partHead}>
                    <Text style={styles.partLabel} numberOfLines={1} {...textScale.dense}>
                      {p.label}
                    </Text>
                    {full ? (
                      <Text style={styles.partFull} {...textScale.badge}>
                        TAVAN
                      </Text>
                    ) : null}
                    <Text style={[styles.partPoints, p.points === 0 ? styles.muted : null]} {...textScale.badge}>
                      {fmt(p.points)}
                    </Text>
                  </View>
                  <Bar value={p.cap ? p.counted / p.cap : 0} tone={full ? "go" : "brand"} style={styles.partBar} />
                  <Text style={styles.partMeta} numberOfLines={1} {...textScale.dense}>
                    {unitText(p)}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/* ───────────────────────── Dilimler ve geçmiş ───────────────────────── */

export function RewardTiers({ season }: { season: City2Season }) {
  const min = season.rewards[0]?.min_score ?? 100;
  return (
    <View style={styles.tiers}>
      {season.rewards.map((r, i) => (
        <View key={r.tier} style={styles.tierRow}>
          <TierMedal tier={r.tier} size={34} />
          <View style={styles.flex}>
            <Text style={styles.tierTitle} {...textScale.dense}>
              {r.title}
            </Text>
            <Text style={styles.tierMeta} numberOfLines={2} {...textScale.dense}>
              {i === season.rewards.length - 1 || r.top_pct >= 1 ? `${fmt(min)} puanı geçen herkes` : `İlk %${Math.round(r.top_pct * 100)}`}
              {" · rozet, arma çerçevesi ve sezon kupası"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function SeasonHistoryList({ history }: { history: City2SeasonHistory[] }) {
  return (
    <View style={styles.history}>
      {history.map((h) => (
        <View key={h.id} style={styles.historyRow}>
          <TierMedal tier={h.tier} size={40} icon={h.tier ? "trophy" : "remove"} />
          <View style={styles.flex}>
            <Text style={styles.historyTitle} numberOfLines={1} {...textScale.dense}>
              {h.title} · {h.name}
            </Text>
            <Text style={styles.historyMeta} numberOfLines={2} {...textScale.dense}>
              {[
                `${fmt(h.score)} puan`,
                h.pending ? "sıra hesaplanıyor" : h.rank != null && h.total ? `${fmt(h.rank)}. / ${fmt(h.total)}` : null,
                h.tier ? tierTitle(h.tier, h.tier_title) : h.pending ? null : "dilim yok",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {h.badge ? (
              <Text style={styles.historyBadge} numberOfLines={1} {...textScale.dense}>
                {h.badge.title} · {h.badge.frame_title}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ───────────────────────── Sezon sonu kutlaması ───────────────────────── */

const seenKey = (id: number) => `elitlig.city2.season.seen.v1.${id}`;

/**
 * Sezon dilimi geldiğinde (geçmişteki en yeni sezon: dilimli, beklemede değil)
 * bir kez açılır. "Görüldü" cihazda saklanır. Dilimsiz sezonlarda açılmaz.
 */
export function SeasonEndSheet({ city2, onPlace }: { city2: City2State | undefined; onPlace?: () => void }) {
  const h = city2?.season?.history[0] ?? null;
  const ready = Boolean(h && h.tier && !h.pending && h.badge);
  const id = h?.id ?? 0;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!ready || !id) return undefined;
    let alive = true;
    AsyncStorage.getItem(seenKey(id))
      .then((v) => alive && setShow(!v))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ready, id]);
  if (!h || !ready) return null;
  const close = () => {
    setShow(false);
    void AsyncStorage.setItem(seenKey(h.id), "1").catch(() => undefined);
  };
  const cup = city2?.landmarks.owned.find((l) => l.key.startsWith("sezon_kupasi") && l.id.endsWith(`-s${h.id}`)) ?? null;
  return (
    <BottomSheet
      visible={show}
      onClose={close}
      title={`${h.title} bitti`}
      footer={
        <View style={styles.sheetButtons}>
          {cup && !cup.slot && onPlace ? (
            <Button
              label="Kupayı meydana koy"
              icon="location-outline"
              onPress={() => {
                close();
                onPlace();
              }}
              fullWidth
              haptic="success"
            />
          ) : null}
          <Button label="Harika" variant={cup && !cup.slot && onPlace ? "secondary" : "primary"} onPress={close} fullWidth haptic="success" />
        </View>
      }
    >
      <View style={styles.endWrap}>
        <Reveal scaleFrom={0.8}>
          <View style={styles.endHero}>
            <TierMedal tier={h.tier} size={88} />
            <Text style={styles.endTier} {...textScale.dense}>
              {tierTitle(h.tier, h.tier_title)} dilim
            </Text>
            <Text style={styles.endSub} {...textScale.long}>
              {h.name} sezonunu {fmt(h.score)} puanla bitirdin
              {h.rank != null && h.total ? `, ${fmt(h.total)} kişi arasında ${fmt(h.rank)}. oldun.` : "."}
            </Text>
          </View>
        </Reveal>
        <Reveal index={1}>
          <View style={styles.gains}>
            <Text style={styles.over} {...textScale.badge}>
              KAZANDIKLARIN
            </Text>
            <GainRow icon="ribbon" text={h.badge?.title ?? "Sezon rozeti"} tier={h.tier} />
            <GainRow icon="shield" text={h.badge?.frame_title ?? "Arma çerçevesi"} tier={h.tier} />
            <GainRow icon="trophy" text={cup ? `${cup.title} · depona eklendi` : "Sezon kupası"} tier={h.tier} />
          </View>
        </Reveal>
      </View>
    </BottomSheet>
  );
}

function GainRow({ icon, text, tier }: { icon: keyof typeof Ionicons.glyphMap; text: string; tier: string | null }) {
  return (
    <View style={styles.gainRow}>
      <TierMedal tier={tier} size={30} icon={icon} />
      <Text style={styles.gainText} numberOfLines={2} {...textScale.dense}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: colors.textTertiary },
  medal: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 1 },
  starsMore: { ...type.micro, fontFamily: fonts.bold, marginLeft: 2 },
  crestWrap: { alignItems: "center" },
  crestRing: { alignItems: "center", justifyContent: "center" },
  crestInner: { alignItems: "center", justifyContent: "center", backgroundColor: CITY2_UI.panel[1] },
  crestPlain: { backgroundColor: colors.brandDim, borderWidth: hairline, borderColor: colors.brandBorder },
  crestPlainDark: { backgroundColor: CITY2_UI.panelChip },
  crestStars: { marginTop: -space.xs, paddingHorizontal: space.xxs, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: CITY2_UI.panel[1] },

  crestChip: { flexDirection: "row", alignItems: "center", gap: space.xs, height: 26, paddingLeft: space.xxs, paddingRight: space.sm, borderRadius: radius.pill, backgroundColor: colors.overlay },
  crestChipShield: { width: 20, height: 20, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  card: { ...cardStyle, padding: space.md, gap: space.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  cardTitle: { ...type.h3, color: colors.textPrimary },
  cardMeta: { ...type.caption, color: colors.textTertiary, flex: 1 },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: space.sm },
  over: { ...type.overline, color: colors.textTertiary },
  scoreLine: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  score: { ...type.metricSm, color: colors.textPrimary },
  scoreUnit: { ...type.caption, color: colors.textTertiary },
  left: { alignItems: "flex-end" },
  leftValue: { ...type.label, fontFamily: fonts.bold, color: colors.textPrimary },
  leftLabel: { ...type.micro, color: colors.textTertiary },
  badgeChip: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingRight: space.s, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  badgeChipText: { ...type.micro, fontFamily: fonts.bold, color: colors.textSecondary },

  parts: { gap: space.md },
  group: { ...cardStyle, padding: space.md, gap: space.md },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  groupTitle: { ...type.h3, color: colors.textPrimary, flex: 1 },
  groupSum: { ...type.numSmStrong, color: colors.brandAccent },
  part: { gap: space.xxs },
  partHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  partLabel: { ...type.labelSm, color: colors.textPrimary, flex: 1 },
  partFull: { ...type.nano, color: colors.win },
  partPoints: { ...type.numSmStrong, color: colors.textPrimary },
  partBar: { height: 6 },
  partMeta: { ...type.caption, color: colors.textTertiary },

  tiers: { ...cardStyle, padding: space.md, gap: space.md },
  tierRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  tierTitle: { ...type.h4, color: colors.textPrimary },
  tierMeta: { ...type.caption, color: colors.textTertiary },

  history: { ...cardStyle, padding: space.md, gap: space.md },
  historyRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  historyTitle: { ...type.h4, color: colors.textPrimary },
  historyMeta: { ...type.caption, color: colors.textSecondary },
  historyBadge: { ...type.caption, color: colors.textTertiary },

  sheetButtons: { gap: space.sm },
  endWrap: { gap: space.lg, paddingBottom: space.sm },
  endHero: { alignItems: "center", gap: space.sm, paddingTop: space.sm },
  endTier: { ...type.display, color: colors.textPrimary, textAlign: "center" },
  endSub: { ...type.body, color: colors.textSecondary, textAlign: "center" },
  gains: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border },
  gainRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  gainText: { ...type.labelSm, color: colors.textPrimary, flex: 1 },
});
