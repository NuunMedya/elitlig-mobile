/**
 * KULÜP ŞEHRİ 2.1 — ana ekranın parçaları.
 *
 *   · CityHud: ekranın üstünde SABİT şerit. Solda yıldız, sağda Elit Lira
 *     cüzdanı, altında lig ilerlemesi (şu anki lig → sıradaki lig, koşulların
 *     kaçı tamam). Lig satırına dokununca LeagueSheet açılır.
 *   · LeagueSheet: sıradaki ligin koşulları (gelişim puanı, bina aşamaları,
 *     gerçek hayat kilidi) ve "Lige yüksel".
 *   · BuildingGrid: binalar iki sütunlu kartlarda. Sıradaki lig için gereken
 *     binalar başta ve "Lig için N. aşama" etiketiyle durur; ana yükseltme ve
 *     ara adım ilerlemesi, bakım durumu ve toplanacak EL tek bakışta görünür.
 *   · ClubTiles: şehrin diğer bölümlerine kısa yollar (akademi, sezon, takım,
 *     ziyaret, sembol yapılar, sıralama, günlük ödül, merdiven, renkler).
 *
 * Akış (ekranda ve "Nasıl ilerlerim?" kartında anlatılır):
 *   yıldızla ara adımları aç → ana yükseltmeyi yap (yıldız + EL + lig) →
 *   gelişim puanı ve bina aşamaları dolunca → lige yüksel.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { ChunkyButton } from "@/components/city/ChunkyButton";
import { BottomSheet, Touchable } from "@/components/ui";
import { fmtEl, incomeOf, leagueNeedOf, rungOpensText, type City2Building, type City2El, type City2Ladder } from "@/lib/puzzle/city2";
import { CITY2_EL, CITY2_UI } from "@/lib/puzzle/cityPalette";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

import { ElCoin } from "./ElitLira";
import { NextRequirements, RungBadge } from "./StepCard";
import { Bar, BuildingIcon, cardStyle, fmt } from "./shared";

type IconName = keyof typeof Ionicons.glyphMap;

/* ═════════════════════════ ÜST ŞERİT ═════════════════════════ */

function requirementCount(ladder: City2Ladder) {
  const next = ladder.next;
  if (!next) return { done: 0, total: 0 };
  const reqs = [next.dev.ok, ...next.stages.map((s) => s.ok), ...(next.gate ? [next.gate.ok] : [])];
  return { done: reqs.filter(Boolean).length, total: reqs.length };
}

export function CityHud({
  ladder,
  stars,
  el,
  onBack,
  onStars,
  onEl,
  onLeague,
}: {
  ladder: City2Ladder | null;
  stars: number | null;
  el: City2El | null;
  onBack: () => void;
  onStars: () => void;
  onEl: () => void;
  onLeague: () => void;
}) {
  const next = ladder?.next ?? null;
  const { done, total } = ladder ? requirementCount(ladder) : { done: 0, total: 0 };
  const devPct = next ? Math.min(1, next.dev.have / Math.max(1, next.dev.need)) : 1;
  const collectable = el?.collectable ?? 0;
  const careLow = el?.care?.low ?? 0;
  return (
    <LinearGradient colors={CITY2_UI.panel} style={styles.hud}>
      <View style={styles.hudTop}>
        <Touchable onPress={onBack} feedback="icon" hitSlop={8} style={styles.back} accessibilityRole="button" accessibilityLabel="Geri">
          <Ionicons name="chevron-back" size={22} color={colors.onDark} />
        </Touchable>
        <Touchable onPress={onStars} feedback="chip" style={styles.wallet} accessibilityRole="button" accessibilityLabel={`${fmt(stars ?? 0)} yıldız. Yıldız cüzdanını aç`}>
          <Ionicons name="star" size={16} color={CITY2_UI.star} />
          <Text style={styles.walletValue} {...textScale.badge}>
            {stars == null ? "—" : fmt(stars)}
          </Text>
          <Ionicons name="add-circle" size={16} color={CITY2_UI.panelMuted} />
        </Touchable>
        <View style={styles.flex} />
        {el ? (
          <Touchable onPress={onEl} feedback="chip" style={styles.wallet} accessibilityRole="button" accessibilityLabel={`${fmtEl(el.balance)} Elit Lira. Kasayı aç`}>
            <ElCoin size={18} />
            <Text style={styles.walletValue} {...textScale.badge}>
              {fmtEl(el.balance)}
            </Text>
            {collectable > 0 || careLow > 0 ? <View style={[styles.dot, careLow > 0 ? styles.dotWarn : null]} /> : null}
          </Touchable>
        ) : null}
      </View>

      {ladder ? (
        <Touchable onPress={onLeague} feedback="row" style={styles.league} accessibilityRole="button" accessibilityLabel={`Lig ${ladder.current.label}: ${ladder.current.title}. ${next ? `Sıradaki lig ${next.title}, ${done}/${total} koşul tamam` : "Zirvedesin"}`}>
          <RungBadge label={ladder.current.label} size={34} />
          <View style={styles.leagueTexts}>
            <View style={styles.leagueLine}>
              <Text style={styles.leagueNow} numberOfLines={1} {...textScale.dense}>
                {ladder.current.title}
              </Text>
              {next ? (
                <>
                  <Ionicons name="arrow-forward" size={13} color={CITY2_UI.panelMuted} />
                  <Text style={styles.leagueNext} numberOfLines={1} {...textScale.dense}>
                    {next.title}
                  </Text>
                </>
              ) : null}
            </View>
            {next ? (
              <View style={styles.leagueTrack}>
                <View style={[styles.leagueFill, { width: `${Math.round(devPct * 100)}%` as const }, next.can_advance ? styles.leagueFillReady : null]} />
              </View>
            ) : null}
          </View>
          {next ? (
            next.can_advance ? (
              <View style={styles.ready}>
                <Ionicons name="arrow-up-circle" size={14} color={colors.onDark} />
                <Text style={styles.readyText} {...textScale.badge}>
                  YÜKSEL
                </Text>
              </View>
            ) : (
              <Text style={styles.leagueCount} {...textScale.badge}>
                {done}/{total}
              </Text>
            )
          ) : (
            <Ionicons name="trophy" size={18} color={CITY2_UI.star} />
          )}
          <Ionicons name="chevron-down" size={16} color={CITY2_UI.panelMuted} />
        </Touchable>
      ) : null}
    </LinearGradient>
  );
}

/* ═════════════════════════ LİG PENCERESİ ═════════════════════════ */

export function LeagueSheet({
  visible,
  onClose,
  ladder,
  buildings,
  busy,
  onAdvance,
  onBuilding,
  onLadder,
}: {
  visible: boolean;
  onClose: () => void;
  ladder: City2Ladder | null;
  buildings: City2Building[];
  busy: boolean;
  onAdvance: (pay?: boolean) => void;
  onBuilding: (key: string) => void;
  onLadder: () => void;
}) {
  const next = ladder?.next ?? null;
  const footer = next?.can_advance ? (
    <ChunkyButton label={busy ? "YÜKSELİYOR…" : `LİGE YÜKSEL · ${next.title}`} icon="arrow-up-circle" tone="green" disabled={busy} onPress={() => onAdvance()} accessibilityLabel={`Lige yüksel: ${next.title}`} />
  ) : null;
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Lig ilerlemesi" snap="full" footer={footer}>
      {ladder ? (
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <RungBadge label={ladder.current.label} />
            <View style={styles.flex}>
              <Text style={styles.over} {...textScale.badge}>
                ŞU ANKİ LİG · {ladder.current.label}/{ladder.steps[ladder.steps.length - 1]?.label ?? ladder.max_rung}
              </Text>
              <Text style={styles.sheetTitle} {...textScale.dense}>
                {ladder.current.title}
              </Text>
            </View>
          </View>
          <HowItWorks />
          {next ? (
            <View style={styles.reqCard}>
              <Text style={styles.reqHead} {...textScale.dense}>
                {next.title} için gerekenler
              </Text>
              <NextRequirements next={next} buildings={buildings} onBuilding={onBuilding} busy={busy} onPay={() => onAdvance(true)} />
            </View>
          ) : (
            <Text style={styles.lead} {...textScale.long}>
              Zirvedesin: Şampiyonlar Ligi şampiyonu. Prestij ve sembol yapılarla şehrini büyütmeye devam et.
            </Text>
          )}
          <Touchable onPress={onLadder} feedback="row" style={styles.linkRow} accessibilityRole="button" accessibilityLabel="Bütün ligleri gör">
            <Ionicons name="trending-up-outline" size={18} color={colors.brandAccent} />
            <Text style={styles.linkText} {...textScale.dense}>
              Bütün ligler ve geçmiş
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Touchable>
        </View>
      ) : null}
    </BottomSheet>
  );
}

/** Üç adımda ilerleme: ara adım → ana yükseltme → lig. */
export function HowItWorks() {
  const steps: { icon: IconName; title: string; text: string }[] = [
    { icon: "construct-outline", title: "Ara adımlar", text: "Binanın içine eşya ve oda ekle. Yalnız yıldız ister, ucuzdur." },
    { icon: "business-outline", title: "Ana yükseltme", text: "Ara adımlar bitince bina büyür. Daha çok yıldız, Elit Lira ve lig şartı ister." },
    { icon: "trophy-outline", title: "Lige yüksel", text: "Gelişim puanı ve istenen bina aşamaları tamamsa bir üst lige çık." },
  ];
  return (
    <View style={styles.how}>
      {steps.map((s, i) => (
        <View key={s.title} style={styles.howStep}>
          <View style={styles.howIcon}>
            <Ionicons name={s.icon} size={18} color={colors.brandAccent} />
          </View>
          <Text style={styles.howTitle} numberOfLines={1} {...textScale.dense}>
            {s.title}
          </Text>
          <Text style={styles.howText} {...textScale.long}>
            {s.text}
          </Text>
          {i < steps.length - 1 ? <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={styles.howArrow} /> : null}
        </View>
      ))}
    </View>
  );
}

/* ═════════════════════════ BİNA IZGARASI ═════════════════════════ */

function Tag({ icon, text, tone }: { icon: IconName; text: string; tone: "brand" | "warn" | "el" | "muted" | "go" }) {
  const tint = tone === "brand" ? colors.brandAccent : tone === "warn" ? colors.warn : tone === "el" ? CITY2_EL.ink : tone === "go" ? colors.win : colors.textTertiary;
  return (
    <View style={[styles.tag, { borderColor: tint }]}>
      <Ionicons name={icon} size={11} color={tint} />
      <Text style={[styles.tagText, { color: tint }]} numberOfLines={1} {...textScale.badge}>
        {text}
      </Text>
    </View>
  );
}

function BuildingTile({ b, ladder, available, onPress }: { b: City2Building; ladder: City2Ladder; available: number; onPress: () => void }) {
  const inc = incomeOf(b);
  const need = leagueNeedOf(ladder, b.key);
  const a = b.next_action;
  const ready = (a.kind === "lock" || (a.kind === "stage" && !a.blocked)) && available >= a.cost;
  const pips = b.locks_total || 0;
  const tags: { icon: IconName; text: string; tone: "brand" | "warn" | "el" | "muted" | "go" }[] = [];
  if (!b.open) tags.push({ icon: "lock-closed", text: rungOpensText(ladder, b.opens), tone: "muted" });
  else {
    if (need && !need.ok) tags.push({ icon: "trophy", text: `Lig için ${need.need}. aşama`, tone: "brand" });
    if (inc?.care?.low) tags.push({ icon: "build", text: `Bakım %${inc.care.pct}`, tone: "warn" });
    if (inc && inc.collectable > 0) tags.push({ icon: "arrow-down-circle", text: `${fmtEl(inc.collectable)} EL`, tone: "el" });
    if (a.kind === "maxed") tags.push({ icon: "checkmark-circle", text: "Tamamlandı", tone: "go" });
  }
  return (
    <Touchable onPress={onPress} feedback="card" haptic="selection" style={[styles.tile, !b.open ? styles.tileOff : null, need && !need.ok ? styles.tileNeed : null]} accessibilityRole="button" accessibilityLabel={`${b.title}. ${b.current?.title ?? "Kurulmadı"}. ${tags.map((t) => t.text).join(", ")}`}>
      <View style={styles.tileHead}>
        <BuildingIcon buildingKey={b.key} icon={b.icon} size={40} off={!b.open} stage={b.stage} />
        {ready ? (
          <View style={styles.readyDot} accessibilityElementsHidden>
            <Ionicons name="arrow-up" size={11} color={colors.onDark} />
          </View>
        ) : null}
      </View>
      <Text style={styles.tileTitle} numberOfLines={1} {...textScale.dense}>
        {b.title}
      </Text>
      <Text style={styles.tileSub} numberOfLines={1} {...textScale.dense}>
        {b.open ? (b.current?.title ?? "Henüz kurulmadı") : "Kapalı"}
      </Text>
      {b.open ? (
        <View style={styles.tileProgress}>
          <Text style={styles.tileMeta} {...textScale.badge}>
            Ana {b.stage}/{b.max}
          </Text>
          {pips ? (
            <View style={styles.pips}>
              {Array.from({ length: pips }).map((_, i) => (
                <View key={i} style={[styles.pip, i < b.locks_done ? styles.pipOn : null]} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {inc?.care && b.open ? <Bar value={inc.care.pct / 100} tone={inc.care.low ? "brand" : "go"} style={styles.careBar} /> : null}
      {tags.length ? <View style={styles.tags}>{tags.slice(0, 2).map((t) => <Tag key={t.text} {...t} />)}</View> : null}
    </Touchable>
  );
}

export function BuildingGrid({ buildings, ladder, available, onOpen }: { buildings: City2Building[]; ladder: City2Ladder; available: number; onOpen: (key: string) => void }) {
  // Sıra: sıradaki lig için eksik olanlar → diğer açık binalar → kapalılar.
  const rank = (b: City2Building) => {
    const need = leagueNeedOf(ladder, b.key);
    if (!b.open) return 3;
    if (need && !need.ok) return 0;
    return 1;
  };
  const sorted = [...buildings].sort((x, y) => rank(x) - rank(y) || x.opens - y.opens);
  return (
    <View style={styles.grid}>
      {sorted.map((b) => (
        <BuildingTile key={b.key} b={b} ladder={ladder} available={available} onPress={() => onOpen(b.key)} />
      ))}
    </View>
  );
}

/* ═════════════════════════ KISA YOLLAR ═════════════════════════ */

export interface ClubTile {
  key: string;
  icon: IconName;
  title: string;
  meta?: string | null;
  badge?: string | null;
  onPress: () => void;
}

export function ClubTiles({ tiles }: { tiles: ClubTile[] }) {
  return (
    <View style={styles.tiles}>
      {tiles.map((t) => (
        <Touchable key={t.key} onPress={t.onPress} feedback="card" style={styles.club} accessibilityRole="button" accessibilityLabel={[t.title, t.meta, t.badge].filter(Boolean).join(", ")}>
          <View style={styles.clubIcon}>
            <Ionicons name={t.icon} size={20} color={colors.brandAccent} />
            {t.badge ? (
              <View style={styles.clubBadge}>
                <Text style={styles.clubBadgeText} {...textScale.badge}>
                  {t.badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.clubTitle} numberOfLines={1} {...textScale.dense}>
            {t.title}
          </Text>
          {t.meta ? (
            <Text style={styles.clubMeta} numberOfLines={1} {...textScale.dense}>
              {t.meta}
            </Text>
          ) : null}
        </Touchable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hud: { paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.sm, gap: space.sm, borderBottomWidth: hairline, borderBottomColor: CITY2_UI.panelEdge },
  hudTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center", marginLeft: -space.xs },
  wallet: { flexDirection: "row", alignItems: "center", gap: space.xs, height: 34, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: CITY2_UI.panelChip, borderWidth: hairline, borderColor: CITY2_UI.panelEdge },
  walletValue: { ...type.numSmStrong, color: colors.onDark },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CITY2_EL.gain },
  dotWarn: { backgroundColor: CITY2_EL.full },
  league: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.lg, backgroundColor: CITY2_UI.panelChip },
  leagueTexts: { flex: 1, gap: 6 },
  leagueLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  leagueNow: { ...type.labelSm, fontFamily: fonts.bold, color: colors.onDark, flexShrink: 1 },
  leagueNext: { ...type.labelSm, color: CITY2_UI.panelMuted, flexShrink: 1 },
  leagueTrack: { height: 6, borderRadius: radius.pill, backgroundColor: CITY2_EL.track, overflow: "hidden" },
  leagueFill: { height: 6, borderRadius: radius.pill, backgroundColor: CITY2_UI.star },
  leagueFillReady: { backgroundColor: CITY2_EL.gain },
  leagueCount: { ...type.numSmStrong, color: colors.onDark },
  ready: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: space.sm, height: 24, borderRadius: radius.pill, backgroundColor: CITY2_UI.go },
  readyText: { ...type.micro, fontFamily: fonts.bold, color: colors.onDark },

  sheet: { gap: space.lg, paddingBottom: space.lg },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  over: { ...type.overline, color: colors.textTertiary },
  sheetTitle: { ...type.h1, color: colors.textPrimary },
  lead: { ...type.body, color: colors.textSecondary },
  reqCard: { ...cardStyle, padding: space.md, gap: space.sm },
  reqHead: { ...type.h3, color: colors.textPrimary },
  linkRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44, paddingHorizontal: space.xs, borderRadius: radius.md },
  linkText: { ...type.label, color: colors.textPrimary, flex: 1 },

  how: { flexDirection: "row", gap: space.sm },
  howStep: { flex: 1, gap: 4, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  howIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  howTitle: { ...type.labelSm, fontFamily: fonts.bold, color: colors.textPrimary },
  howText: { ...type.caption, color: colors.textSecondary },
  howArrow: { position: "absolute", right: -11, top: 22 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: { ...cardStyle, width: "48.5%", padding: space.md, gap: 4 },
  tileOff: { backgroundColor: colors.surface2 },
  tileNeed: { borderColor: colors.brandAccent, borderWidth: 1.5 },
  tileHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 2 },
  readyDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: CITY2_UI.go },
  tileTitle: { ...type.labelSm, fontFamily: fonts.bold, color: colors.textPrimary },
  tileSub: { ...type.caption, color: colors.textSecondary },
  tileProgress: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 2 },
  tileMeta: { ...type.micro, fontFamily: fonts.bold, color: colors.textSecondary },
  pips: { flexDirection: "row", gap: 3, flex: 1 },
  pip: { flex: 1, maxWidth: 14, height: 5, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  pipOn: { backgroundColor: colors.win },
  careBar: { height: 4, marginTop: 2 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  tag: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, height: 20, borderRadius: radius.pill, borderWidth: hairline, maxWidth: "100%" },
  tagText: { ...type.micro, fontFamily: fonts.bold, flexShrink: 1 },

  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  club: { ...cardStyle, width: "31.5%", padding: space.sm, gap: 4, alignItems: "flex-start", minHeight: 88 },
  clubIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  clubBadge: { position: "absolute", top: -6, right: -10, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.live },
  clubBadgeText: { ...type.micro, fontFamily: fonts.bold, color: colors.onDark },
  clubTitle: { ...type.labelSm, fontFamily: fonts.bold, color: colors.textPrimary },
  clubMeta: { ...type.caption, color: colors.textTertiary },
});
