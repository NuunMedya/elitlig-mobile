/**
 * KULÜP ŞEHRİ 2.0 · FAZ 5 — TAKIM TESİSİ parçaları.
 *
 *   · TeamTile — tesis karosu.
 *   · TeamCityCard — şehir ekranındaki kısa kart (takımı olmayan üyede çizilmez).
 *   · DonateCard — yıldız ve EL bağışı: günlük tavan, kalan hak, puan karşılığı.
 *   · LevelList — 10 seviyenin bedeli ve adı.
 *   · ContributionList — takım içi katkı sıralaması.
 *
 * Bağışlar oyun içidir: yıldız ve Elit Lira, yalnız takımın ortak binasına.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Stepper, Touchable } from "@/components/ui";
import { fmtEl, fmtPct, type City2TeamContribution, type City2TeamFacility, type City2TeamSummary, type City2TeamToday } from "@/lib/puzzle/city2";
import { CITY2_TEAM, CITY_UI } from "@/lib/puzzle/cityPalette";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

import { ElCoin } from "./ElitLira";
import { Bar, cardStyle, fmt } from "./shared";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export function TeamTile({ size = 44, level }: { size?: number; level?: number }) {
  return (
    <View>
      <LinearGradient colors={CITY2_TEAM.tile} start={TOP} end={BOTTOM} style={[styles.tile, { width: size, height: size, borderRadius: size >= 44 ? radius.lg : radius.md }]}>
        <Ionicons name="people" size={Math.round(size * 0.5)} color={CITY_UI.white} />
      </LinearGradient>
      {level != null && level > 0 ? (
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText} {...textScale.badge}>
            {level}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Şehir ekranı: takım tesisi kısa kartı. */
export function TeamCityCard({ team, onPress }: { team: City2TeamSummary; onPress: () => void }) {
  const maxed = team.next_cost == null || team.level >= team.max_level;
  return (
    <Touchable onPress={onPress} feedback="card" style={styles.cityCard} accessibilityRole="button" accessibilityLabel={`Takım tesisi, ${team.name}, ${team.level}. seviye`}>
      <TeamTile size={44} level={team.level} />
      <View style={styles.flex}>
        <Text style={styles.cityTitle} numberOfLines={1} {...textScale.dense}>
          {team.name}
        </Text>
        <Text style={styles.cityMeta} numberOfLines={1} {...textScale.dense}>
          {team.level > 0 ? `${team.level}. seviye · ${team.stage_title ?? "Tesis"}` : "Tesis henüz kurulmadı"}
          {team.el_pct > 0 ? ` · EL +${fmtPct(team.el_pct)}` : ""}
        </Text>
        {!maxed ? <Bar value={team.next_cost ? team.progress / team.next_cost : 0} style={styles.cityBar} /> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Touchable>
  );
}

/* ───────────────────────── Bağış ───────────────────────── */

function AmountRow({
  icon,
  title,
  value,
  onChange,
  max,
  step,
  left,
  cap,
  have,
  unit,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
  step: number;
  left: number;
  cap: number;
  have: number;
  unit: string;
}) {
  const used = cap - left;
  return (
    <View style={styles.amount}>
      <View style={styles.amountHead}>
        {icon}
        <View style={styles.flex}>
          <Text style={styles.amountTitle} {...textScale.dense}>
            {title}
          </Text>
          <Text style={styles.amountMeta} numberOfLines={1} {...textScale.dense}>
            Bugün {fmt(used)}/{fmt(cap)} · kalan {fmt(left)} {unit}
          </Text>
        </View>
        <Stepper value={value} onChange={onChange} min={0} max={Math.max(0, max)} step={step} repeatOnHold size="sm" disabled={max <= 0} accessibilityLabel={`${title} miktarı`} />
      </View>
      <View style={styles.amountFoot}>
        <Bar value={cap ? used / cap : 0} tone="brand" style={styles.amountBar} />
        <Touchable feedback="chip" onPress={() => onChange(value >= max ? 0 : max)} disabled={max <= 0} style={[styles.maxChip, max <= 0 ? styles.off : null]} accessibilityRole="button" accessibilityLabel={value >= max ? "Sıfırla" : `En çok: ${max}`}>
          <Text style={styles.maxChipText} {...textScale.badge}>
            {max <= 0 ? (left <= 0 ? "Doldu" : "Yetersiz") : value >= max ? "Sıfırla" : `En çok ${fmt(max)}`}
          </Text>
        </Touchable>
      </View>
      {have < left ? (
        <Text style={styles.amountShort} {...textScale.dense}>
          Cüzdanında {fmt(have)} {unit} var
        </Text>
      ) : null}
    </View>
  );
}

export function DonateCard({
  team,
  today,
  stars,
  el,
  busy,
  onDonate,
}: {
  team: City2TeamFacility;
  today: City2TeamToday;
  /** Cüzdandaki yıldız ve EL. */
  stars: number;
  el: number;
  busy: boolean;
  onDonate: (body: { stars?: number; el?: number }) => void;
}) {
  const per = team.rates.el_per_point || 10;
  const starMax = Math.max(0, Math.min(today.left.stars, Math.floor(stars)));
  const elMax = Math.max(0, Math.floor(Math.min(today.left.el, el) / per) * per);
  const [s, setS] = useState(0);
  const [e, setE] = useState(0);
  useEffect(() => {
    setS((v) => Math.min(v, starMax));
    setE((v) => Math.min(v, elMax));
  }, [starMax, elMax]);
  const points = s * (team.rates.star_points || 1) + Math.floor(e / per);
  const maxed = team.next_cost == null || team.level >= team.max_level;
  const capped = today.left.stars <= 0 && today.left.el <= 0;
  return (
    <View style={styles.donate}>
      <AmountRow
        icon={
          <View style={styles.starIcon}>
            <Ionicons name="star" size={16} color={colors.star} />
          </View>
        }
        title="Yıldız"
        value={s}
        onChange={setS}
        max={starMax}
        step={10}
        left={today.left.stars}
        cap={today.cap.stars}
        have={stars}
        unit="yıldız"
      />
      <View style={styles.rule} />
      <AmountRow icon={<ElCoin size={28} />} title="Elit Lira" value={e} onChange={setE} max={elMax} step={100} left={today.left.el} cap={today.cap.el} have={el} unit="EL" />
      <Text style={styles.rate} {...textScale.dense}>
        1 yıldız = {team.rates.star_points} puan · {per} EL = 1 puan
      </Text>
      <Button
        label={maxed ? "Tesis en üst seviyede" : capped ? "Bugünlük bağış hakkın doldu" : points > 0 ? `Bağışla · +${fmt(points)} puan` : "Miktar seç"}
        icon="heart-outline"
        onPress={() => {
          onDonate({ ...(s > 0 ? { stars: s } : {}), ...(e > 0 ? { el: e } : {}) });
          setS(0);
          setE(0);
        }}
        disabled={maxed || points <= 0}
        loading={busy}
        fullWidth
        haptic="success"
      />
    </View>
  );
}

/* ───────────────────────── Seviyeler ───────────────────────── */

export function LevelList({ team }: { team: City2TeamFacility }) {
  // Seviye başına bonus sunucunun bugünkü / sonraki oranından okunur.
  const perLevel = team.level > 0 ? team.el_pct / team.level : team.next_el_pct ?? 0;
  return (
    <View style={styles.levels}>
      {team.costs.map((c) => {
        const done = c.level <= team.level;
        const next = c.level === team.level + 1;
        return (
          <View key={c.level} style={[styles.levelRow, next ? styles.levelNext : null]}>
            <View style={[styles.levelNo, done ? styles.levelNoDone : next ? styles.levelNoNext : null]}>
              {done ? (
                <Ionicons name="checkmark" size={14} color={CITY_UI.white} />
              ) : (
                <Text style={[styles.levelNoText, next ? styles.levelNoTextNext : null]} {...textScale.badge}>
                  {c.level}
                </Text>
              )}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.levelTitle, !done && !next ? styles.muted : null]} numberOfLines={1} {...textScale.dense}>
                {c.title}
              </Text>
              <Text style={styles.levelMeta} numberOfLines={1} {...textScale.dense}>
                {perLevel > 0 ? `üyelere EL +${fmtPct(perLevel * c.level)}` : c.title}
                {c.level === team.landmark.level ? " · takım sembol yapısı" : ""}
              </Text>
            </View>
            <Text style={[styles.levelCost, done ? styles.muted : null]} {...textScale.badge}>
              {next ? `${fmt(team.progress)}/${fmt(c.cost)}` : `${fmt(c.cost)} puan`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ───────────────────────── Katkı ───────────────────────── */

export function ContributionList({ top, me }: { top: City2TeamContribution[]; me: { rank: number | null; points: number; stars: number; el: number } | null }) {
  const meShown = top.some((r) => r.me);
  return (
    <View style={styles.contrib}>
      {top.map((r) => (
        <ContributionRow key={r.user_id} r={r} />
      ))}
      {!meShown && me ? <ContributionRow r={{ rank: me.rank ?? 0, user_id: -1, name: "Sen", points: me.points, stars: me.stars, el: me.el, last_at: null, me: true }} /> : null}
    </View>
  );
}

function ContributionRow({ r }: { r: City2TeamContribution }) {
  return (
    <View style={[styles.contribRow, r.me ? styles.contribMe : null]}>
      <Text style={styles.contribRank} {...textScale.badge}>
        {r.rank > 0 ? r.rank : "—"}
      </Text>
      <Avatar name={r.name} size={32} ring={r.me ? "brand" : "none"} />
      <View style={styles.flex}>
        <Text style={styles.contribName} numberOfLines={1} {...textScale.dense}>
          {r.me && r.user_id !== -1 ? `${r.name} (sen)` : r.name}
        </Text>
        <Text style={styles.contribMeta} numberOfLines={1} {...textScale.dense}>
          {fmt(r.stars)} yıldız · {fmtEl(r.el)} EL
        </Text>
      </View>
      <Text style={styles.contribPoints} {...textScale.badge}>
        {fmt(r.points)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: colors.textTertiary },
  off: { opacity: 0.5 },
  tile: { alignItems: "center", justifyContent: "center" },
  levelBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: space.xxs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CITY_UI.ink,
    borderWidth: 1.5,
    borderColor: colors.surface1,
  },
  levelBadgeText: { ...type.micro, fontFamily: fonts.bold, color: CITY_UI.white },

  cityCard: { ...cardStyle, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  cityTitle: { ...type.h3, color: colors.textPrimary },
  cityMeta: { ...type.caption, color: colors.textTertiary },
  cityBar: { marginTop: space.xs, height: 6 },

  donate: { ...cardStyle, padding: space.md, gap: space.md },
  amount: { gap: space.sm },
  amountHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  amountTitle: { ...type.h4, color: colors.textPrimary },
  amountMeta: { ...type.caption, color: colors.textTertiary },
  amountFoot: { flexDirection: "row", alignItems: "center", gap: space.sm },
  amountBar: { flex: 1, height: 6 },
  amountShort: { ...type.caption, color: colors.warn },
  maxChip: { paddingHorizontal: space.sm, height: 26, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface2 },
  maxChipText: { ...type.labelXs, color: colors.textSecondary },
  starIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.warnDim },
  rule: { height: hairline, backgroundColor: colors.separator },
  rate: { ...type.caption, color: colors.textTertiary, textAlign: "center" },

  levels: { ...cardStyle, paddingVertical: space.xs, paddingHorizontal: space.sm },
  levelRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.s, paddingHorizontal: space.xs, borderRadius: radius.md },
  levelNext: { backgroundColor: colors.brandDim },
  levelNo: { width: 26, height: 26, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  levelNoDone: { backgroundColor: colors.win },
  levelNoNext: { backgroundColor: colors.brandAccent },
  levelNoText: { ...type.micro, fontFamily: fonts.bold, color: colors.textTertiary },
  levelNoTextNext: { color: colors.textOnBrand },
  levelTitle: { ...type.labelSm, color: colors.textPrimary },
  levelMeta: { ...type.caption, color: colors.textTertiary },
  levelCost: { ...type.numSmStrong, color: colors.textPrimary },

  contrib: { ...cardStyle, padding: space.sm, gap: space.xxs },
  contribRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.s, paddingHorizontal: space.sm, borderRadius: radius.md },
  contribMe: { backgroundColor: colors.brandDim },
  contribRank: { ...type.numSmStrong, color: colors.textTertiary, width: 22, textAlign: "center" },
  contribName: { ...type.labelSm, color: colors.textPrimary },
  contribMeta: { ...type.caption, color: colors.textTertiary },
  contribPoints: { ...type.numSmStrong, color: colors.textPrimary },
});
