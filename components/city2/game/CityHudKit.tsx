/**
 * TAM EKRAN ŞEHRİN HUD'U — sahnenin üstünde yüzen oyun parçaları.
 *
 *   · CityTopBar    geri · ★ yıldız (+) · EL kasası (nokta) · jeton (+) · ayarlar
 *   · LeagueRibbon  şu anki lig → sıradaki lig, gelişim çubuğu, koşul sayısı ya
 *                   da parlayan "YÜKSEL"; dokununca lig penceresi
 *   · CityDock      alttaki tahta raf: yan karolar + ortada büyük bağlam düğmesi
 *   · BuildingStrip "Binalar" rafı: yatay bina kartları (seviye, rozet, kilit)
 *   · PlaceBar      sembol yapı yerleştirirken alttaki şerit
 *   · VisitTopBar   ZİYARET (başka üyenin şehri, salt okunur): geri · sahibin
 *                   arması, adı, il/takım · bütün şehri göster; altında lig
 *                   şeridi ve güzellik / gelişim / alkış hapları
 *
 * Renkler oyun dünyasınındır: lib/puzzle/cityGamePalette.ts (+ GameHome paleti).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import { GH } from "@/lib/game/gameHomePalette";
import { buildingMark, fmtEl, type City2Building, type City2Ladder } from "@/lib/puzzle/city2";
import { CG, type CityBtnTone } from "@/lib/puzzle/cityGamePalette";
import { fonts, layout, radius, space, textScale, touchSlop, type } from "@/theme";

import { ElCoin } from "../ElCoin";
import { BuildingIcon } from "../shared";
import { BOTTOM, GameBar, GlossyButton, TOP, fmt } from "./CityGameKit";

type IconName = keyof typeof Ionicons.glyphMap;
const shadowText = { textShadowColor: CG.inkShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 };
const fmtShort = (n: number) => (n >= 100_000 ? `${Math.floor(n / 1000)}B` : fmt(n));
/** Jeton hapı "+" da taşır: 10.000 ve üstü kısaltılır ("12,5B") ki dar telefonda kesilmesin. */
const fmtCoins = (n: number) => (n >= 10_000 ? `${(Math.floor(n / 100) / 10).toLocaleString("tr-TR")}B` : fmt(n));

/* ═══════════════════════ ÜST ŞERİT ═══════════════════════ */

function Pill({ icon, coin, value, label, onPress, plus, dot, wide }: { icon?: { name: IconName; tint: string }; coin?: boolean; value: string; label: string; onPress?: () => void; plus?: boolean; dot?: "warn" | "go" | null; wide?: boolean }) {
  return (
    <Touchable onPress={onPress} disabled={!onPress} haptic="selection" style={[styles.pill, wide ? styles.pillWide : null]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.pillIcon}>{coin ? <ElCoin size={24} /> : icon ? <Ionicons name={icon.name} size={24} color={icon.tint} /> : null}</View>
      <Text style={styles.pillValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
        {value}
      </Text>
      {plus && onPress ? (
        <LinearGradient colors={GH.pillPlus} start={TOP} end={BOTTOM} style={styles.plus}>
          <Ionicons name="add" size={14} color={GH.white} />
        </LinearGradient>
      ) : null}
      {dot ? <View style={[styles.pillDot, dot === "warn" ? styles.pillDotWarn : null]} /> : null}
    </Touchable>
  );
}

export const CityTopBar = React.memo(function CityTopBar({
  onBack,
  stars,
  onStars,
  el,
  elDot,
  onEl,
  coins,
  onCoins,
  onSettings,
}: {
  onBack: () => void;
  stars: number | null;
  onStars: () => void;
  /** null: eski sunucu (EL yok) → hap çizilmez. */
  el: number | null;
  elDot: "warn" | "go" | null;
  onEl: () => void;
  coins: number | null;
  onCoins: () => void;
  onSettings: () => void;
}) {
  return (
    <View style={styles.topRow}>
      <Touchable onPress={onBack} hitSlop={touchSlop(42)} accessibilityRole="button" accessibilityLabel="Şehirden çık" style={styles.roundSm} haptic="light">
        <Ionicons name="chevron-back" size={22} color={GH.white} />
      </Touchable>
      <View style={styles.pills}>
        <Pill icon={{ name: "star", tint: GH.star }} value={stars != null ? fmtShort(stars) : "–"} label={`${stars ?? 0} yıldız. Yıldız cüzdanını aç`} onPress={onStars} plus wide />
        {el != null ? <Pill coin value={fmtEl(el)} label={`${fmtEl(el)} Elit Lira. Kasayı aç`} onPress={onEl} dot={elDot} /> : null}
        <Pill icon={{ name: "disc", tint: GH.coin }} value={coins != null ? fmtCoins(coins) : "–"} label={`${coins ?? 0} jeton. Jeton mağazasını aç`} onPress={onCoins} plus wide />
      </View>
      <Touchable onPress={onSettings} hitSlop={touchSlop(42)} accessibilityRole="button" accessibilityLabel="Şehir ayarları" style={styles.roundSm} haptic="light">
        <Ionicons name="settings-sharp" size={20} color={GH.white} />
      </Touchable>
    </View>
  );
});

/* ═══════════════════════ LİG KURDELESİ ═══════════════════════ */

function requirementCount(ladder: City2Ladder) {
  const next = ladder.next;
  if (!next) return { done: 0, total: 0 };
  const reqs = [next.dev.ok, ...next.stages.map((s) => s.ok), ...(next.gate ? [next.gate.ok] : [])];
  return { done: reqs.filter(Boolean).length, total: reqs.length };
}

export const LeagueRibbon = React.memo(function LeagueRibbon({ ladder, onPress, onHome }: { ladder: City2Ladder; onPress: () => void; onHome: () => void }) {
  const next = ladder.next;
  const { done, total } = requirementCount(ladder);
  const devPct = next ? Math.min(1, next.dev.have / Math.max(1, next.dev.need)) : 1;
  return (
    <View style={styles.leagueRow}>
      <Touchable
        onPress={onPress}
        haptic="selection"
        style={styles.league}
        accessibilityRole="button"
        accessibilityLabel={`Lig ${ladder.current.label}: ${ladder.current.title}. ${next ? (next.can_advance ? `${next.title} ligine yükselmeye hazırsın` : `Sıradaki lig ${next.title}, ${done}/${total} koşul tamam`) : "Zirvedesin"}`}
      >
        <LinearGradient colors={CG.league} start={TOP} end={BOTTOM} style={styles.leagueFill}>
          <LinearGradient colors={CG.rivet} start={TOP} end={BOTTOM} style={styles.shield}>
            <Text style={styles.shieldText} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
              {ladder.current.label}
            </Text>
          </LinearGradient>
          <View style={styles.leagueTexts}>
            <Text style={styles.leagueTitle} numberOfLines={1} {...textScale.badge}>
              {ladder.current.title}
              {next ? `  →  ${next.title}` : ""}
            </Text>
            {next ? <GameBar value={devPct} tone={next.can_advance ? "green" : "gold"} height={10} /> : null}
          </View>
          {next ? (
            next.can_advance ? (
              <View style={styles.ready}>
                <Ionicons name="arrow-up-circle" size={14} color={CG.white} />
                <Text style={styles.readyText} {...textScale.badge}>
                  YÜKSEL
                </Text>
              </View>
            ) : (
              <Text style={styles.count} {...textScale.badge}>
                {done}/{total}
              </Text>
            )
          ) : (
            <Ionicons name="trophy" size={18} color={GH.coin} />
          )}
        </LinearGradient>
      </Touchable>
      <Touchable onPress={onHome} hitSlop={touchSlop(38)} haptic="light" accessibilityRole="button" accessibilityLabel="Bütün şehri göster" style={styles.homeBtn}>
        <Ionicons name="scan" size={18} color={GH.white} />
      </Touchable>
    </View>
  );
});

/* ═══════════════════════ ZİYARET HUD'U ═══════════════════════ */

export const VisitTopBar = React.memo(function VisitTopBar({
  onBack,
  onHome,
  onInfo,
  name,
  sub,
  crest,
  prestige,
  league,
  stats,
}: {
  onBack: () => void;
  onHome: () => void;
  onInfo: () => void;
  name: string;
  sub: string;
  /** Sahibin arması (sezon çerçevesi + prestij yıldızları). */
  crest: React.ReactNode;
  prestige: React.ReactNode;
  league: { label: string; title: string; no: number };
  stats: { key: string; icon: IconName; tint: string; value: string; label: string }[];
}) {
  return (
    <View style={styles.visitWrap}>
      <View style={styles.topRow}>
        <Touchable onPress={onBack} hitSlop={touchSlop(42)} accessibilityRole="button" accessibilityLabel="Ziyaretten çık" style={styles.roundSm} haptic="light">
          <Ionicons name="chevron-back" size={22} color={GH.white} />
        </Touchable>
        <Touchable onPress={onInfo} haptic="selection" style={styles.flex} accessibilityRole="button" accessibilityLabel={`${name}, ${sub}. Şehir bilgisini aç`}>
          <LinearGradient colors={CG.wood} start={TOP} end={BOTTOM} style={styles.plate}>
            {crest}
            <View style={styles.flex}>
              <View style={styles.plateLine}>
                <Text style={styles.plateName} numberOfLines={1} {...textScale.badge}>
                  {name}
                </Text>
                {prestige}
              </View>
              <Text style={styles.plateSub} numberOfLines={1} {...textScale.badge}>
                {sub}
              </Text>
            </View>
            <Ionicons name="information-circle" size={20} color={CG.paper[0]} />
          </LinearGradient>
        </Touchable>
        <Touchable onPress={onHome} hitSlop={touchSlop(42)} haptic="light" accessibilityRole="button" accessibilityLabel="Bütün şehri göster" style={styles.roundSm}>
          <Ionicons name="scan" size={18} color={GH.white} />
        </Touchable>
      </View>
      <View style={styles.leagueRow}>
        <LinearGradient colors={CG.league} start={TOP} end={BOTTOM} style={[styles.leagueFill, styles.visitLeague]} accessibilityLabel={`Lig ${league.label}: ${league.title}`}>
          <LinearGradient colors={CG.rivet} start={TOP} end={BOTTOM} style={styles.shield}>
            <Text style={styles.shieldText} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
              {league.label}
            </Text>
          </LinearGradient>
          <Text style={[styles.leagueTitle, styles.flex]} numberOfLines={1} {...textScale.badge}>
            {league.title}
          </Text>
          <Text style={styles.count} {...textScale.badge}>
            {`LİG ${league.no}`}
          </Text>
        </LinearGradient>
      </View>
      <View style={styles.pills}>
        {stats.map((st) => (
          <Pill key={st.key} icon={{ name: st.icon, tint: st.tint }} value={st.value} label={`${st.value} ${st.label}`} />
        ))}
      </View>
    </View>
  );
});

/* ═══════════════════════ ALT RAF (DOCK) ═══════════════════════ */

export interface DockTile {
  key: string;
  icon: IconName;
  label: string;
  tone: CityBtnTone;
  onPress: () => void;
  badge?: string | number | null;
  on?: boolean;
}

function Tile({ t }: { t: DockTile }) {
  const tone = CG.btn[t.tone];
  return (
    <Touchable onPress={t.onPress} haptic="selection" style={styles.tile} accessibilityRole="button" accessibilityState={{ selected: Boolean(t.on) }} accessibilityLabel={t.badge ? `${t.label}, ${t.badge}` : t.label}>
      <View style={[styles.tileLip, { backgroundColor: tone.lip }]} />
      <LinearGradient colors={tone.fill} start={TOP} end={BOTTOM} style={[styles.tileFill, t.on ? styles.tileOn : null]}>
        <View style={styles.tileShine} />
        <Ionicons name={t.icon} size={22} color={tone.ink} />
      </LinearGradient>
      {t.badge ? (
        <View style={styles.tileBadge}>
          <Text style={styles.tileBadgeText} {...textScale.badge}>
            {t.badge}
          </Text>
        </View>
      ) : null}
      <Text style={styles.tileLabel} numberOfLines={1} {...textScale.badge}>
        {t.label}
      </Text>
    </Touchable>
  );
}

export function CityDock({
  left,
  right,
  main,
  bottomInset,
}: {
  left: DockTile[];
  right: DockTile[];
  main: { label: string; sub?: string | null; icon: IconName; tone: CityBtnTone; onPress: () => void; busy?: boolean; disabled?: boolean; stars?: number | null; el?: number | null; accessibilityLabel?: string };
  bottomInset: number;
}) {
  return (
    <View style={[styles.dock, { paddingBottom: bottomInset + space.sm }]}>
      <LinearGradient colors={CG.dock} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.dockShelf]} />
      <View style={styles.dockRow}>
        <View style={styles.dockSide}>
          {left.map((t) => (
            <Tile key={t.key} t={t} />
          ))}
        </View>
        <View style={styles.dockMain}>
          <GlossyButton label={main.label} sub={main.sub} icon={main.icon} tone={main.tone} onPress={main.onPress} busy={main.busy} disabled={main.disabled} stars={main.stars} el={main.el} accessibilityLabel={main.accessibilityLabel} />
        </View>
        <View style={styles.dockSide}>
          {right.map((t) => (
            <Tile key={t.key} t={t} />
          ))}
        </View>
      </View>
    </View>
  );
}

/* ═══════════════════════ BİNA RAFI ═══════════════════════ */

const MARK_ICON = { up: "arrow-up-circle", lock: "star-outline", max: "trophy", closed: "lock-closed" } as const;

export function BuildingStrip({ buildings, available, needs, onOpen }: { buildings: City2Building[]; available: number; needs: Set<string>; onOpen: (key: string) => void }) {
  // Sıra: önce lig için gereken, sonra yükseltmeye hazır, sonra açık, en son kilitli arsalar.
  const rank = (b: City2Building) => {
    const m = buildingMark(b, available);
    return (needs.has(b.key) ? 0 : 4) + (m === "up" ? 0 : m === "lock" ? 1 : m === "closed" ? 3 : 2);
  };
  const list = [...buildings].sort((a, b) => rank(a) - rank(b));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {list.map((b) => {
        const m = buildingMark(b, available);
        return (
          <Touchable key={b.key} onPress={() => onOpen(b.key)} haptic="selection" style={styles.card} accessibilityRole="button" accessibilityLabel={`${b.title}, seviye ${b.stage}/${b.max}${m === "up" ? ", yükseltmeye hazır" : m === "closed" ? ", kilitli" : ""}`}>
            <LinearGradient colors={CG.paper} start={TOP} end={BOTTOM} style={styles.cardFill}>
              <BuildingIcon buildingKey={b.key} icon={b.icon} size={40} off={!b.open} />
              <Text style={styles.cardTitle} numberOfLines={1} {...textScale.badge}>
                {b.title}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1} {...textScale.badge}>
                {b.open ? `${b.stage}/${b.max}` : "kilitli"}
              </Text>
            </LinearGradient>
            {m ? (
              <View style={[styles.cardMark, m === "up" ? styles.markUp : m === "max" ? styles.markMax : styles.markOff]}>
                <Ionicons name={MARK_ICON[m]} size={13} color={CG.white} />
              </View>
            ) : null}
            {needs.has(b.key) ? (
              <View style={styles.cardNeed}>
                <Ionicons name="trophy" size={10} color={CG.white} />
                <Text style={styles.cardNeedText} {...textScale.badge}>
                  LİG
                </Text>
              </View>
            ) : null}
          </Touchable>
        );
      })}
    </ScrollView>
  );
}

/* ═══════════════════════ YERLEŞTİRME ŞERİDİ ═══════════════════════ */

export function PlaceBar({ title, onGrid, onCancel, bottomInset }: { title: string; onGrid: () => void; onCancel: () => void; bottomInset: number }) {
  return (
    <View style={[styles.place, { paddingBottom: bottomInset + space.sm }]}>
      <LinearGradient colors={CG.dock} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.dockShelf]} />
      <View style={styles.placeRow}>
        <Ionicons name="location" size={22} color={GH.coin} />
        <Text style={styles.placeText} numberOfLines={2} {...textScale.dense}>
          {title}: meydanda parlayan boş bir yuvaya dokun
        </Text>
      </View>
      <View style={styles.placeBtns}>
        <GlossyButton label="IZGARA" icon="grid" tone="blue" small onPress={onGrid} style={styles.flex} accessibilityLabel="Izgaradan yuva seç" />
        <GlossyButton label="VAZGEÇ" icon="close" tone="red" small onPress={onCancel} style={styles.flex} accessibilityLabel="Yerleştirmeyi bırak" />
      </View>
    </View>
  );
}

/* ═══════════════════════ STİLLER ═══════════════════════ */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  roundSm: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.pill, borderWidth: 2, borderColor: GH.pillEdge },
  pills: { flex: 1, flexDirection: "row", gap: space.xs },
  pill: { flex: 1, minWidth: 0, height: 38, flexDirection: "row", alignItems: "center", gap: 2, paddingRight: space.xxs, borderRadius: radius.pill, backgroundColor: GH.pill, borderWidth: 2, borderColor: GH.pillEdge },
  pillWide: { flex: 1.25 },
  pillIcon: { marginLeft: -6, width: 28, alignItems: "center" },
  pillValue: { ...type.label, fontFamily: fonts.bold, color: GH.white, flex: 1, minWidth: 0, ...shadowText },
  plus: { width: 20, height: 20, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: GH.white },
  pillDot: { position: "absolute", top: -3, right: -1, width: 13, height: 13, borderRadius: radius.pill, backgroundColor: CG.btn.green.fill[1], borderWidth: 2, borderColor: GH.white },
  pillDotWarn: { backgroundColor: CG.badge },

  leagueRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  league: { flex: 1 },
  leagueFill: { flexDirection: "row", alignItems: "center", gap: space.sm, height: 44, paddingLeft: 4, paddingRight: space.sm, borderRadius: radius.pill, borderWidth: 2, borderColor: GH.white },
  shield: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: GH.white },
  shieldText: { ...type.label, fontFamily: fonts.bold, color: CG.btn.gold.ink },
  leagueTexts: { flex: 1, gap: 3 },
  leagueTitle: { ...type.labelXs, fontFamily: fonts.bold, color: GH.white, ...shadowText },
  ready: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: space.sm, height: 26, borderRadius: radius.pill, backgroundColor: CG.btn.green.fill[1], borderWidth: 2, borderColor: GH.white },
  readyText: { ...type.micro, fontFamily: fonts.bold, color: GH.white, letterSpacing: 0.6 },
  count: { ...type.label, fontFamily: fonts.bold, color: GH.white, ...shadowText },
  visitWrap: { gap: space.sm },
  plate: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 46, paddingVertical: 4, paddingLeft: 4, paddingRight: space.sm, borderRadius: radius.pill, borderWidth: 2, borderColor: CG.woodEdge },
  plateLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  plateName: { ...type.label, fontFamily: fonts.bold, color: GH.white, flexShrink: 1, ...shadowText },
  plateSub: { ...type.micro, fontFamily: fonts.bold, color: CG.paper[1] },
  visitLeague: { flex: 1, height: 40 },
  homeBtn: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.pill, borderWidth: 2, borderColor: GH.pillEdge },

  dock: { paddingTop: space.md, paddingHorizontal: space.sm },
  dockShelf: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, borderTopWidth: 3, borderColor: CG.dockEdge },
  dockRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  dockSide: { flexDirection: "row", gap: 2 },
  dockMain: { flex: 1, paddingBottom: space.md },
  tile: { width: 56, alignItems: "center" },
  tileLip: { position: "absolute", top: 4, width: 48, height: 48, borderRadius: radius.lg },
  tileFill: { width: 48, height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: CG.white, overflow: "hidden" },
  tileOn: { borderColor: GH.coin },
  tileShine: { position: "absolute", top: 3, left: 8, right: 8, height: 12, borderRadius: radius.pill, backgroundColor: CG.shine },
  tileBadge: { position: "absolute", top: -5, right: 0, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: CG.badge, borderWidth: 2, borderColor: CG.white },
  tileBadgeText: { ...type.micro, fontFamily: fonts.bold, color: CG.white },
  tileLabel: { ...type.nano, fontFamily: fonts.bold, color: CG.white, marginTop: 6, ...shadowText },

  strip: { gap: space.sm, paddingHorizontal: layout.screenPadding, paddingVertical: space.sm },
  card: { width: 82 },
  cardFill: { alignItems: "center", gap: 3, paddingVertical: space.sm, paddingHorizontal: 4, borderRadius: radius.lg, borderWidth: 3, borderColor: CG.woodEdge },
  cardTitle: { ...type.nano, fontFamily: fonts.bold, color: CG.ink },
  cardMeta: { ...type.nano, fontFamily: fonts.bold, color: CG.inkSoft },
  cardMark: { position: "absolute", top: -5, right: -5, width: 24, height: 24, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: CG.white },
  markUp: { backgroundColor: CG.btn.green.fill[1] },
  markMax: { backgroundColor: CG.btn.gold.fill[1] },
  markOff: { backgroundColor: CG.lock },
  cardNeed: { position: "absolute", top: -5, left: -4, flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 5, height: 18, borderRadius: radius.pill, backgroundColor: CG.league[1], borderWidth: 1.5, borderColor: CG.white },
  cardNeedText: { ...type.nano, fontFamily: fonts.bold, color: CG.white },

  place: { paddingTop: space.md, paddingHorizontal: layout.screenPadding, gap: space.sm },
  placeRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  placeText: { ...type.label, fontFamily: fonts.bold, color: CG.white, flex: 1, ...shadowText },
  placeBtns: { flexDirection: "row", gap: space.sm },
});
