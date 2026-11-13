/**
 * KULÜP ŞEHRİ 2.0 · FAZ 2 — ELİT LİRA (EL).
 *
 * EL yalnız oyun içi kulüp kasasıdır: binaların işletme gelirinden kazanılır,
 * kulübü büyütmek (depo/personel yükseltmeleri) için harcanır. Satın alınmaz;
 * hiçbir metin oyun dışı bir karşılıktan söz etmez. Bütün sayılar sunucudan
 * gelir (city2.el, buildings[].income); istemci tutar yollamaz.
 *
 *   ElWallet        bakiye, saatlik/günlük NET, depolar, gider, "Topla"
 *   FormCard        gerçek hayat form çarpanı (oyuncu yolu önde, taraftar yolu)
 *   IncomeSection   bina penceresinde "Gelir": akışlar, depo, yükseltmeler
 *   SupportSection  destek binasının etkisi ("Halısaha gelirine +%4")
 *   ElHistorySheet  sayfalı EL defteri + günlük özet
 *   ElHowSheet      EL nedir (sunucunun `intro` metni)
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ChunkyButton } from "@/components/city/ChunkyButton";
import {
  BottomSheet,
  Button,
  Touchable,
  useReduceMotion,
} from "@/components/ui";
import {
  firstFullAt,
  fmtEl,
  fmtMult,
  fmtPct,
  fmtRate,
  incomeOf,
  untilText,
  type City2Building,
  type City2CollectResult,
  type City2El,
  type City2ElDay,
  type City2Form,
  type City2FormPart,
  type City2FormPath,
  type City2IncomeBuilding,
  type City2LedgerItem,
  type City2SupportEffect,
  type City2Upgrade,
  type City2UpgradeKind,
} from "@/lib/puzzle/city2";
import { CITY2_EL, CITY2_UI, CITY_UI } from "@/lib/puzzle/cityPalette";
import { useCity2ElHistory } from "@/lib/puzzle/useCity2";
import {
  colors,
  fonts,
  hairline,
  isDark,
  radius,
  space,
  textScale,
  type,
} from "@/theme";

import { BuildingIcon, cardStyle } from "./shared";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;
/** Açık kartlarda EL vurgusu. */
const EL_INK = isDark ? CITY2_EL.inkDark : CITY2_EL.ink;

const signed = (n: number, digits = 0) =>
  n > 0 ? `+${fmtEl(n, digits)}` : n < 0 ? `−${fmtEl(-n, digits)}` : "0";
const clamp01 = (v: number) =>
  Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/* ───────────────────────── Küçük parçalar ───────────────────────── */

/** EL jetonu: camgöbeği daire, içinde "EL". */
export function ElCoin({ size = 20 }: { size?: number }) {
  return (
    <LinearGradient
      colors={CITY2_EL.coin}
      start={TOP}
      end={BOTTOM}
      style={[styles.coin, { width: size, height: size }]}
    >
      <Text
        style={[size >= 36 ? styles.coinTextLg : styles.coinText]}
        {...textScale.badge}
      >
        EL
      </Text>
    </LinearGradient>
  );
}

/** "120 EL" — açık zeminde EL tutarı. */
export function ElCost({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <View style={styles.cost}>
      <ElCoin size={16} />
      <Text
        style={[styles.costText, muted ? styles.muted : null]}
        {...textScale.badge}
      >
        {fmtEl(value)}
      </Text>
    </View>
  );
}

/** Hedefe yumuşakça sayan sayı (bir kez; "hareketi azalt"ta doğrudan). */
function useCountUp(target: number) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const start = from.current;
    from.current = target;
    if (reduce || start === target) {
      setShown(target);
      return;
    }
    anim.setValue(0);
    const id = anim.addListener(({ value }) =>
      setShown(Math.round(start + (target - start) * value)),
    );
    const run = Animated.timing(anim, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    run.start(() => setShown(target));
    return () => {
      run.stop();
      anim.removeListener(id);
    };
  }, [anim, reduce, target]);
  return shown;
}

/** Toplama kutlaması: düğmeden yükselen birkaç jeton ve "+N EL" (bir kez). */
function CollectBurst({
  result,
  burstKey,
}: {
  result: City2CollectResult | null;
  burstKey: number;
}) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!burstKey || reduce) return;
    t.setValue(0);
    const run = Animated.timing(t, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [burstKey, reduce, t]);
  if (!result || result.collected <= 0 || reduce) return null;
  const coins = [-64, -30, 0, 32, 66];
  return (
    <View pointerEvents="none" style={styles.burst}>
      {coins.map((dx, i) => {
        const lift = 54 + (i % 2) * 18;
        return (
          <Animated.View
            key={i}
            style={[
              styles.burstCoin,
              {
                opacity: t.interpolate({
                  inputRange: [0, 0.15, 0.75, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    translateX: t.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, dx],
                    }),
                  },
                  {
                    translateY: t.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -lift],
                    }),
                  },
                  {
                    scale: t.interpolate({
                      inputRange: [0, 0.3, 1],
                      outputRange: [0.4, 1, 0.8],
                    }),
                  },
                ],
              },
            ]}
          >
            <ElCoin size={18} />
          </Animated.View>
        );
      })}
      <Animated.View
        style={[
          styles.burstLabel,
          {
            opacity: t.interpolate({
              inputRange: [0, 0.2, 0.8, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                translateY: t.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -86],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.burstText} {...textScale.badge}>
          +{fmtEl(result.net)} EL
        </Text>
      </Animated.View>
    </View>
  );
}

/* ═════════════════════════ CÜZDAN ═════════════════════════ */

export function ElWallet({
  el,
  buildings,
  collecting,
  result,
  burstKey,
  onCollect,
  onHistory,
  onHow,
  onBuilding,
}: {
  el: City2El;
  buildings: City2Building[];
  collecting: boolean;
  /** Son toplama yanıtı (sonuç şeridi ve kutlama). */
  result: City2CollectResult | null;
  burstKey: number;
  onCollect: () => void;
  onHistory: () => void;
  onHow: () => void;
  onBuilding: (key: string) => void;
}) {
  const balance = useCountUp(el.balance);
  const producing = buildings.filter((b) => {
    const inc = incomeOf(b);
    return b.open && inc && inc.per_hour > 0;
  });
  const fullAt = firstFullAt(buildings);
  const until = untilText(fullAt);
  const due = el.expenses.due;
  const can = el.collectable > 0;
  const netDay = el.per_day - el.expenses.per_day;
  const storeLine =
    el.full > 0
      ? el.full === producing.length
        ? "Bütün depolar dolu: üretim durdu"
        : `${el.full} binanın deposu dolu: üretimi durdu`
      : until
        ? `İlk depo ${until} sonra dolar`
        : producing.length
          ? null
          : "Gelir binası kurulunca üretim başlar";
  return (
    <View style={styles.wallet}>
      <LinearGradient
        colors={CITY2_UI.panel}
        start={TOP}
        end={BOTTOM}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.walletTop}>
        <ElCoin size={48} />
        <View style={styles.flex}>
          <View style={styles.balanceLine}>
            <Text style={styles.balance} {...textScale.dense}>
              {fmtEl(balance)}
            </Text>
            <Text style={styles.balanceUnit} {...textScale.badge}>
              EL
            </Text>
          </View>
          <Text style={styles.walletSub} numberOfLines={1} {...textScale.dense}>
            {el.title} · kulübünün kasası
          </Text>
        </View>
        <Touchable
          onPress={onHistory}
          feedback="icon"
          style={styles.walletIcon}
          accessibilityRole="button"
          accessibilityLabel="EL geçmişi"
        >
          <Ionicons
            name="receipt-outline"
            size={21}
            color={CITY2_UI.panelMuted}
          />
        </Touchable>
        <Touchable
          onPress={onHow}
          feedback="icon"
          style={styles.walletIcon}
          accessibilityRole="button"
          accessibilityLabel="Elit Lira nedir"
        >
          <Ionicons
            name="help-circle-outline"
            size={23}
            color={CITY2_UI.panelMuted}
          />
        </Touchable>
      </View>

      <View style={styles.rates}>
        <Rate
          label="Gelir"
          value={`+${fmtEl(el.per_day)}`}
          sub={`${fmtRate(el.per_hour)}/sa`}
          tone="gain"
        />
        <Rate
          label="Gider"
          value={`−${fmtEl(el.expenses.per_day)}`}
          sub={`${fmtRate(el.expenses.per_hour)}/sa`}
          tone="cost"
        />
        <Rate
          label="Net"
          value={signed(netDay)}
          sub={`${signed(el.net_per_hour, 1)}/sa`}
          tone="net"
        />
      </View>
      <Text style={styles.ratesCaption} {...textScale.dense}>
        Günlük · form {el.form.text} ile
      </Text>

      {producing.length ? (
        <View style={styles.store}>
          <View style={styles.storeHead}>
            <Text style={styles.storeTitle} {...textScale.dense}>
              Depolarda {fmtEl(el.stored)} / {fmtEl(el.cap)} EL
            </Text>
            {storeLine ? (
              <View style={styles.storeNote}>
                <Ionicons
                  name={el.full > 0 ? "alert-circle" : "time-outline"}
                  size={13}
                  color={el.full > 0 ? CITY2_EL.full : CITY2_UI.panelMuted}
                />
                <Text
                  style={[
                    styles.storeNoteText,
                    el.full > 0 ? styles.storeNoteFull : null,
                  ]}
                  numberOfLines={1}
                  {...textScale.badge}
                >
                  {storeLine}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.meters}>
            {producing.map((b) => {
              const inc = incomeOf(b) as City2IncomeBuilding;
              return (
                <Touchable
                  key={b.key}
                  onPress={() => onBuilding(b.key)}
                  feedback="chip"
                  style={styles.meter}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.title}: depoda ${inc.stored} / ${inc.cap} EL${inc.full ? ", dolu" : ""}`}
                >
                  <BuildingIcon buildingKey={b.key} icon={b.icon} size={26} />
                  <View style={styles.meterTrack}>
                    <View
                      style={[
                        styles.meterFill,
                        {
                          width:
                            `${Math.round(clamp01(inc.cap ? inc.stored_exact / inc.cap : 0) * 100)}%` as const,
                        },
                        inc.full ? styles.meterFull : null,
                      ]}
                    />
                  </View>
                </Touchable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View>
        <CollectBurst result={result} burstKey={burstKey} />
        <ChunkyButton
          label={
            collecting
              ? "TOPLANIYOR…"
              : can
                ? `HEPSİNİ TOPLA · +${fmtEl(el.collectable)} EL`
                : "TOPLANACAK EL YOK"
          }
          icon="arrow-down-circle"
          tone="green"
          disabled={!can || collecting}
          onPress={onCollect}
          accessibilityLabel={
            can
              ? `Bütün depolardaki ${el.collectable} EL'i topla`
              : "Toplanacak EL yok"
          }
        />
      </View>
      {result && result.collected > 0 ? (
        <View style={styles.result}>
          <Ionicons name="checkmark-circle" size={16} color={CITY2_EL.gain} />
          <Text style={styles.resultText} {...textScale.dense}>
            +{fmtEl(result.collected)} toplandı
            {result.expense > 0 ? ` · −${fmtEl(result.expense)} gider` : ""} ·
            net {signed(result.net)} EL
          </Text>
        </View>
      ) : (
        <Text style={styles.walletHint} {...textScale.dense}>
          {can && due > 0
            ? `Toplarken ${fmtRate(el.expenses.due_hours)} saatlik maaş ve bakım düşülür: −${fmtEl(due)} EL`
            : `Bugün ${signed(el.today.earned)} kazanıldı · −${fmtEl(el.today.expense)} gider`}
        </Text>
      )}
    </View>
  );
}

function Rate({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "gain" | "cost" | "net";
}) {
  return (
    <View style={[styles.rate, tone === "net" ? styles.rateNet : null]}>
      <Text style={styles.rateLabel} {...textScale.badge}>
        {label}
      </Text>
      <Text
        style={[
          styles.rateValue,
          tone === "cost"
            ? styles.rateCost
            : tone === "gain"
              ? styles.rateGain
              : null,
        ]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {value}
      </Text>
      <Text style={styles.rateSub} numberOfLines={1} {...textScale.badge}>
        {sub}
      </Text>
    </View>
  );
}

/* ═════════════════════════ FORM ÇARPANI ═════════════════════════ */

/** Kalemin "elde" metni. */
function haveText(p: City2FormPart): string {
  if (p.key === "rating") {
    if (p.have == null || (p.rated ?? 0) < (p.min_rated ?? 0))
      return `en az ${p.min_rated ?? 2} maç`;
    return `${p.have.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ort.`;
  }
  const have = Number(p.have ?? 0);
  return p.cap
    ? `${fmtEl(Math.min(have, p.cap))}/${fmtEl(p.cap)}`
    : fmtEl(have);
}

const PART_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  matches: "football",
  extra_matches: "add-circle",
  rating: "stats-chart",
  wins: "trophy",
  motm: "medal",
  predictions: "analytics",
  correct: "checkmark-done",
  votes: "hand-left",
  fantasy_weeks: "people",
};

function PartRow({ p }: { p: City2FormPart }) {
  const full = p.max > 0 && p.value >= p.max - 1e-6;
  return (
    <View style={styles.part}>
      <Ionicons
        name={PART_ICON[p.key] ?? "ellipse"}
        size={15}
        color={full ? colors.win : colors.textTertiary}
      />
      <View style={styles.partTexts}>
        <View style={styles.partHead}>
          <Text style={styles.partLabel} numberOfLines={1} {...textScale.dense}>
            {p.label}
          </Text>
          <Text style={styles.partHave} {...textScale.badge}>
            {haveText(p)}
          </Text>
        </View>
        <View style={styles.partTrack}>
          <View
            style={[
              styles.partFill,
              {
                width:
                  `${Math.round(clamp01(p.max ? p.value / p.max : 0) * 100)}%` as const,
              },
              full ? styles.partFillFull : null,
            ]}
          />
        </View>
      </View>
      <Text
        style={[styles.partValue, p.value > 0 ? null : styles.muted]}
        {...textScale.badge}
      >
        +
        {p.value.toLocaleString("tr-TR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </Text>
    </View>
  );
}

/** ×0,6 – ×1,6 göstergesi: dolum, ×1,0 çizgisi, taraftar tavanı. */
function Gauge({ form, cap }: { form: City2Form; cap?: number | null }) {
  const span = form.max - form.min || 1;
  const at = (v: number) =>
    `${Math.round(clamp01((v - form.min) / span) * 100)}%` as const;
  const low = form.multiplier < 1;
  return (
    <View>
      <View style={styles.gauge}>
        <View
          style={[
            styles.gaugeFill,
            { width: at(form.multiplier) },
            low ? styles.gaugeLow : null,
          ]}
        />
        <View style={[styles.gaugeTick, { left: at(1) }]} />
        {cap ? <View style={[styles.gaugeCap, { left: at(cap) }]} /> : null}
      </View>
      <View style={styles.gaugeScale}>
        <Text style={styles.gaugeText} {...textScale.badge}>
          {fmtMult(form.min)}
        </Text>
        <Text style={styles.gaugeText} {...textScale.badge}>
          {cap ? `taraftar tavanı ${fmtMult(cap)}` : fmtMult(1)}
        </Text>
        <Text style={styles.gaugeText} {...textScale.badge}>
          {fmtMult(form.max)}
        </Text>
      </View>
    </View>
  );
}

export function FormCard({ form }: { form: City2Form }) {
  const [fanOpen, setFanOpen] = useState(false);
  const player = form.player.available;
  const main: City2FormPath = player ? form.player : form.fan;
  const none = form.path === "none";
  const tone = none || form.multiplier < 1 ? colors.warn : colors.win;
  const showHeadline = player && !form.tip.startsWith(form.headline);
  return (
    <View style={styles.form}>
      <View style={styles.formHead}>
        <View style={styles.formIcon}>
          <Ionicons
            name={player ? "football" : "megaphone"}
            size={20}
            color={colors.brandAccent}
          />
        </View>
        <View style={styles.flex}>
          <Text style={styles.formOver} {...textScale.badge}>
            GERÇEK HAYAT FORMU
          </Text>
          <Text style={styles.formTitle} numberOfLines={1} {...textScale.dense}>
            {player ? "Oyuncu yolu" : "Taraftar yolu"} · son {form.days} gün
          </Text>
        </View>
        <View style={styles.formMult}>
          <Text
            style={[styles.formMultText, { color: tone }]}
            {...textScale.dense}
          >
            {form.text}
          </Text>
          <Text style={styles.formMultSub} {...textScale.badge}>
            gelir çarpanı
          </Text>
        </View>
      </View>

      <Gauge form={form} cap={player ? null : form.fan.max} />

      {none ? (
        <View style={styles.noneBox}>
          <Ionicons name="pause-circle" size={18} color={colors.warn} />
          <Text style={styles.noneText} {...textScale.long}>
            Son {form.days} günde gerçek hayatta etkinlik yok: gelirin taban{" "}
            {fmtMult(form.min)} ile üretiliyor.
          </Text>
        </View>
      ) : showHeadline ? (
        <Text style={styles.formHeadline} {...textScale.long}>
          {form.headline}
        </Text>
      ) : null}

      <View style={styles.parts}>
        {main.parts.map((p) => (
          <PartRow key={p.key} p={p} />
        ))}
      </View>

      <View style={styles.tip}>
        <Ionicons name="trending-up" size={16} color={colors.brandAccent} />
        <Text style={styles.tipText} {...textScale.long}>
          {form.tip}
        </Text>
      </View>

      {player ? (
        <View>
          <Touchable
            onPress={() => setFanOpen((v) => !v)}
            feedback="row"
            style={styles.fanRow}
            accessibilityRole="button"
            accessibilityState={{ expanded: fanOpen }}
            accessibilityLabel={`Taraftar yolu ${fmtMult(form.fan.multiplier)}, tavan ${fmtMult(form.fan.max)}`}
          >
            <Ionicons
              name="megaphone-outline"
              size={15}
              color={colors.textTertiary}
            />
            <Text style={styles.fanText} numberOfLines={1} {...textScale.dense}>
              Taraftar yolu {fmtMult(form.fan.multiplier)} · tavan{" "}
              {fmtMult(form.fan.max)}
              {form.path === "fan" ? " · geçerli" : ""}
            </Text>
            <Ionicons
              name={fanOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textTertiary}
            />
          </Touchable>
          {fanOpen ? (
            <View style={styles.fanParts}>
              <Text style={styles.fanLead} {...textScale.long}>
                İki yolun büyüğü geçerlidir. Tahmin, maçın oyuncusu oyu ve
                Fantezi de geliri artırır.
              </Text>
              {form.fan.parts.map((p) => (
                <PartRow key={p.key} p={p} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/* ═════════════════════════ BİNA: GELİR ═════════════════════════ */

function UpgradeCard({
  kind,
  u,
  stage,
  balance,
  busy,
  onBuy,
}: {
  kind: City2UpgradeKind;
  u: City2Upgrade;
  stage: number;
  balance: number;
  busy: boolean;
  onBuy: () => void;
}) {
  const next = u.next;
  const blocked = next?.blocked ?? null;
  const short = next ? Math.max(0, next.cost - balance) : 0;
  const off = !next || Boolean(blocked) || short > 0 || busy;
  return (
    <View style={styles.upg}>
      <View style={styles.upgHead}>
        <View style={styles.upgIcon}>
          <Ionicons
            name={kind === "depo" ? "archive" : "people"}
            size={18}
            color={EL_INK}
          />
        </View>
        <View style={styles.flex}>
          <Text style={styles.upgTitle} {...textScale.dense}>
            {u.title}
          </Text>
          <Text style={styles.upgText} numberOfLines={2} {...textScale.long}>
            {u.text}
          </Text>
        </View>
        <View
          style={styles.levels}
          accessibilityLabel={`Seviye ${u.level}/${u.max}`}
        >
          {Array.from({ length: u.max }, (_, i) => (
            <View
              key={i}
              style={[styles.levelPip, i < u.level ? styles.levelOn : null]}
            />
          ))}
        </View>
      </View>
      {next ? (
        <View style={styles.upgFoot}>
          <Text style={styles.upgMeta} numberOfLines={2} {...textScale.dense}>
            {blocked
              ? `${blocked.stage ?? next.min_stage}. aşamada açılır (şu an ${stage}. aşama)`
              : short > 0
                ? `${next.level}. seviye · ${fmtEl(short)} EL eksik`
                : `${next.level}. seviye · aşama ${next.min_stage}+`}
          </Text>
          <Touchable
            onPress={onBuy}
            disabled={off}
            haptic="success"
            style={[styles.upgBtn, off ? styles.upgBtnOff : null]}
            accessibilityRole="button"
            accessibilityState={{ disabled: off }}
            accessibilityLabel={`${u.title} ${next.level}. seviye, ${next.cost} EL`}
          >
            {busy ? (
              <ActivityIndicator size="small" color={CITY_UI.white} />
            ) : (
              <>
                {blocked ? (
                  <Ionicons
                    name="lock-closed"
                    size={12}
                    color={colors.textTertiary}
                  />
                ) : (
                  <ElCoin size={16} />
                )}
                <Text
                  style={[styles.upgBtnText, off ? styles.upgBtnTextOff : null]}
                  {...textScale.badge}
                >
                  {fmtEl(next.cost)}
                </Text>
              </>
            )}
          </Touchable>
        </View>
      ) : (
        <View style={styles.upgFoot}>
          <Ionicons name="checkmark-circle" size={15} color={colors.win} />
          <Text style={styles.upgMeta} {...textScale.dense}>
            En üst seviye
          </Text>
        </View>
      )}
    </View>
  );
}

export function IncomeSection({
  b,
  inc,
  el,
  busy,
  collecting,
  onCollect,
  onUpgrade,
}: {
  b: City2Building;
  inc: City2IncomeBuilding;
  el: City2El | null;
  busy: boolean;
  collecting: boolean;
  onCollect: () => void;
  onUpgrade: (kind: City2UpgradeKind) => void;
}) {
  const producing = b.open && inc.per_hour > 0;
  const until = untilText(inc.full_at);
  const gain =
    inc.next_stage_per_hour != null
      ? inc.next_stage_per_hour - inc.per_hour
      : null;
  const breakdown = [
    `taban ${fmtRate(inc.base_per_hour)}`,
    inc.boost_pct ? `destek +${fmtPct(inc.boost_pct)}` : null,
    inc.staff_pct ? `personel +${fmtPct(inc.staff_pct)}` : null,
    `form ${fmtMult(inc.multiplier)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text style={styles.blockTitle} {...textScale.dense}>
          Gelir
        </Text>
        {producing ? (
          <View style={styles.cost}>
            <ElCoin size={16} />
            <Text style={styles.rateBig} {...textScale.badge}>
              {fmtRate(inc.per_hour)} EL/saat
            </Text>
          </View>
        ) : null}
      </View>

      {producing ? (
        <View style={styles.incCard}>
          <View style={styles.incStoreHead}>
            <Text style={styles.incStore} {...textScale.dense}>
              Depoda {fmtEl(inc.stored)} / {fmtEl(inc.cap)} EL
            </Text>
            <Text
              style={[styles.incStoreMeta, inc.full ? styles.warnText : null]}
              numberOfLines={1}
              {...textScale.badge}
            >
              {inc.full
                ? "Dolu · üretim durdu"
                : until
                  ? `${until} sonra dolar`
                  : `${inc.cap_hours} saatlik depo`}
            </Text>
          </View>
          <View style={styles.incTrack}>
            <View
              style={[
                styles.incFill,
                {
                  width:
                    `${Math.round(clamp01(inc.cap ? inc.stored_exact / inc.cap : 0) * 100)}%` as const,
                },
                inc.full ? styles.incFillFull : null,
              ]}
            />
          </View>
          {inc.text ? (
            <Text style={styles.incText} {...textScale.long}>
              {inc.text}
            </Text>
          ) : null}
          <Button
            label={
              inc.collectable > 0
                ? `Topla · +${fmtEl(inc.collectable)} EL`
                : "Depo boş"
            }
            icon="arrow-down-circle-outline"
            size="sm"
            variant={inc.collectable > 0 ? "primary" : "secondary"}
            disabled={inc.collectable < 1 || busy}
            loading={collecting}
            onPress={onCollect}
          />
          <Text style={styles.incMeta} {...textScale.dense}>
            Günde {fmtEl(inc.per_day)} EL · {breakdown}
          </Text>
        </View>
      ) : (
        <View style={styles.incCard}>
          <Text style={styles.incText} {...textScale.long}>
            {b.open
              ? "Bu bina henüz gelir getirmiyor: ilk gelir akışı aşama kurulunca başlar."
              : "Bina açılınca işletme geliri üretmeye başlar."}
          </Text>
        </View>
      )}

      <View style={styles.streams}>
        {inc.streams.map((s) => (
          <View key={s.key} style={styles.stream}>
            <Ionicons
              name={s.active ? "checkmark-circle" : "lock-closed-outline"}
              size={16}
              color={s.active ? colors.win : colors.textTertiary}
            />
            <Text
              style={[styles.streamTitle, s.active ? null : styles.muted]}
              numberOfLines={1}
              {...textScale.dense}
            >
              {s.title}
            </Text>
            <Text
              style={[styles.streamValue, s.active ? null : styles.muted]}
              {...textScale.badge}
            >
              {s.active
                ? `${fmtRate(s.base_per_hour)}/sa`
                : `${s.from}. aşamada`}
            </Text>
          </View>
        ))}
      </View>

      {inc.next_stage_per_hour != null && gain != null ? (
        <View style={styles.nextInc}>
          <Ionicons name="arrow-up-circle" size={16} color={EL_INK} />
          <Text style={styles.nextIncText} {...textScale.dense}>
            {b.stage === 0 || !producing ? "Kurulunca" : "Sıradaki aşamayla"}{" "}
            {fmtRate(inc.next_stage_per_hour)} EL/saat
            {producing && gain > 0 ? ` (+${fmtRate(gain)})` : ""}
          </Text>
        </View>
      ) : null}

      {b.open ? (
        <>
          <Text style={styles.subTitle} {...textScale.dense}>
            Yükseltmeler · EL ile
          </Text>
          {(["depo", "personel"] as const).map((k) =>
            inc.upgrades[k] ? (
              <UpgradeCard
                key={k}
                kind={k}
                u={inc.upgrades[k] as City2Upgrade}
                stage={b.stage}
                balance={el?.balance ?? 0}
                busy={busy}
                onBuy={() => onUpgrade(k)}
              />
            ) : null,
          )}
          {el ? (
            <Text style={styles.incMeta} {...textScale.dense}>
              Kasada {fmtEl(el.balance)} EL · yükseltmeler isteğe bağlıdır,
              yıldızla ilerlemeyi değiştirmez.
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function SupportSection({
  effect,
  open,
  titles,
}: {
  effect: City2SupportEffect;
  open: boolean;
  titles: Record<string, string>;
}) {
  const income = effect.kind === "income";
  const pct = `${income ? "+" : "−"}${fmtPct(effect.pct)}`;
  const names = (effect.targets ?? []).map((k) => titles[k] ?? k);
  const where = !income
    ? "Giderlerden"
    : names.length
      ? `${names.length > 1 ? `${names.slice(0, -1).join(", ")} ve ${names.at(-1)}` : names[0]} gelirine`
      : "Bütün gelirlere";
  const now = `${where} ${pct}`;
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle} {...textScale.dense}>
        Etki
      </Text>
      <View style={styles.effect}>
        <View style={styles.upgIcon}>
          <Ionicons
            name={income ? "trending-up" : "trending-down"}
            size={18}
            color={EL_INK}
          />
        </View>
        <View style={styles.flex}>
          <Text style={styles.effectNow} {...textScale.dense}>
            {now}
            {open ? "" : " · bina kapalı"}
          </Text>
          <Text style={styles.upgText} {...textScale.long}>
            {effect.text}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ═════════════════════════ GEÇMİŞ ═════════════════════════ */

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  production: "arrow-down-circle",
  expense: "people-circle",
  spend: "construct",
  bonus: "gift",
  admin: "create",
};

const DAY_FMT = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
};

function dayTitle(day: string): string {
  const now = new Date();
  const key = (d: Date) =>
    d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  if (day === key(now)) return "Bugün";
  if (day === key(new Date(now.getTime() - 86400e3))) return "Dün";
  return DAY_FMT(day);
}

const timeOf = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Istanbul",
      })
    : "";

function rowTitle(i: City2LedgerItem): string {
  const d = i.data ?? {};
  if (i.kind === "production") return `${i.building_title ?? "Bina"} geliri`;
  if (i.kind === "expense")
    return `Maaş ve bakım${d.hours ? ` · ${fmtRate(Number(d.hours))} saat` : ""}`;
  if (i.kind === "spend") {
    const up =
      d.upgrade === "depo"
        ? "Depo"
        : d.upgrade === "personel"
          ? "Personel"
          : "Yükseltme";
    return `${i.building_title ?? ""} · ${up}${d.level ? ` ${d.level}. seviye` : ""}`.replace(
      /^ · /,
      "",
    );
  }
  if (i.kind === "bonus")
    return typeof d.note === "string" && d.note ? d.note : "Hediye EL";
  return typeof d.note === "string" && d.note ? d.note : "Kasa düzeltmesi";
}

function rowSub(i: City2LedgerItem): string {
  const d = i.data ?? {};
  const parts = [timeOf(i.at)];
  if (i.kind === "production" && i.multiplier != null)
    parts.push(`form ${fmtMult(i.multiplier)}`);
  if (i.kind === "expense" && d.salary != null)
    parts.push(
      `maaş ${fmtEl(Number(d.salary))} · bakım ${fmtEl(Number(d.maintenance ?? 0))}`,
    );
  parts.push(`kasa ${fmtEl(i.balance_after)}`);
  return parts.filter(Boolean).join(" · ");
}

function LedgerRow({ i, last }: { i: City2LedgerItem; last?: boolean }) {
  const plus = i.amount > 0;
  return (
    <View style={[styles.ledger, last ? styles.ledgerLast : null]}>
      <View style={[styles.ledgerIcon, plus ? styles.ledgerIconPlus : null]}>
        <Ionicons
          name={KIND_ICON[i.kind] ?? "ellipse"}
          size={17}
          color={plus ? EL_INK : colors.textSecondary}
        />
      </View>
      <View style={styles.flex}>
        <Text style={styles.ledgerTitle} numberOfLines={1} {...textScale.dense}>
          {rowTitle(i)}
        </Text>
        <Text style={styles.ledgerSub} numberOfLines={1} {...textScale.dense}>
          {rowSub(i)}
        </Text>
      </View>
      <Text
        style={[styles.ledgerAmount, plus ? styles.plus : null]}
        {...textScale.badge}
      >
        {signed(i.amount)}
      </Text>
    </View>
  );
}

function DaySummary({ days }: { days: Record<string, City2ElDay> }) {
  const keys = Object.keys(days).sort().reverse().slice(0, 7);
  if (!keys.length) return null;
  const week = keys.reduce(
    (s, k) => ({
      earned: s.earned + days[k].earned,
      expense: s.expense + days[k].expense,
      spent: s.spent + days[k].spent,
    }),
    { earned: 0, expense: 0, spent: 0 },
  );
  return (
    <View style={styles.days}>
      <View style={styles.daysHead}>
        <Text style={styles.subTitle} {...textScale.dense}>
          Günlük özet
        </Text>
        <Text style={styles.daysMeta} {...textScale.dense}>
          son {keys.length} gün: {signed(week.earned)} · −{fmtEl(week.expense)}{" "}
          gider
        </Text>
      </View>
      <View style={styles.daysTable}>
        <View style={styles.dayRow}>
          <Text
            style={[styles.dayCell, styles.dayName, styles.dayHeadText]}
            {...textScale.badge}
          >
            Gün
          </Text>
          <Text
            style={[styles.dayCell, styles.dayHeadText]}
            {...textScale.badge}
          >
            Gelir
          </Text>
          <Text
            style={[styles.dayCell, styles.dayHeadText]}
            {...textScale.badge}
          >
            Gider
          </Text>
          <Text
            style={[styles.dayCell, styles.dayHeadText]}
            {...textScale.badge}
          >
            Harcanan
          </Text>
        </View>
        {keys.map((k) => (
          <View key={k} style={styles.dayRow}>
            <Text
              style={[styles.dayCell, styles.dayName]}
              numberOfLines={1}
              {...textScale.dense}
            >
              {dayTitle(k).replace(
                / (Pazartesi|Salı|Çarşamba|Perşembe|Cuma|Cumartesi|Pazar)$/,
                "",
              )}
            </Text>
            <Text style={[styles.dayCell, styles.plus]} {...textScale.badge}>
              {signed(days[k].earned)}
            </Text>
            <Text style={styles.dayCell} {...textScale.badge}>
              {days[k].expense ? `−${fmtEl(days[k].expense)}` : "0"}
            </Text>
            <Text style={styles.dayCell} {...textScale.badge}>
              {days[k].spent ? `−${fmtEl(days[k].spent)}` : "0"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ElHistorySheet({
  visible,
  onClose,
  el,
}: {
  visible: boolean;
  onClose: () => void;
  el: City2El | null;
}) {
  const q = useCity2ElHistory(visible && Boolean(el));
  const items = useMemo(
    () => q.data?.pages.flatMap((p) => p.items) ?? [],
    [q.data],
  );
  const groups = useMemo(() => {
    const out: { day: string; items: City2LedgerItem[]; net: number }[] = [];
    for (const i of items) {
      const day = i.day ?? (i.at ? i.at.slice(0, 10) : "");
      let g = out.at(-1);
      if (!g || g.day !== day) {
        g = { day, items: [], net: 0 };
        out.push(g);
      }
      g.items.push(i);
      g.net += i.amount;
    }
    return out;
  }, [items]);
  const first = q.data?.pages[0];
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="EL geçmişi"
      snap="full"
    >
      <View style={styles.history}>
        {el ? (
          <View style={styles.totals}>
            <Total label="Kasa" value={fmtEl(first?.balance ?? el.balance)} />
            <Total
              label="Kazanılan"
              value={`+${fmtEl(first?.earned_total ?? el.earned_total)}`}
              plus
            />
            <Total
              label="Gider"
              value={`−${fmtEl(first?.expense_total ?? el.expense_total)}`}
            />
            <Total
              label="Harcanan"
              value={`−${fmtEl(first?.spent_total ?? el.spent_total)}`}
            />
          </View>
        ) : null}
        <DaySummary days={first?.days ?? el?.days ?? {}} />
        <Text style={styles.subTitle} {...textScale.dense}>
          Hareketler
        </Text>
        {q.isLoading ? (
          <ActivityIndicator color={colors.textTertiary} />
        ) : q.isError ? (
          <Text style={styles.incText} {...textScale.long}>
            Geçmiş şu an yüklenemedi. Biraz sonra yeniden dene.
          </Text>
        ) : !items.length ? (
          <Text style={styles.incText} {...textScale.long}>
            Henüz hareket yok. İlk toplamadan sonra her gelir, gider ve
            yükseltme burada görünür.
          </Text>
        ) : (
          groups.map((g) => (
            <View key={g.day} style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle} {...textScale.dense}>
                  {dayTitle(g.day)}
                </Text>
                <Text
                  style={[styles.groupNet, g.net > 0 ? styles.plus : null]}
                  {...textScale.badge}
                >
                  {signed(g.net)} EL
                </Text>
              </View>
              <View style={styles.groupCard}>
                {g.items.map((i, n) => (
                  <LedgerRow key={i.id} i={i} last={n === g.items.length - 1} />
                ))}
              </View>
            </View>
          ))
        )}
        {q.hasNextPage ? (
          <Button
            label="Daha eski hareketler"
            icon="chevron-down"
            variant="secondary"
            size="sm"
            loading={q.isFetchingNextPage}
            onPress={() => void q.fetchNextPage()}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}

function Total({
  label,
  value,
  plus,
}: {
  label: string;
  value: string;
  plus?: boolean;
}) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalLabel} {...textScale.badge}>
        {label}
      </Text>
      <Text
        style={[styles.totalValue, plus ? styles.plus : null]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {value}
      </Text>
    </View>
  );
}

/* ═════════════════════════ NEDİR ═════════════════════════ */

export function ElHowSheet({
  visible,
  onClose,
  el,
}: {
  visible: boolean;
  onClose: () => void;
  el: City2El | null;
}) {
  const rows: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    text: string;
  }[] = el
    ? [
        {
          icon: "business",
          title: "Binalar üretir",
          text: "Halısaha, stadyum, restoran, mağaza, Kulüp TV ve kamp oteli her saat EL üretir. Her aşama ve açılan iç kilit geliri artırır.",
        },
        {
          icon: "archive",
          title: "Depo dolunca durur",
          text: "Her bina birkaç saatlik üretimi biriktirir. Dolunca üretim durur; arada gelip topla.",
        },
        {
          icon: "people",
          title: "Giderler dürüstçe düşülür",
          text: `${el.expenses.text} Şu an günde ${fmtEl(el.expenses.salary_day)} maaş + ${fmtEl(el.expenses.maintenance_day)} bakım.`,
        },
        {
          icon: "football",
          title: "Gerçek futbol geliri artırır",
          text: "Son 4 haftadaki maçların, reytingin, galibiyetlerin ya da taraftar etkinliklerin gelir çarpanını ×0,6 ile ×1,6 arasında belirler.",
        },
        {
          icon: "construct",
          title: "EL ile yükselt",
          text: "Depo ve Personel yükseltmeleri EL ile alınır. EL yalnız oyunda kazanılır ve harcanır.",
        },
      ]
    : [];
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Elit Lira nedir?"
      snap="half"
    >
      {el ? (
        <View style={styles.how}>
          <View style={styles.howLead}>
            <ElCoin size={40} />
            <Text style={[styles.incText, styles.flex]} {...textScale.long}>
              {el.intro}
            </Text>
          </View>
          {rows.map((r) => (
            <View key={r.title} style={styles.howRow}>
              <View style={styles.upgIcon}>
                <Ionicons name={r.icon} size={17} color={EL_INK} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.upgTitle} {...textScale.dense}>
                  {r.title}
                </Text>
                <Text style={styles.upgText} {...textScale.long}>
                  {r.text}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </BottomSheet>
  );
}

/** Bina satırındaki küçük EL özeti ("2,4/sa" ya da "DOLU"). */
export function IncomeChip({ inc }: { inc: City2IncomeBuilding }) {
  if (inc.per_hour <= 0) return null;
  return (
    <View style={[styles.chip, inc.full ? styles.chipFull : null]}>
      {inc.full ? (
        <Ionicons name="alert-circle" size={11} color={colors.warn} />
      ) : (
        <ElCoin size={13} />
      )}
      <Text
        style={[styles.chipText, inc.full ? styles.warnText : null]}
        {...textScale.badge}
      >
        {inc.full ? "DEPO DOLU" : `${fmtRate(inc.per_hour)}/sa`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: colors.textTertiary },
  plus: { color: EL_INK },
  warnText: { color: colors.warn },
  coin: {
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: CITY2_EL.coinEdge,
  },
  coinText: {
    ...type.nano,
    fontFamily: fonts.bold,
    color: CITY_UI.white,
    letterSpacing: 0,
  },
  coinTextLg: { ...type.label, fontFamily: fonts.bold, color: CITY_UI.white },
  cost: { flexDirection: "row", alignItems: "center", gap: 4 },
  costText: { ...type.numSmStrong, color: colors.textPrimary },

  wallet: {
    borderRadius: radius.xxl,
    padding: space.lg,
    gap: space.md,
    overflow: "hidden",
    borderWidth: hairline,
    borderColor: CITY2_UI.panelEdge,
  },
  walletTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  balanceLine: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  balance: { ...type.display, fontFamily: fonts.bold, color: CITY_UI.white },
  balanceUnit: { ...type.label, fontFamily: fonts.bold, color: CITY2_EL.gain },
  walletSub: { ...type.bodySm, color: CITY2_UI.panelMuted },
  walletIcon: { padding: space.xs },
  rates: { flexDirection: "row", gap: space.sm },
  rate: {
    flex: 1,
    alignItems: "center",
    gap: 1,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: CITY2_UI.panelChip,
  },
  rateNet: {
    borderWidth: hairline,
    borderColor: CITY2_UI.panelEdge,
    backgroundColor: CITY2_EL.track,
  },
  rateLabel: { ...type.micro, color: CITY2_UI.panelMuted },
  rateValue: { ...type.h3, fontFamily: fonts.bold, color: CITY_UI.white },
  rateGain: { color: CITY2_EL.gain },
  rateCost: { color: CITY2_EL.cost },
  rateSub: { ...type.micro, color: CITY2_UI.panelMuted, letterSpacing: 0 },
  ratesCaption: {
    ...type.caption,
    color: CITY2_UI.panelMuted,
    textAlign: "center",
    marginTop: -space.xs,
  },
  store: { gap: space.sm },
  storeHead: { gap: 2 },
  storeTitle: { ...type.labelSm, color: CITY_UI.white },
  storeNote: { flexDirection: "row", alignItems: "center", gap: 4 },
  storeNoteText: { ...type.caption, color: CITY2_UI.panelMuted, flexShrink: 1 },
  storeNoteFull: { color: CITY2_EL.full },
  meters: { flexDirection: "row", gap: space.xs },
  meter: {
    flex: 1,
    maxWidth: 64,
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: CITY2_UI.panelChip,
  },
  meterTrack: {
    alignSelf: "stretch",
    marginHorizontal: space.sm,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: CITY2_EL.track,
    overflow: "hidden",
  },
  meterFill: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: CITY2_EL.gain,
  },
  meterFull: { backgroundColor: CITY2_EL.full },
  result: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  resultText: { ...type.labelSm, color: CITY_UI.white },
  walletHint: {
    ...type.caption,
    color: CITY2_UI.panelMuted,
    textAlign: "center",
  },
  burst: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 18,
    alignItems: "center",
    zIndex: 2,
  },
  burstCoin: { position: "absolute" },
  burstLabel: {
    position: "absolute",
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: CITY2_UI.panel[1],
  },
  burstText: { ...type.label, fontFamily: fonts.bold, color: CITY2_EL.gain },

  form: { ...cardStyle, padding: space.lg, gap: space.md },
  formHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  formIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  formOver: { ...type.overline, color: colors.textTertiary },
  formTitle: { ...type.h3, color: colors.textPrimary },
  formMult: { alignItems: "flex-end" },
  formMultText: { ...type.scoreSm, fontFamily: fonts.bold },
  formMultSub: { ...type.micro, color: colors.textTertiary, letterSpacing: 0 },
  formHeadline: {
    ...type.bodySm,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  gauge: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  gaugeFill: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.win,
  },
  gaugeLow: { backgroundColor: colors.warn },
  gaugeTick: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.surface1,
  },
  gaugeCap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 3,
    marginLeft: -1,
    backgroundColor: colors.textTertiary,
  },
  gaugeScale: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.xxs,
  },
  gaugeText: { ...type.micro, color: colors.textTertiary, letterSpacing: 0 },
  noneBox: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "flex-start",
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.warnDim,
  },
  noneText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  parts: { gap: space.sm },
  part: { flexDirection: "row", alignItems: "center", gap: space.sm },
  partTexts: { flex: 1, gap: 3 },
  partHead: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  partLabel: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  partHave: { ...type.caption, color: colors.textTertiary },
  partTrack: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  partFill: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.brandAccent,
  },
  partFillFull: { backgroundColor: colors.win },
  partValue: {
    ...type.numSmStrong,
    color: colors.textPrimary,
    minWidth: 40,
    textAlign: "right",
  },
  tip: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "flex-start",
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.brandDim,
  },
  tipText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  fanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 36,
    borderRadius: radius.md,
  },
  fanText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  fanParts: { gap: space.sm, paddingTop: space.xs },
  fanLead: { ...type.caption, color: colors.textTertiary },

  block: { gap: space.sm },
  blockHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  blockTitle: { ...type.h3, color: colors.textPrimary },
  subTitle: { ...type.label, color: colors.textSecondary, marginTop: space.xs },
  rateBig: { ...type.label, fontFamily: fonts.bold, color: EL_INK },
  incCard: { ...cardStyle, padding: space.md, gap: space.sm },
  incStoreHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  incStore: { ...type.labelSm, color: colors.textPrimary },
  incStoreMeta: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  incTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  incFill: { height: 8, borderRadius: radius.pill, backgroundColor: EL_INK },
  incFillFull: { backgroundColor: colors.warn },
  incText: { ...type.bodySm, color: colors.textSecondary },
  incMeta: { ...type.caption, color: colors.textTertiary },
  streams: { gap: 2 },
  stream: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 34,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  streamTitle: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  streamValue: { ...type.numSmStrong, color: colors.textPrimary },
  nextInc: { flexDirection: "row", alignItems: "center", gap: space.xs },
  nextIncText: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
  },
  upg: { ...cardStyle, padding: space.md, gap: space.sm },
  upgHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  upgIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  upgTitle: { ...type.labelSm, color: colors.textPrimary },
  upgText: { ...type.caption, color: colors.textSecondary },
  levels: { flexDirection: "row", gap: 3 },
  levelPip: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
  },
  levelOn: { backgroundColor: EL_INK },
  upgFoot: { flexDirection: "row", alignItems: "center", gap: space.sm },
  upgMeta: { ...type.caption, color: colors.textSecondary, flex: 1 },
  upgBtn: {
    minWidth: 80,
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    backgroundColor: CITY2_UI.go,
  },
  upgBtnOff: { backgroundColor: colors.surface3 },
  upgBtnText: { ...type.label, fontFamily: fonts.bold, color: CITY_UI.white },
  upgBtnTextOff: { color: colors.textTertiary },
  effect: {
    ...cardStyle,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
  },
  effectNow: { ...type.labelSm, color: colors.textPrimary },

  history: { gap: space.md, paddingBottom: space.lg },
  totals: { flexDirection: "row", gap: space.xs },
  total: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
  },
  totalLabel: { ...type.micro, color: colors.textTertiary, letterSpacing: 0 },
  totalValue: {
    ...type.label,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  days: { gap: space.xs },
  daysHead: { gap: 2 },
  daysMeta: { ...type.caption, color: colors.textTertiary },
  daysTable: {
    ...cardStyle,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
  },
  dayRow: { flexDirection: "row", alignItems: "center", minHeight: 30 },
  dayCell: {
    ...type.numSmStrong,
    color: colors.textSecondary,
    flex: 1,
    textAlign: "right",
  },
  dayName: {
    ...type.bodySm,
    flex: 1.6,
    textAlign: "left",
    color: colors.textPrimary,
  },
  dayHeadText: { ...type.micro, color: colors.textTertiary, letterSpacing: 0 },
  group: { gap: space.xs },
  groupHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  groupTitle: { ...type.labelSm, color: colors.textPrimary },
  groupNet: { ...type.numSmStrong, color: colors.textSecondary },
  groupCard: { ...cardStyle, paddingHorizontal: space.md },
  ledger: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  ledgerLast: { borderBottomWidth: 0 },
  ledgerIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  ledgerIconPlus: { backgroundColor: colors.surface3 },
  ledgerTitle: {
    ...type.bodySm,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  ledgerSub: { ...type.caption, color: colors.textTertiary },
  ledgerAmount: { ...type.numSmStrong, color: colors.textSecondary },

  how: { gap: space.lg, paddingBottom: space.lg },
  howLead: { flexDirection: "row", gap: space.md, alignItems: "center" },
  howRow: { flexDirection: "row", gap: space.md },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: space.s,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  chipFull: { backgroundColor: colors.warnDim },
  chipText: { ...type.micro, letterSpacing: 0, color: colors.textSecondary },
});
