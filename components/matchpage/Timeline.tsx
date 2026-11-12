/**
 * ZAMAN TÜNELİ — maçın hikâyesi, ortadaki rayda dakika, iki yanda takımlar.
 *
 * DÜZEN:
 *
 *        A. YILMAZ   1–0  ⚽ │ 12' │
 *                            │ 23' │ ▮  K. DEMİR
 *                            │ 31' │ ⇄  ↑ B. KAYA  ↓ C. ER
 *                       ─ DEVRE ARASI · 1–0 ─
 *
 *   · Ev sahibinin olayı SOLDA, deplasmanınki SAĞDA: "kim yaptı" sorusu
 *     okumadan, konumla yanıtlanır. İkon ve skor rayın dibinde durur; ad
 *     dışa doğru akar — göz rayı izler, adı yanından okur.
 *   · GOL AYRI AĞIRLIKTADIR: dakika hapı mürekkep dolgulu, ad kalın, yanında
 *     o anki skor ("2–1") kalın rakamla. Kart ve değişiklik sakin kalır; 90
 *     dakikada olan tek önemli şey gollerdir, çizelge de bunu söyler.
 *   · RAY SÜREKLİDİR: her satır rayı kendi tam yüksekliğinde çizer, arka arkaya
 *     gelen satırlar kesintisiz tek bir çizgi oluşturur. İlk satırda ray
 *     ortadan başlar, son satırda ortada biter — çizelgenin bir başı ve sonu
 *     vardır.
 *
 * KART DİLİMLERİ: tünel tek bir beyaz kartın içinde okunur ama listesi
 * sanaldır (FlatList); kart, satırların kendisinden kurulur — ilk satır üst
 * köşeleri, son satır alt köşeleri taşır (`sliceStyle`).
 *
 * İKONLAR INLINE SVG (`EventIcon`): Ionicons'ta dikey, keskin köşeli kart
 * yok; futbolda kart yuvarlatılınca kart olmaktan çıkar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useCallback, useEffect, useRef } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Animated, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { EventIcon, Touchable, useReduceMotion } from "@/components/ui";
import { EVENT_LABEL, eventKind, goalDetail } from "@/lib/match";
import {
  colors,
  duration,
  easing,
  fonts,
  glowStyle,
  hairline,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";
import type { Reaction } from "@/lib/api/community";
import type { ApiMatchEvent } from "@/lib/types";
import { compactName, isGoalKind, type NameOf } from "./shared";

/** Ortadaki ray sütununun genişliği — dakika hapı (34px) rahat sığar. */
const RAIL_WIDTH = 52;

/** Satırın kart içindeki dilimi: kartın köşeleri ilk ve son satırdadır. */
export function sliceStyle(index: number, total: number): ViewStyle[] {
  const out: ViewStyle[] = [styles.slice];
  if (index === 0) out.push(styles.sliceFirst);
  if (index === total - 1) out.push(styles.sliceLast);
  return out;
}

/** Rayın satır içindeki parçası: ilk satırda ortadan başlar, sonda ortada biter. */
function railStyle(index: number, total: number): ViewStyle[] {
  const out: ViewStyle[] = [styles.rail];
  if (index === 0) out.push(styles.railFromMiddle);
  if (index === total - 1) out.push(styles.railToMiddle);
  return out;
}

export const TimelineRow = memo(function TimelineRow({
  event,
  home,
  score,
  nameOf,
  onOpenPlayer,
  index,
  total,
  flash = false,
  reactions,
  myReaction = null,
  onReact,
  hasClip = false,
  onClip,
  mine = false,
}: {
  event: ApiMatchEvent;
  home: boolean;
  score: string | null;
  nameOf: NameOf;
  onOpenPlayer: (playerId: number) => void;
  index: number;
  total: number;
  /** Canlı maçta yeni gelen gol — satır kısa bir parlama yapar. */
  flash?: boolean;
  /** Olay tepkileri (gol ve kartta): sayılar, üyenin tepkisi, dokunma. */
  reactions?: Partial<Record<Reaction, number>>;
  myReaction?: Reaction | null;
  onReact?: (eventId: number, reaction: Reaction) => void;
  /** Bu golün videosu var mı (canlı yayında kaydedilen klip). */
  hasClip?: boolean;
  onClip?: (eventId: number) => void;
  /** Oturumdaki üyenin golü — satır vurgulanır, "Senin golün" rozeti. */
  mine?: boolean;
}) {
  const kind = eventKind(event);
  const goal = isGoalKind(kind);
  const sub = kind === "substitution";

  const playerName = nameOf(event.oyuncu_id);
  const name = playerName ? compactName(playerName) : event.aciklama || EVENT_LABEL[kind] || "Olay";
  const inName = sub ? nameOf(event.oyuncu_giren_id) : null;
  const outName = sub ? nameOf(event.oyuncu_cikan_id) : null;

  /* İkinci satır olayın NASIL olduğunu söyler: gol türü, kartın rengi. */
  /* Düz golde ikinci satır YOK: top ikonu ve mürekkep dakika zaten "gol"
     diyor; her satırın altında tekrar eden "Gol" yazısı gürültüydü. */
  const detail =
    kind === "goal"
      ? goalDetail(event)
      : kind === "ownGoal"
        ? "Kendi kalesine"
        : kind === "yellow" || kind === "red"
          ? EVENT_LABEL[kind]
          : null;

  const playerId = Number(sub ? event.oyuncu_giren_id : event.oyuncu_id) || null;
  const open = useCallback(() => {
    if (playerId) onOpenPlayer(playerId);
  }, [onOpenPlayer, playerId]);

  const speech = sub
    ? `${event.dakika ?? "?"}. dakika oyuncu değişikliği: giren ${inName ?? "bilinmiyor"}, çıkan ${outName ?? "bilinmiyor"}`
    : `${event.dakika ?? "?"}. dakika ${EVENT_LABEL[kind] || "olay"}: ${name}${score ? `, skor ${score}` : ""}`;

  const glow = useFlash(flash);
  const eventId = Number(event.id);
  const watch = useCallback(() => onClip?.(eventId), [onClip, eventId]);

  const content = (
    <View style={[styles.side, home ? styles.sideHome : styles.sideAway]}>
      {/* İkon rayın dibinde, ad dışa doğru. */}
      <View style={[styles.icon, iconTone(kind)]}>
        <EventIcon kind={kind} size={goal ? 16 : 14} />
      </View>

      <View style={[styles.texts, home ? styles.textsHome : null]}>
        {sub ? (
          <>
            <SubLine direction="in" name={inName} home={home} />
            <SubLine direction="out" name={outName} home={home} />
          </>
        ) : (
          <>
            <Text
              style={[styles.name, goal ? styles.nameGoal : null, home ? styles.alignRight : null]}
              numberOfLines={1}
              {...textScale.dense}
            >
              {name}
            </Text>
            {/* Alt satır: koşan skor hapı + olayın nasıl olduğu. */}
            {score || detail ? (
              <View style={[styles.metaLine, home ? styles.metaLineHome : null]}>
                {score ? (
                  <View style={styles.scoreChip}>
                    <Text style={styles.score} {...textScale.badge}>
                      {score}
                    </Text>
                  </View>
                ) : null}
                {detail ? (
                  <Text style={[styles.detail, styles.detailFlex, home ? styles.alignRight : null]} numberOfLines={1} {...textScale.dense}>
                    {upperTR(detail.slice(0, 1)) + detail.slice(1)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );

  const reactable = Boolean(onReact) && (goal || kind === "yellow" || kind === "red");
  const clip = hasClip && Boolean(onClip);
  const own = mine && goal;
  /* Eylemler (golü izle + tepkiler) olayın KENDİ tarafında, adın altında
     durur; eskiden ortada iki ayrı satır rayı kesiyor ve her golü üç satıra
     çıkarıyordu. */
  const actions =
    reactable || clip || own ? (
      <View style={[styles.actions, home ? styles.actionsHome : null]}>
        {clip ? (
          /* "▶ Golü izle" — videosu olan golün açık işareti. Satırın kendisi
             de oynatıcıyı açar; hap, dokunulacak yeri söyler. */
          <Touchable
            feedback="button"
            style={styles.clipBtn}
            onPress={watch}
            hitSlop={6}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel={`${event.dakika ?? "?"}. dakikadaki golün videosunu izle`}
          >
            <LinearGradient
              colors={colors.gradientLive}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.clipFill]}
            />
            <Ionicons name="play" size={11} color={colors.onDark} />
            <Text style={styles.clipText} {...textScale.badge}>
              Golü izle
            </Text>
          </Touchable>
        ) : null}
        {own ? (
          <View style={styles.mineBadge}>
            <Ionicons name="star" size={10} color={colors.medalGold} />
            <Text style={styles.mineText} {...textScale.badge}>
              Senin golün
            </Text>
          </View>
        ) : null}
        {reactable && onReact ? (
          <ReactionBar eventId={Number(event.id)} counts={reactions} mine={myReaction} onReact={onReact} />
        ) : null}
      </View>
    ) : null;

  /* Videosu olan golde satıra dokunmak videoyu açar ("golüme tıklayıp
     izleyeyim"); oyuncu profili uzun basışta ve erişilebilirlik eyleminde. */
  const rowPress = clip ? watch : open;
  return (
    <View style={sliceStyle(index, total)}>
      {own ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.mineWash]} /> : null}
      {own ? (
        <LinearGradient
          pointerEvents="none"
          colors={colors.gradientSignature}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.mineStripe}
        />
      ) : null}
      {glow ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: glow }]} />
      ) : null}
      <Touchable
        feedback="row"
        haptic="selection"
        disabled={!playerId && !clip}
        onPress={rowPress}
        onLongPress={clip && playerId ? open : undefined}
        style={styles.row}
        accessibilityRole={playerId || clip ? "button" : "text"}
        accessibilityLabel={`${speech}${own ? ", senin golün" : ""}`}
        accessibilityHint={clip ? "Golün videosunu açar" : undefined}
        accessibilityActions={clip && playerId ? [{ name: "longpress", label: "Oyuncu profilini aç" }] : undefined}
        onAccessibilityAction={clip && playerId ? open : undefined}
      >
        <View style={styles.half}>{home ? content : null}</View>

        <View style={styles.center}>
          <View style={railStyle(index, total)} pointerEvents="none" />
          {goal ? (
            /* Gol düğümü: imza degradeli hap + mor parıltı — çizelgenin
               ritmini goller kurar. */
            <View style={[styles.minute, styles.minuteGoal]}>
              <LinearGradient
                colors={colors.gradientSignature}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.minuteFill]}
              />
              <Text style={[styles.minuteText, styles.minuteTextGoal]} {...textScale.badge}>
                {event.dakika != null ? `${event.dakika}'` : "—"}
              </Text>
            </View>
          ) : (
            <View style={styles.minute}>
              <Text style={styles.minuteText} {...textScale.badge}>
                {event.dakika != null ? `${event.dakika}'` : "—"}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.half}>{home ? null : content}</View>
      </Touchable>
      {actions ? (
        <View style={styles.footer}>
          <View style={styles.half}>{home ? actions : null}</View>
          <View style={styles.center}>
            {index < total - 1 ? <View style={styles.rail} pointerEvents="none" /> : null}
          </View>
          <View style={styles.half}>{home ? null : actions}</View>
        </View>
      ) : null}
    </View>
  );
});

/* Olay tepkileri — dört ikon, sayısıyla; seçili olan vurgulu. Aynısına
   dokunmak geri alır (sunucu: routes/community.js). */
const REACTION_ICONS: { key: Reaction; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: "alkis", icon: "thumbs-up", label: "Alkış" },
  { key: "ates", icon: "flame", label: "Ateş" },
  { key: "vay", icon: "sparkles", label: "Vay" },
  { key: "gulme", icon: "happy", label: "Gülme" },
];

const ReactionBar = memo(function ReactionBar({
  eventId,
  counts,
  mine,
  onReact,
}: {
  eventId: number;
  counts?: Partial<Record<Reaction, number>>;
  mine: Reaction | null;
  onReact: (eventId: number, reaction: Reaction) => void;
}) {
  return (
    <View style={styles.reactions}>
      {REACTION_ICONS.map((item) => {
        const selected = mine === item.key;
        const count = counts?.[item.key] ?? 0;
        return (
          <Touchable
            key={item.key}
            feedback="icon"
            haptic="selection"
            onPress={() => onReact(eventId, item.key)}
            style={[styles.reaction, selected && styles.reactionOn]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${item.label}${count ? `, ${count}` : ""}`}
          >
            <Ionicons name={item.icon} size={12} color={selected ? colors.accent : colors.textTertiary} />
            {count ? (
              <Text style={[styles.reactionCount, selected && styles.reactionCountOn]} {...textScale.badge}>
                {count}
              </Text>
            ) : null}
          </Touchable>
        );
      })}
    </View>
  );
});

/** Değişikliğin bir yarısı: yeşil ok giren, kırmızı ok çıkan. */
const SubLine = memo(function SubLine({
  direction,
  name,
  home,
}: {
  direction: "in" | "out";
  name: string | null;
  home: boolean;
}) {
  const entering = direction === "in";
  return (
    <View style={[styles.subLine, home ? styles.subLineHome : null]}>
      <Ionicons
        name={entering ? "arrow-up" : "arrow-down"}
        size={11}
        color={entering ? colors.win : colors.loss}
      />
      <Text
        style={[entering ? styles.name : styles.detail, styles.subName]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {name ? compactName(name) : entering ? "Giren oyuncu" : "Çıkan oyuncu"}
      </Text>
    </View>
  );
});

/** Devre arası / maç sonu — rayın üstünde, ortada etiketli hap. */
export const TimelineBreak = memo(function TimelineBreak({
  label,
  score,
  index,
  total,
}: {
  label: string;
  score: string | null;
  index: number;
  total: number;
}) {
  return (
    <View style={sliceStyle(index, total)}>
      <View style={styles.breakRow} accessibilityRole="header">
        <View style={railStyle(index, total)} pointerEvents="none" />
        <LinearGradient
          colors={[colors.surface1, colors.brandBorder]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.breakLine, styles.breakLineLeft]}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[colors.brandBorder, colors.surface1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.breakLine, styles.breakLineRight]}
          pointerEvents="none"
        />
        <View style={styles.breakPill}>
          <Ionicons name={/sonu/i.test(label) ? "flag" : "cafe"} size={11} color={colors.brandAccent} />
          <Text style={styles.breakText} {...textScale.badge}>
            {upperTR(label)}
          </Text>
          {score ? (
            <Text style={styles.breakScore} {...textScale.badge}>
              {score}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
});

/** Olay ikonunun renkli karosu — EventIcon'un rengini taşıyan soluk zemin. */
function iconTone(kind: string): ViewStyle | null {
  switch (kind) {
    case "goal":
      return styles.iconGoal;
    case "ownGoal":
      return styles.iconOwn;
    case "yellow":
      return styles.iconYellow;
    case "red":
      return styles.iconRed;
    case "substitution":
      return styles.iconSub;
    default:
      return null;
  }
}

/**
 * Yeni gol parlaması — üç kısa darbe. "Hareketi azalt" açıksa çalmaz; vurgu
 * zaten satırın kendi ağırlığında (kalın ad, mürekkep dakika) vardır.
 */
function useFlash(active: boolean): Animated.Value | null {
  const glow = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (!active || reduceMotion) return;
    const pulse = Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: duration.base, easing: easing.decelerate, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: duration.base * 2, easing: easing.decelerate, useNativeDriver: true }),
    ]);
    const loop = Animated.loop(pulse, { iterations: 3 });
    loop.start();
    return () => {
      loop.stop();
      glow.setValue(0);
    };
  }, [active, glow, reduceMotion]);

  return active ? glow : null;
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.xxs,
    paddingBottom: space.sm,
  },
  /* Ev sahibinde eylemler sağa, ikon sütununun soluna hizalı. */
  actionsHome: {
    justifyContent: "flex-end",
  },
  clipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    height: 24,
    paddingLeft: space.s,
    paddingRight: space.sm,
    borderRadius: radius.pill,
    ...glowStyle(colors.live, 1),
  },
  clipFill: {
    borderRadius: radius.pill,
  },
  clipText: {
    ...type.labelXs,
    fontFamily: fonts.bold,
    color: colors.onDark,
  },
  /* — Üyenin kendi golü — */
  mineWash: {
    backgroundColor: colors.brandDim,
  },
  mineStripe: {
    position: "absolute",
    left: 0,
    top: space.xs,
    bottom: space.xs,
    width: 3,
    borderRadius: radius.pill,
  },
  mineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    height: 24,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: colors.warnDim,
    borderWidth: hairline,
    borderColor: colors.medalGold,
  },
  mineText: {
    ...type.labelXs,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  reactions: {
    flexDirection: "row",
    gap: space.xxs,
  },
  reaction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
    minWidth: 24,
    height: 24,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  reactionOn: { backgroundColor: colors.accentDim },
  reactionCount: { ...type.caption, color: colors.textTertiary },
  reactionCountOn: { color: colors.accentText },
  /* — Kart dilimi — */
  slice: {
    marginHorizontal: layout.screenPadding,
    backgroundColor: colors.surface1,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
  },
  sliceFirst: {
    borderTopWidth: hairline,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space.sm,
  },
  sliceLast: {
    borderBottomWidth: hairline,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    paddingBottom: space.sm,
  },
  flash: {
    backgroundColor: colors.accentDim,
  },

  /* — Satır — */
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 50,
  },
  half: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  side: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
  },
  /* Ev sahibi tarafında sıra TERS: ikon rayın dibinde (sağda), ad solda. */
  sideHome: {
    flexDirection: "row-reverse",
  },
  sideAway: {},
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGoal: {
    backgroundColor: colors.winDim,
    borderWidth: 1,
    borderColor: colors.win,
  },
  iconOwn: {
    backgroundColor: colors.lossDim,
  },
  iconYellow: {
    backgroundColor: colors.warnDim,
  },
  iconRed: {
    backgroundColor: colors.dangerDim,
  },
  iconSub: {
    backgroundColor: colors.accentDim,
  },
  /* Koşan skor: soluk marka hapında kalın rakam. */
  scoreChip: {
    height: 20,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    justifyContent: "center",
  },
  score: {
    ...type.numSmStrong,
    color: colors.brandAccent,
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  textsHome: {
    alignItems: "flex-end",
  },
  name: {
    ...type.h4,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },
  nameGoal: {
    ...type.h3,
    fontFamily: fonts.semibold,
  },
  detail: {
    ...type.caption,
    color: colors.textTertiary,
  },
  detailFlex: {
    flexShrink: 1,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginTop: 2,
  },
  metaLineHome: {
    flexDirection: "row-reverse",
  },
  alignRight: {
    textAlign: "right",
  },
  subLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  subLineHome: {
    flexDirection: "row-reverse",
  },
  subName: {
    flexShrink: 1,
  },

  /* — Ray — */
  center: {
    width: RAIL_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  rail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.brandBorder,
  },
  railFromMiddle: {
    top: "50%",
  },
  railToMiddle: {
    bottom: "50%",
  },
  minute: {
    minWidth: 38,
    height: 24,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  minuteGoal: {
    height: 28,
    minWidth: 42,
    borderWidth: 0,
    ...glowStyle(colors.glow, 1),
  },
  minuteFill: {
    borderRadius: radius.pill,
  },
  minuteText: {
    ...type.numSmStrong,
    color: colors.textSecondary,
  },
  minuteTextGoal: {
    color: colors.onDark,
  },

  /* — Ayraç — */
  breakRow: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  breakLine: {
    position: "absolute",
    top: "50%",
    height: 1,
    width: "38%",
  },
  breakLineLeft: {
    left: 0,
  },
  breakLineRight: {
    right: 0,
  },
  breakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 26,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  breakText: {
    ...type.overline,
    color: colors.brandAccent,
  },
  breakScore: {
    ...type.numSmStrong,
    color: colors.textPrimary,
  },
});
