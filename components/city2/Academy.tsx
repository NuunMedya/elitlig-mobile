/**
 * ALTYAPI AKADEMİSİ (Kulüp Şehri 2.0 · Faz 3) — parçalar.
 *
 * Akademi zamanla oyuncu yetiştirir: oyuncular gerçek zamanla yaşlanır
 * (1 gerçek hafta = 1 oyun yılı), gelişir; NPC kulüpleri (kurmaca) teklif
 * yollar, kabul edilen teklif Elit Lira (oyun içi para) olarak kasaya girer.
 * Bütün kurallar, adlar, tutarlar ve süreler sunucudadır
 * (elitlig-server services/city2/academy.js); burada yalnız gösterilir.
 *
 *   AcademyHero        kadro yuvası, yeni oyuncu sayacı, transfer geliri
 *   OfferCard          teklif kartı (kabul onaylı, ret)
 *   PlayerRow          kadro satırı
 *   PlayerSheet        oyuncu penceresi: değer eğrisi, sakatlık, eylemler
 *   EffectsCard        akademi / üniversite / sağlık / scout etkileri
 *   HistoryCard        satılan, ayrılan, emekli olan oyuncular
 *   AcademyInfoSheet   kurallar + "adım kullanılmasın" anahtarı
 *   TransferCelebration teklif kabulünden sonra kutlama ve EL sayacı
 *   AcademyCityCard    şehir ekranındaki giriş kartı (bekleyen teklif rozeti)
 *   AcademyBuildingSection akademi binası penceresindeki bölüm
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, Reveal, Toggle, Touchable, withAlpha } from "@/components/ui";
import {
  ACADEMY_SOURCE_TEXT,
  fmtEl,
  fmtPct,
  spanText,
  untilText,
  valueCurve,
  type City2AcceptResult,
  type City2Academy,
  type City2AcademyEffects,
  type City2AcademyHistory,
  type City2Offer,
  type City2YouthPlayer,
} from "@/lib/puzzle/city2";
import { CITY2_EL, CITY2_UI, CITY_UI } from "@/lib/puzzle/cityPalette";
import { colors, fonts, hairline, isDark, radius, space, textScale, type } from "@/theme";

import { ElCoin, useCountUp } from "./ElitLira";
import { BuildingIcon, cardStyle } from "./shared";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;
const EL_INK = isDark ? CITY2_EL.inkDark : CITY2_EL.ink;

type IconName = keyof typeof Ionicons.glyphMap;

/** Dakikada bir tazelenen "şimdi" (geri sayımlar için; ekran açıkken). */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/* ───────────────────────── Küçük parçalar ───────────────────────── */

const POS_COLOR: Record<string, string> = {
  KL: colors.posKeeper,
  DEF: colors.posDefense,
  OS: colors.posMidfield,
  FV: colors.posForward,
};
const posColor = (pos: string | null | undefined) => (pos && POS_COLOR[pos]) || colors.posUnknown;

/** Gelişim yönü: 26 yaşına dek gelişir, 26–29 zirve, 30'dan sonra düşer. */
function trendOf(p: City2YouthPlayer): { icon: IconName; label: string; color: string } {
  if (p.age_exact < 26) return { icon: "trending-up", label: "Gelişiyor", color: colors.win };
  if (p.age_exact < 30) return { icon: "arrow-forward", label: "Zirvede", color: colors.brandAccent };
  return { icon: "trending-down", label: "Düşüşte", color: colors.warn };
}

const stageTitle = (academy: Pick<City2Academy, "name_stages"> | null | undefined, key: string) =>
  academy?.name_stages.find((s) => s.key === key)?.title ?? null;

/** Oyuncu rozeti: mevki renginde baş harf; sakatsa küçük sağlık işareti. */
export function PlayerAvatar({ p, size = 44 }: { p: City2YouthPlayer; size?: number }) {
  const tint = posColor(p.pos);
  return (
    <View>
      <View style={[styles.avatar, { width: size, height: size, backgroundColor: withAlpha(tint, 0.14), borderColor: withAlpha(tint, 0.35) }]}>
        <Text style={[size >= 56 ? styles.avatarTextLg : styles.avatarText, { color: tint }]} {...textScale.badge}>
          {p.first.slice(0, 1).toLocaleUpperCase("tr-TR")}
        </Text>
      </View>
      {p.injured ? (
        <View style={styles.avatarInjury}>
          <Ionicons name="medkit" size={10} color={CITY_UI.white} />
        </View>
      ) : null}
    </View>
  );
}

function Pill({ icon, label, tone = "neutral" }: { icon?: IconName; label: string; tone?: "neutral" | "danger" | "brand" | "el" }) {
  const fg = tone === "danger" ? colors.danger : tone === "brand" ? colors.brandAccent : tone === "el" ? EL_INK : colors.textSecondary;
  const bg = tone === "danger" ? colors.dangerDim : tone === "brand" ? colors.brandDim : tone === "el" ? withAlpha(EL_INK, 0.12) : colors.surface2;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

function ElAmount({ value, size = "md" }: { value: number; size?: "md" | "lg" }) {
  return (
    <View style={styles.elAmount}>
      <ElCoin size={size === "lg" ? 20 : 15} />
      <Text style={size === "lg" ? styles.elAmountLg : styles.elAmountText} {...textScale.badge}>
        {fmtEl(value)}
      </Text>
    </View>
  );
}

/** Yeşil "ilerle" düğmesi (şehrin tek vurgusu). */
function GoButton({ label, icon, onPress, busy, disabled, accessibilityLabel }: { label: string; icon?: IconName; onPress: () => void; busy?: boolean; disabled?: boolean; accessibilityLabel?: string }) {
  const off = disabled || busy;
  return (
    <Touchable
      onPress={onPress}
      disabled={off}
      haptic="success"
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off) }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.go, disabled ? styles.goOff : null]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={CITY_UI.white} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={16} color={disabled ? colors.textTertiary : CITY_UI.white} /> : null}
          <Text style={[styles.goText, disabled ? styles.goTextOff : null]} numberOfLines={1} {...textScale.badge}>
            {label}
          </Text>
        </>
      )}
    </Touchable>
  );
}

/* ═════════════════════════ ÜST KART ═════════════════════════ */

export function AcademyHero({ academy, now, stageName }: { academy: City2Academy; now: number; stageName?: string | null }) {
  const intake = untilText(academy.next_intake_at, now);
  const fill = academy.slots.max > 0 ? Math.min(1, academy.slots.used / academy.slots.max) : 0;
  return (
    <View style={styles.hero}>
      <LinearGradient colors={CITY2_UI.panel} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <View style={styles.heroTop}>
        <BuildingIcon buildingKey="akademi" icon="school" size={48} />
        <View style={styles.flex}>
          <Text style={styles.heroOver} {...textScale.badge}>
            {academy.stage}. AŞAMA
          </Text>
          <Text style={styles.heroTitle} numberOfLines={1} {...textScale.dense}>
            {stageName ?? "Altyapı akademisi"}
          </Text>
          {academy.intake_hours ? (
            <Text style={styles.heroSub} numberOfLines={1} {...textScale.dense}>
              {academy.intake_hours} saatte bir yeni oyuncu gelir
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.heroStats}>
        <View style={styles.heroStat}>
          <Text style={styles.heroLabel} {...textScale.badge}>
            KADRO
          </Text>
          <Text style={styles.heroValue} {...textScale.badge}>
            {academy.slots.used}/{academy.slots.max}
          </Text>
          <View style={styles.heroTrack}>
            <View style={[styles.heroFill, { width: `${Math.round(fill * 100)}%` as const }, academy.slots.full ? styles.heroFillFull : null]} />
          </View>
        </View>
        <View style={styles.heroStat}>
          <Text style={styles.heroLabel} {...textScale.badge}>
            YENİ OYUNCU
          </Text>
          <Text style={[styles.heroValue, academy.slots.full || academy.paused ? styles.heroValueWarn : null]} numberOfLines={1} {...textScale.badge}>
            {academy.paused ? "Durdu" : academy.slots.full ? "Yer yok" : (intake ?? "—")}
          </Text>
          <Text style={styles.heroCaption} numberOfLines={1} {...textScale.badge}>
            {academy.paused ? "bina kurulunca" : academy.slots.full ? `${intake ?? "az sonra"} sonra gelen kaçar` : "sonra gelir"}
          </Text>
        </View>
        <View style={styles.heroStat}>
          <Text style={styles.heroLabel} {...textScale.badge}>
            TRANSFER
          </Text>
          <View style={styles.heroElLine}>
            <ElCoin size={16} />
            <Text style={[styles.heroValue, styles.heroValueEl]} numberOfLines={1} {...textScale.badge}>
              {fmtEl(academy.totals.income)}
            </Text>
          </View>
          <Text style={styles.heroCaption} numberOfLines={1} {...textScale.badge}>
            {academy.totals.sold} satış
          </Text>
        </View>
      </View>
      {academy.paused ? (
        <View style={styles.heroNote}>
          <Ionicons name="pause-circle" size={15} color={CITY2_EL.full} />
          <Text style={styles.heroNoteText} {...textScale.long}>
            {academy.paused_text ?? "Akademi binası yeniden kurulana dek yeni oyuncu gelmez; oyuncuların akademide kalır."}
          </Text>
        </View>
      ) : null}
      {academy.full_text && !academy.paused ? (
        <View style={styles.heroNote}>
          <Ionicons name="alert-circle" size={15} color={CITY2_EL.full} />
          <Text style={styles.heroNoteText} {...textScale.long}>
            {academy.full_text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ═════════════════════════ TEKLİFLER ═════════════════════════ */

export function OfferCard({
  offer,
  player,
  now,
  salesLeft,
  busy,
  accepting,
  rejecting,
  onAccept,
  onReject,
  onPlayer,
}: {
  offer: City2Offer;
  player: City2YouthPlayer | null;
  now: number;
  salesLeft: number;
  busy: boolean;
  accepting: boolean;
  rejecting: boolean;
  onAccept: () => void;
  onReject: () => void;
  onPlayer?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const left = new Date(offer.expires_at).getTime() - now;
  const soon = left < 6 * 3_600_000;
  const diff = offer.value ? offer.amount / offer.value - 1 : 0;
  const name = offer.player_name ?? player?.name ?? "Oyuncu";
  const capped = salesLeft <= 0;
  return (
    <View style={styles.offer}>
      <View style={styles.offerTop}>
        <View style={styles.crest}>
          <Ionicons name="shield-half" size={20} color={colors.brandAccent} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.offerClub} numberOfLines={1} {...textScale.dense}>
            {offer.club.name}
          </Text>
          <Text style={styles.offerTier} numberOfLines={1} {...textScale.dense}>
            {offer.club.tier_title}
          </Text>
        </View>
        <Pill icon="time-outline" label={`${untilText(offer.expires_at, now) ?? "az sonra"} kaldı`} tone={soon ? "danger" : "neutral"} />
      </View>
      <View style={styles.offerMid}>
        <Touchable onPress={onPlayer} disabled={!onPlayer} feedback="row" style={styles.offerPlayer} accessibilityRole="button" accessibilityLabel={`${name} oyuncusunu aç`}>
          {player ? <PlayerAvatar p={player} size={34} /> : null}
          <View style={styles.flex}>
            <Text style={styles.offerFor} {...textScale.badge}>
              OYUNCU
            </Text>
            <Text style={styles.offerName} numberOfLines={1} {...textScale.dense}>
              {name}
              {player ? ` · ${player.age}` : ""}
            </Text>
          </View>
        </Touchable>
        <View style={styles.offerAmountBox}>
          <ElAmount value={offer.amount} size="lg" />
          {offer.value ? (
            <Text style={[styles.offerDiff, diff >= 0 ? styles.offerDiffUp : null]} numberOfLines={1} {...textScale.badge}>
              {Math.abs(diff) < 0.01 ? "değeri kadar" : `değerinin %${Math.round(Math.abs(diff) * 100)} ${diff > 0 ? "üstünde" : "altında"}`}
            </Text>
          ) : null}
        </View>
      </View>
      {confirm ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText} {...textScale.long}>
            {name} satılsın mı? {offer.club.name} · {fmtEl(offer.amount)} EL. Oyuncu akademiden ayrılır.
          </Text>
          <View style={styles.offerButtons}>
            <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setConfirm(false)} style={styles.flex} />
            <View style={styles.flex}>
              <GoButton
                label="Sat"
                icon="checkmark"
                busy={accepting}
                disabled={busy && !accepting}
                onPress={() => {
                  setConfirm(false);
                  onAccept();
                }}
                accessibilityLabel={`${name} oyuncusunu sat, ${offer.amount} EL`}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.offerButtons}>
          <Button label="Reddet" variant="secondary" size="sm" loading={rejecting} disabled={busy} onPress={onReject} style={styles.flex} />
          <View style={styles.flex}>
            <GoButton
              label={capped ? "Bugünlük sınır doldu" : "Kabul et"}
              icon={capped ? "lock-closed" : "checkmark-circle"}
              disabled={busy || capped || Boolean(player?.injured)}
              onPress={() => setConfirm(true)}
              accessibilityLabel={`Teklifi kabul et: ${offer.club.name}, ${offer.amount} EL`}
            />
          </View>
        </View>
      )}
    </View>
  );
}

/* ═════════════════════════ KADRO ═════════════════════════ */

export function PlayerRow({ p, now, onPress }: { p: City2YouthPlayer; now: number; onPress: () => void }) {
  const trend = trendOf(p);
  const quality = p.pot > 0 ? Math.min(1, p.ovr / p.pot) : 0;
  return (
    <Touchable onPress={onPress} feedback="card" haptic="selection" style={styles.row} accessibilityRole="button" accessibilityLabel={`${p.name}, ${p.age} yaş, değer ${p.value} EL`}>
      <PlayerAvatar p={p} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowName} numberOfLines={1} {...textScale.dense}>
          {p.name}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1} {...textScale.dense}>
          {[`${p.age} yaş`, p.pos_title].filter(Boolean).join(" · ")}
        </Text>
        <View style={styles.rowPills}>
          {p.source === "self" ? <Pill icon="person" label="Sen" tone="el" /> : null}
          {p.injured ? <Pill icon="medkit" label={`Sakat · ${untilText(p.injury_until, now) ?? "az sonra"}`} tone="danger" /> : null}
          {p.offers.length ? <Pill icon="mail-unread" label="Teklif var" tone="brand" /> : null}
          {p.listed ? <Pill icon="pricetag" label="Listede" /> : null}
          {!p.injured && !p.offers.length && !p.listed ? (
            <View style={styles.trend}>
              <Ionicons name={trend.icon} size={13} color={trend.color} />
              <Text style={[styles.trendText, { color: trend.color }]} {...textScale.badge}>
                {trend.label}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.rowRight}>
        <ElAmount value={p.value} />
        <View style={styles.quality}>
          <Text style={styles.qualityText} {...textScale.badge}>
            {p.ovr}
            <Text style={styles.qualityPot}>/{p.pot}</Text>
          </Text>
        </View>
        <View style={styles.qualityTrack}>
          <View style={[styles.qualityFill, { width: `${Math.round(quality * 100)}%` as const }]} />
        </View>
      </View>
    </Touchable>
  );
}

/* ═════════════════════════ DEĞER EĞRİSİ ═════════════════════════ */

export function ValueCurve({ p, uniGrowth }: { p: City2YouthPlayer; uniGrowth: number }) {
  const { points, peak } = useMemo(() => valueCurve(p, uniGrowth), [p, uniGrowth]);
  const max = Math.max(...points.map((x) => x.value), 1);
  const nowAge = Math.floor(p.age_exact);
  const marks = new Set([8, 12, 16, 20, 24, 28, 32, 35]);
  return (
    <View style={styles.curve}>
      <View style={styles.curveHead}>
        <View style={styles.flex}>
          <Text style={styles.blockTitle} {...textScale.dense}>
            Yaşa göre değer
          </Text>
          <Text style={styles.curveSub} {...textScale.long}>
            Zirve yaşı {peak.from === peak.to ? peak.from : `${peak.from}–${peak.to}`} · yaklaşık {fmtEl(peak.value)} EL
          </Text>
        </View>
        <View style={styles.legend}>
          <View style={[styles.legendDot, styles.barNow]} />
          <Text style={styles.legendText} {...textScale.badge}>
            Şimdi
          </Text>
          <View style={[styles.legendDot, styles.barPeak]} />
          <Text style={styles.legendText} {...textScale.badge}>
            Zirve
          </Text>
        </View>
      </View>
      <View style={styles.bars} accessibilityLabel={`Değer eğrisi: zirve ${peak.from}–${peak.to} yaş`}>
        {points.map((pt) => {
          const isNow = pt.age === nowAge;
          const isPeak = pt.age >= peak.from && pt.age <= peak.to;
          return (
            <View key={pt.age} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  { height: `${Math.max(isNow ? 8 : 3, Math.round((pt.value / max) * 100))}%` as const },
                  isPeak ? styles.barPeak : null,
                  pt.age < nowAge ? styles.barPast : null,
                  isNow ? styles.barNow : null,
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        {points.map((pt, i) =>
          marks.has(pt.age) ? (
            <Text
              key={pt.age}
              style={[styles.axisText, { left: `${((i + 0.5) / points.length) * 100}%` as const }, pt.age === nowAge ? styles.axisNow : null]}
              numberOfLines={1}
              {...textScale.badge}
            >
              {pt.age}
            </Text>
          ) : null,
        )}
      </View>
      <Text style={styles.curveNote} {...textScale.long}>
        Bugünkü değeri {fmtEl(p.value)} EL. Diğer yaşlar tahminidir; oyuncu 36 yaşında futbolu bırakır.
      </Text>
    </View>
  );
}

/* ═════════════════════════ OYUNCU PENCERESİ ═════════════════════════ */

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string | null }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel} {...textScale.badge}>
        {label}
      </Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={styles.statValue} {...textScale.badge}>
          {value}
        </Text>
      ) : (
        value
      )}
      {sub ? (
        <Text style={styles.statSub} numberOfLines={1} {...textScale.badge}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

export function PlayerSheet({
  p,
  academy,
  now,
  busy,
  pending,
  onClose,
  onList,
  onPromote,
  onRelease,
  onOffers,
}: {
  p: City2YouthPlayer | null;
  academy: City2Academy | null;
  now: number;
  busy: boolean;
  pending: { list?: boolean; promote?: boolean; release?: boolean };
  onClose: () => void;
  onList: (listed: boolean) => void;
  onPromote: () => void;
  onRelease: () => void;
  onOffers: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [p?.id]);
  const uni = academy?.effects.universite.growth_pct ?? 0;
  const inAcademy = p?.team === "academy";
  const trend = p ? trendOf(p) : null;
  const offer = p && academy ? academy.offers.find((o) => o.player_id === p.id) ?? null : null;
  const listedCount = academy?.squad.filter((x) => x.listed).length ?? 0;
  const promoteBlock = !p || !inAcademy ? null : p.injured ? "Sakat oyuncu A takıma çıkamaz" : p.age < 17 ? "A takıma 17 yaşından sonra çıkar" : null;
  const aFull = academy ? academy.a_team.players.length >= academy.a_team.max : false;

  let footer: ReactNode = null;
  if (p) {
    footer = confirm ? (
      <View style={styles.footer}>
        <Text style={styles.confirmText} {...textScale.long}>
          {p.name} serbest bırakılsın mı? Karşılığında EL gelmez; yuvası boşalır ama sıradaki oyuncu yine zamanında gelir.
        </Text>
        <View style={styles.offerButtons}>
          <Button label="Vazgeç" variant="secondary" onPress={() => setConfirm(false)} style={styles.flex} />
          <Button label="Serbest bırak" variant="danger" icon="exit-outline" loading={pending.release} disabled={busy} onPress={onRelease} style={styles.flex} />
        </View>
      </View>
    ) : (
      <View style={styles.footerRow}>
        <Button label="Serbest bırak" variant="secondary" icon="exit-outline" disabled={busy} onPress={() => setConfirm(true)} style={styles.flex} />
        {inAcademy ? (
          <View style={styles.flex}>
            <GoButton
              label="A takıma çıkar"
              icon="arrow-up-circle"
              busy={pending.promote}
              disabled={busy || Boolean(promoteBlock) || aFull}
              onPress={onPromote}
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <BottomSheet visible={Boolean(p)} onClose={onClose} title={p?.name} snap="full" footer={footer}>
      {p && academy ? (
        <View style={styles.sheet}>
          <View style={styles.pHero}>
            <PlayerAvatar p={p} size={60} />
            <View style={styles.flex}>
              <Text style={styles.pOver} {...textScale.badge}>
                {(stageTitle(academy, p.name_stage) ?? "").toLocaleUpperCase("tr-TR")} · {p.team === "a" ? "A TAKIM" : "AKADEMİ"}
              </Text>
              <Text style={styles.pAge} {...textScale.dense}>
                {p.age} yaş{p.pos_title ? ` · ${p.pos_title}` : ""}
              </Text>
              <Text style={styles.pMeta} {...textScale.long}>
                {ACADEMY_SOURCE_TEXT[p.source] ?? "Akademinin adı"}
                {p.next_birthday_at ? ` · ${p.age + 1} yaşına ${spanText(p.next_birthday_at, now) ?? "az kaldı"}` : ""}
              </Text>
            </View>
          </View>

          <View style={styles.stats}>
            <Stat label="GÜÇ" value={String(p.ovr)} sub={trend?.label} />
            <Stat label="POTANSİYEL" value={String(p.pot)} sub="tepe gücü" />
            <Stat
              label="DEĞER"
              value={
                <View style={styles.elAmount}>
                  <ElCoin size={16} />
                  <Text style={styles.statValue} {...textScale.badge}>
                    {fmtEl(p.value)}
                  </Text>
                </View>
              }
              sub="EL"
            />
          </View>

          {p.injured ? (
            <View style={styles.injury}>
              <Ionicons name="medkit" size={18} color={colors.danger} />
              <View style={styles.flex}>
                <Text style={styles.injuryTitle} {...textScale.dense}>
                  Sakat · {spanText(p.injury_until, now) ?? "az sonra"} sonra iyileşir
                </Text>
                <Text style={styles.injuryText} {...textScale.long}>
                  Sakatken teklif almaz, satılamaz ve A takıma çıkamaz.
                  {academy.effects.saglik.stage > 0 ? ` Sağlık merkezin iyileşmeyi ${fmtPct(academy.effects.saglik.recovery_reduction)} kısaltıyor.` : ""}
                </Text>
              </View>
            </View>
          ) : null}

          {offer ? (
            <Touchable onPress={onOffers} feedback="card" style={styles.pOffer} accessibilityRole="button" accessibilityLabel={`Bekleyen teklif: ${offer.club.name}, ${offer.amount} EL`}>
              <Ionicons name="mail-unread" size={18} color={colors.brandAccent} />
              <Text style={styles.pOfferText} numberOfLines={1} {...textScale.dense}>
                {offer.club.name} teklifi
              </Text>
              <ElAmount value={offer.amount} />
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Touchable>
          ) : null}

          <ValueCurve p={p} uniGrowth={uni} />

          {inAcademy ? (
            <View style={styles.listRow}>
              <View style={styles.flex}>
                <Text style={styles.listTitle} {...textScale.dense}>
                  Satış listesinde
                </Text>
                <Text style={styles.listText} {...textScale.long}>
                  {p.can_list
                    ? `Listedeki oyuncuya daha sık teklif gelir. En çok 3 oyuncu (${listedCount}/3).`
                    : "Kulüpler 14 yaşından büyük oyunculara teklif yollar."}
                </Text>
              </View>
              {pending.list ? (
                <ActivityIndicator size="small" color={colors.brandAccent} />
              ) : (
                <Toggle
                  value={p.listed}
                  onValueChange={onList}
                  disabled={busy || (!p.listed && (!p.can_list || listedCount >= 3))}
                  accessibilityLabel="Satış listesinde"
                />
              )}
            </View>
          ) : (
            <View style={styles.aNote}>
              <Ionicons name="shield-checkmark" size={16} color={colors.brandAccent} />
              <Text style={styles.listText} {...textScale.long}>
                {academy.a_team.text}
              </Text>
            </View>
          )}
          {inAcademy && (promoteBlock || aFull) ? (
            <Text style={styles.blockNote} {...textScale.long}>
              {aFull ? `A takım dolu (en çok ${academy.a_team.max} oyuncu).` : promoteBlock}
            </Text>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

/* ═════════════════════════ ETKİLER ═════════════════════════ */

function EffectRow({ building, icon, title, stage, text, children }: { building: string; icon: string; title: string; stage: number; text: string; children?: ReactNode }) {
  return (
    <View style={styles.effect}>
      <BuildingIcon buildingKey={building} icon={icon} size={36} off={stage <= 0} />
      <View style={styles.flex}>
        <View style={styles.effectHead}>
          <Text style={styles.effectTitle} numberOfLines={1} {...textScale.dense}>
            {title}
          </Text>
          <Text style={styles.effectStage} {...textScale.badge}>
            {stage > 0 ? `${stage}. AŞAMA` : "KURULMADI"}
          </Text>
        </View>
        <Text style={styles.effectText} {...textScale.long}>
          {text}
        </Text>
        {children}
      </View>
    </View>
  );
}

export function EffectsCard({ effects }: { effects: City2AcademyEffects }) {
  const a = effects.akademi;
  const u = effects.universite;
  const s = effects.saglik;
  return (
    <View style={styles.card}>
      <EffectRow
        building="akademi"
        icon="school"
        title="Akademi"
        stage={a.stage}
        text={`${a.slots} oyunculuk kadro · ${a.intake_hours ?? "—"} saatte bir yeni oyuncu · potansiyel tabanı ${a.potential_base ?? "—"}`}
      >
        {a.next ? (
          <Text style={styles.effectNext} {...textScale.long}>
            {a.next.stage}. aşamada: {a.next.slots} yuva · {a.next.intake_hours} saatte bir · taban {a.next.potential_base}
          </Text>
        ) : null}
      </EffectRow>
      <View style={styles.sep} />
      <EffectRow
        building="universite"
        icon="library"
        title="Üniversite hocaları"
        stage={u.stage}
        text={u.stage > 0 ? `26 yaşına dek gelişim ${fmtPct(u.growth_pct)} hızlı · tepe gücü +${u.peak_bonus}` : u.text}
      />
      <View style={styles.sep} />
      <EffectRow
        building="saglik"
        icon="medkit"
        title="Sağlık merkezi"
        stage={s.stage}
        text={s.stage > 0 ? `Sakatlık ${fmtPct(s.injury_reduction)} az · iyileşme ${fmtPct(s.recovery_reduction)} kısa` : s.text}
      />
      <View style={styles.sep} />
      <EffectRow
        building="scout"
        icon="globe"
        title="Scout merkezi"
        stage={effects.scout.stage}
        text={effects.scout.europe ? "Avrupa kulüpleri de teklif yollar (en yüksek çarpan)." : "Kurulunca Avrupa kulüpleri de teklif yollar."}
      />
    </View>
  );
}

/* ═════════════════════════ GEÇMİŞ ═════════════════════════ */

const HISTORY_META: Record<string, { icon: IconName; verb: string }> = {
  sold: { icon: "swap-horizontal", verb: "Satıldı" },
  released: { icon: "exit-outline", verb: "Serbest bırakıldı" },
  retired: { icon: "flag-outline", verb: "Futbolu bıraktı" },
  promoted: { icon: "arrow-up-circle-outline", verb: "A takıma çıktı" },
  injured: { icon: "medkit-outline", verb: "Sakatlandı" },
  joined: { icon: "person-add-outline", verb: "Akademiye katıldı" },
};

function ago(iso: string, now: number): string {
  const h = Math.max(0, (now - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "az önce";
  if (h < 24) return `${Math.floor(h)} sa önce`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} gün önce` : `${Math.floor(d / 7)} hf önce`;
}

export function HistoryCard({ items, now, limit = 8 }: { items: City2AcademyHistory[]; now: number; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <View style={styles.card}>
      {shown.map((h, i) => {
        const meta = HISTORY_META[h.kind] ?? { icon: "ellipse-outline" as IconName, verb: h.kind };
        const detail = [meta.verb, h.club?.name, h.age != null ? `${h.age} yaş` : null, h.kind === "injured" && h.hours ? `${h.hours} sa` : null].filter(Boolean).join(" · ");
        return (
          <View key={`${h.at}-${h.player_id}-${h.kind}-${i}`} style={[styles.hRow, i > 0 ? styles.hBorder : null]}>
            <View style={[styles.hIcon, h.kind === "sold" ? styles.hIconSold : null]}>
              <Ionicons name={meta.icon} size={16} color={h.kind === "sold" ? EL_INK : colors.textSecondary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.hName} numberOfLines={1} {...textScale.dense}>
                {h.name}
              </Text>
              <Text style={styles.hDetail} numberOfLines={1} {...textScale.dense}>
                {detail}
              </Text>
            </View>
            <View style={styles.hRight}>
              {h.amount ? (
                <Text style={styles.hAmount} {...textScale.badge}>
                  +{fmtEl(h.amount)} EL
                </Text>
              ) : null}
              <Text style={styles.hAgo} {...textScale.badge}>
                {ago(h.at, now)}
              </Text>
            </View>
          </View>
        );
      })}
      {items.length > limit ? (
        <Touchable onPress={() => setAll((v) => !v)} feedback="row" style={styles.more} accessibilityRole="button" accessibilityLabel={all ? "Daha az göster" : "Bütün geçmiş"}>
          <Text style={styles.moreText} {...textScale.dense}>
            {all ? "Daha az göster" : `Bütün geçmiş · ${items.length}`}
          </Text>
        </Touchable>
      ) : null}
    </View>
  );
}

/* ═════════════════════════ BİLGİ + GİZLİLİK ═════════════════════════ */

/** "Altyapı oyunlarında adım kullanılmasın" satırı (akademi bilgisi ve Ayarlar'da aynı metin). */
export function PrivacyToggleRow({ label, help, value, disabled, onChange }: { label: string; help: string | null; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.privacy}>
      <View style={styles.privacyIcon}>
        <Ionicons name="eye-off" size={18} color={colors.brandAccent} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.listTitle} {...textScale.dense}>
          {label}
        </Text>
        {help ? (
          <Text style={styles.listText} {...textScale.long}>
            {help}
          </Text>
        ) : null}
      </View>
      <Toggle value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} />
    </View>
  );
}

export function AcademyInfoSheet({
  visible,
  onClose,
  academy,
  privacy,
}: {
  visible: boolean;
  onClose: () => void;
  academy: City2Academy | null;
  privacy: { supported: boolean; value: boolean; label: string; help: string | null; saving: boolean; set: (v: boolean) => void };
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Akademi nasıl işler?" snap="full">
      {academy ? (
        <View style={styles.sheet}>
          <Text style={styles.lead} {...textScale.long}>
            {academy.intro}
          </Text>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={18} color={colors.brandAccent} />
            <Text style={styles.infoText} {...textScale.long}>
              {academy.time.text}
            </Text>
          </View>
          <View style={styles.block}>
            <Text style={styles.blockTitle} {...textScale.dense}>
              Yaşa göre ad
            </Text>
            <View style={styles.stagesRow}>
              {academy.name_stages.map((s) => (
                <View key={s.key} style={styles.stageChip}>
                  <Text style={styles.stageChipTitle} numberOfLines={1} {...textScale.badge}>
                    {s.key === "profesyonel" ? "Ad Soyad" : s.title}
                  </Text>
                  <Text style={styles.stageChipAge} {...textScale.badge}>
                    {s.max == null ? `${s.min}+` : `${Math.max(8, s.min)}–${s.max}`}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.infoText} {...textScale.long}>
              {academy.names_text}
            </Text>
          </View>
          <View style={styles.block}>
            <Text style={styles.blockTitle} {...textScale.dense}>
              Transfer
            </Text>
            <Text style={styles.infoText} {...textScale.long}>
              14 yaşından büyük oyunculara NPC kulüpleri zaman zaman teklif yollar. Teklif 48 saat geçerlidir; kabul edersen tutar Elit Lira olarak kasana girer. Günde en çok {academy.sales.daily_cap} satış yapılabilir.
            </Text>
          </View>
          <View style={styles.block}>
            <Text style={styles.blockTitle} {...textScale.dense}>
              Gizlilik
            </Text>
            <PrivacyToggleRow
              label={privacy.supported ? privacy.label : academy.privacy.label}
              help={(privacy.supported ? privacy.help : null) ?? academy.privacy.help}
              value={privacy.supported ? privacy.value : academy.privacy.opt_out}
              disabled={!privacy.supported || privacy.saving}
              onChange={privacy.set}
            />
            <Text style={styles.blockNote} {...textScale.long}>
              Bu ayar Ayarlar ▸ Gizlilik'te de var.
            </Text>
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

/* ═════════════════════════ KUTLAMA ═════════════════════════ */

export function TransferCelebration({ result, playerName, onClose }: { result: (City2AcceptResult & { clubName: string | null }) | null; playerName: string | null; onClose: () => void }) {
  const [target, setTarget] = useState(0);
  useEffect(() => {
    setTarget(0);
    if (!result) return;
    const id = setTimeout(() => setTarget(result.amount), 250);
    return () => clearTimeout(id);
  }, [result]);
  const shown = useCountUp(target);
  return (
    <BottomSheet visible={Boolean(result)} onClose={onClose} title="Transfer tamam" snap="content" footer={<Button label="Harika" onPress={onClose} fullWidth haptic="success" />}>
      {result ? (
        <Reveal scaleFrom={0.88}>
          <View style={styles.celebrate}>
            <LinearGradient colors={CITY2_UI.panel} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
            <ElCoin size={64} />
            <Text style={styles.celebrateAmount} {...textScale.badge}>
              +{fmtEl(shown)} EL
            </Text>
            <Text style={styles.celebrateLine} numberOfLines={2} {...textScale.dense}>
              {playerName ?? "Oyuncun"} · {result.clubName ?? "yeni kulübü"}
            </Text>
            <View style={styles.celebrateBalance}>
              <Text style={styles.celebrateBalanceText} {...textScale.badge}>
                Kasa: {fmtEl(result.balance)} EL
              </Text>
            </View>
          </View>
        </Reveal>
      ) : null}
    </BottomSheet>
  );
}

/* ═════════════════════════ ŞEHİR EKRANI ═════════════════════════ */

export function AcademyCityCard({ academy, onPress }: { academy: City2Academy; onPress: () => void }) {
  const now = useNow(60_000);
  const offers = academy.offers.length;
  const injured = academy.squad.filter((p) => p.injured).length;
  const sub = [
    `${academy.slots.used}/${academy.slots.max} oyuncu`,
    academy.paused ? "bina kurulana dek yeni oyuncu gelmez" : academy.slots.full ? "kadro dolu" : academy.next_intake_at ? `yeni oyuncu ${untilText(academy.next_intake_at, now) ?? "az sonra"}` : null,
    injured ? `${injured} sakat` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Touchable onPress={onPress} feedback="card" haptic="selection" style={styles.cityCard} accessibilityRole="button" accessibilityLabel={`Altyapı akademisi, ${sub}${offers ? `, ${offers} bekleyen teklif` : ""}`}>
      <BuildingIcon buildingKey="akademi" icon="school" size={44} />
      <View style={styles.flex}>
        <Text style={styles.cityTitle} numberOfLines={1} {...textScale.dense}>
          Altyapı akademisi
        </Text>
        <Text style={styles.citySub} numberOfLines={2} {...textScale.dense}>
          {sub}
        </Text>
      </View>
      {offers ? (
        <View style={styles.offerBadge}>
          <Ionicons name="mail-unread" size={12} color={colors.textOnBrand} />
          <Text style={styles.offerBadgeText} {...textScale.badge}>
            {offers} teklif
          </Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Touchable>
  );
}

/** Akademi binası penceresi: kuruluysa özet + "Akademiye git"; değilse ne yapacağını anlatır. */
export function AcademyBuildingSection({ academy, onOpen }: { academy: City2Academy | null; onOpen: () => void }) {
  if (!academy) {
    const items: { icon: IconName; text: string }[] = [
      { icon: "person-add-outline", text: "İlk aşama kurulunca altyapı açılır; ilk oyuncu sensin." },
      { icon: "time-outline", text: "Oyuncular gerçek zamanla büyür: 1 gerçek hafta = 1 oyun yılı." },
      { icon: "swap-horizontal", text: "14 yaşından büyüklere NPC kulüpleri teklif yollar; kabul edersen Elit Lira kazanırsın." },
      { icon: "trending-up", text: "Aşama arttıkça kadro büyür, oyuncular daha sık ve daha yetenekli gelir." },
      { icon: "medkit-outline", text: "Üniversite gelişimi hızlandırır, sağlık merkezi sakatlıkları azaltır." },
    ];
    return (
      <View style={styles.bSection}>
        <Text style={styles.blockTitle} {...textScale.dense}>
          Altyapı akademisi ne yapar?
        </Text>
        {items.map((it) => (
          <View key={it.text} style={styles.infoRow}>
            <Ionicons name={it.icon} size={17} color={colors.brandAccent} />
            <Text style={styles.infoText} {...textScale.long}>
              {it.text}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.bSection}>
      <View style={styles.bHead}>
        <View style={styles.flex}>
          <Text style={styles.blockTitle} {...textScale.dense}>
            Altyapı
          </Text>
          <Text style={styles.infoText} {...textScale.long}>
            {academy.slots.used}/{academy.slots.max} oyuncu · A takımda {academy.a_team.players.length} · transferden {fmtEl(academy.totals.income)} EL
          </Text>
        </View>
        {academy.offers.length ? <Pill icon="mail-unread" label={`${academy.offers.length} teklif`} tone="brand" /> : null}
      </View>
      <Button label="Akademiye git" icon="school-outline" variant="secondary" onPress={onOpen} fullWidth />
    </View>
  );
}

/* ═════════════════════════ STİLLER ═════════════════════════ */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { ...cardStyle, padding: space.md, gap: space.sm },
  sep: { height: hairline, backgroundColor: colors.separator },
  avatar: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  avatarText: { ...type.h3, fontFamily: fonts.bold },
  avatarTextLg: { ...type.h1, fontFamily: fonts.bold },
  avatarInjury: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.surface1,
  },
  pill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: space.s, paddingVertical: 2, borderRadius: radius.pill, flexShrink: 1 },
  pillText: { ...type.micro, letterSpacing: 0 },
  elAmount: { flexDirection: "row", alignItems: "center", gap: 4 },
  elAmountText: { ...type.numSmStrong, color: colors.textPrimary },
  elAmountLg: { ...type.h2, fontFamily: fonts.bold, color: colors.textPrimary },
  go: {
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    backgroundColor: CITY2_UI.go,
  },
  goOff: { backgroundColor: colors.surface3 },
  goText: { ...type.label, fontFamily: fonts.bold, color: CITY_UI.white },
  goTextOff: { color: colors.textTertiary },

  hero: { borderRadius: radius.xxl, padding: space.lg, gap: space.md, overflow: "hidden", borderWidth: hairline, borderColor: CITY2_UI.panelEdge },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroOver: { ...type.overline, color: CITY2_UI.panelMuted },
  heroTitle: { ...type.h2, color: CITY_UI.white },
  heroSub: { ...type.bodySm, color: CITY2_UI.panelMuted },
  heroStats: { flexDirection: "row", gap: space.sm },
  heroStat: { flex: 1, gap: 2, paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: radius.lg, backgroundColor: CITY2_UI.panelChip },
  heroLabel: { ...type.micro, color: CITY2_UI.panelMuted },
  heroValue: { ...type.h3, fontFamily: fonts.bold, color: CITY_UI.white },
  heroValueWarn: { color: CITY2_EL.full },
  heroValueEl: { color: CITY2_EL.gain },
  heroElLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroCaption: { ...type.micro, letterSpacing: 0, color: CITY2_UI.panelMuted },
  heroTrack: { height: 5, borderRadius: radius.pill, backgroundColor: CITY2_EL.track, overflow: "hidden", marginTop: 3 },
  heroFill: { height: 5, borderRadius: radius.pill, backgroundColor: CITY2_EL.gain },
  heroFillFull: { backgroundColor: CITY2_EL.full },
  heroNote: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
  heroNoteText: { ...type.caption, color: CITY2_UI.panelMuted, flex: 1 },

  offer: { ...cardStyle, padding: space.md, gap: space.md },
  offerTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  crest: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  offerClub: { ...type.h3, color: colors.textPrimary },
  offerTier: { ...type.caption, color: colors.textTertiary },
  offerMid: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  offerPlayer: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md },
  offerFor: { ...type.micro, color: colors.textTertiary },
  offerName: { ...type.labelSm, color: colors.textPrimary },
  offerAmountBox: { alignItems: "flex-end", gap: 1 },
  offerDiff: { ...type.micro, letterSpacing: 0, color: colors.textTertiary },
  offerDiffUp: { color: EL_INK },
  offerButtons: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  confirm: { gap: space.sm },
  confirmText: { ...type.bodySm, color: colors.textSecondary },

  row: { ...cardStyle, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  rowTexts: { flex: 1, gap: 2 },
  rowName: { ...type.h4, fontFamily: fonts.semibold, color: colors.textPrimary },
  rowSub: { ...type.caption, color: colors.textSecondary },
  rowPills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 2 },
  trend: { flexDirection: "row", alignItems: "center", gap: 3 },
  trendText: { ...type.micro, letterSpacing: 0 },
  rowRight: { alignItems: "flex-end", gap: 3, minWidth: 64 },
  quality: { flexDirection: "row", alignItems: "baseline" },
  qualityText: { ...type.caption, fontFamily: fonts.bold, color: colors.textPrimary },
  qualityPot: { ...type.caption, color: colors.textTertiary },
  qualityTrack: { width: 52, height: 4, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  qualityFill: { height: 4, borderRadius: radius.pill, backgroundColor: colors.brandAccent },

  curve: { ...cardStyle, padding: space.md, gap: space.sm },
  curveHead: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  curveSub: { ...type.caption, color: colors.textSecondary },
  legend: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: radius.pill },
  legendText: { ...type.micro, letterSpacing: 0, color: colors.textTertiary, marginRight: 4 },
  bars: { flexDirection: "row", alignItems: "flex-end", height: 96, gap: 2 },
  barCol: { flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" },
  bar: { width: "100%", borderTopLeftRadius: radius.xs, borderTopRightRadius: radius.xs, backgroundColor: colors.surface3 },
  barPast: { opacity: 0.55 },
  barPeak: { backgroundColor: withAlpha(EL_INK, 0.7) },
  barNow: { backgroundColor: colors.brandAccent, opacity: 1 },
  axis: { height: 14 },
  axisText: { ...type.nano, position: "absolute", top: 0, width: 24, marginLeft: -12, color: colors.textTertiary, textAlign: "center" },
  axisNow: { color: colors.brandAccent, fontFamily: fonts.bold },
  curveNote: { ...type.caption, color: colors.textTertiary },

  sheet: { gap: space.lg, paddingBottom: space.lg },
  pHero: { flexDirection: "row", alignItems: "center", gap: space.md },
  pOver: { ...type.overline, color: colors.textTertiary },
  pAge: { ...type.h2, color: colors.textPrimary },
  pMeta: { ...type.caption, color: colors.textSecondary },
  stats: { flexDirection: "row", gap: space.sm },
  stat: { flex: 1, gap: 2, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2, alignItems: "flex-start" },
  statLabel: { ...type.micro, color: colors.textTertiary },
  statValue: { ...type.h2, fontFamily: fonts.bold, color: colors.textPrimary },
  statSub: { ...type.micro, letterSpacing: 0, color: colors.textTertiary },
  injury: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.dangerDim },
  injuryTitle: { ...type.labelSm, color: colors.danger },
  injuryText: { ...type.caption, color: colors.textSecondary },
  pOffer: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.brandDim },
  pOfferText: { ...type.labelSm, color: colors.textPrimary, flex: 1 },
  listRow: { ...cardStyle, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  listTitle: { ...type.labelSm, color: colors.textPrimary },
  listText: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  aNote: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  blockNote: { ...type.caption, color: colors.textTertiary },
  footer: { gap: space.sm },
  footerRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },

  effect: { flexDirection: "row", gap: space.md, alignItems: "flex-start", paddingVertical: space.xs },
  effectHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  effectTitle: { ...type.labelSm, color: colors.textPrimary, flex: 1 },
  effectStage: { ...type.micro, color: colors.textTertiary },
  effectText: { ...type.caption, color: colors.textSecondary },
  effectNext: { ...type.caption, color: colors.textTertiary, marginTop: 2 },

  hRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  hBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  hIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  hIconSold: { backgroundColor: withAlpha(EL_INK, 0.12) },
  hName: { ...type.labelSm, color: colors.textPrimary },
  hDetail: { ...type.caption, color: colors.textTertiary },
  hRight: { alignItems: "flex-end", gap: 1 },
  hAmount: { ...type.label, fontFamily: fonts.bold, color: EL_INK },
  hAgo: { ...type.micro, letterSpacing: 0, color: colors.textTertiary },
  more: { alignItems: "center", paddingVertical: space.sm, borderRadius: radius.md },
  moreText: { ...type.label, color: colors.brandAccent },

  privacy: { ...cardStyle, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  privacyIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  lead: { ...type.body, color: colors.textSecondary },
  block: { gap: space.sm },
  blockTitle: { ...type.h3, color: colors.textPrimary },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  infoText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  stagesRow: { flexDirection: "row", gap: space.xs },
  stageChip: { flex: 1, alignItems: "center", gap: 1, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  stageChipTitle: { ...type.labelXs, color: colors.textPrimary },
  stageChipAge: { ...type.micro, letterSpacing: 0, color: colors.textTertiary },

  celebrate: { alignItems: "center", gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg, borderRadius: radius.xxl, overflow: "hidden" },
  celebrateAmount: { ...type.scoreLg, color: CITY2_EL.gain },
  celebrateLine: { ...type.label, color: CITY_UI.white, textAlign: "center" },
  celebrateBalance: { marginTop: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: CITY2_UI.panelChip },
  celebrateBalanceText: { ...type.labelSm, color: CITY2_UI.panelMuted },

  cityCard: { ...cardStyle, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  cityTitle: { ...type.h3, color: colors.textPrimary },
  citySub: { ...type.caption, color: colors.textSecondary },
  offerBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandAccent },
  offerBadgeText: { ...type.micro, letterSpacing: 0, color: colors.textOnBrand },

  bSection: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface2 },
  bHead: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
});
