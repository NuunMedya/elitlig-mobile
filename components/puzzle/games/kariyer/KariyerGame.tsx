/**
 * KARİYER YOLU — maç ekranı (Lig Yolu oyun modülü).
 *
 * AKIŞ:
 *   antrenman  harcanmamış antrenman puanı varsa üç karttan biri seçilir
 *              (puan = kazanılan yıldız; kart özellikleri büyütür)
 *   tanıtım    anın dakikası ve hikâyesi ("23' · Ceza sahası dışında top sende!")
 *   oyun       Skia tuvalinde an oynanır (şut · pas · çalım)
 *   sonuç      "GOL!" / "Kaleci çıkardı" … kısa bir an, sonra sıradaki an
 *   bitiş      an skorlarından maç reytingi → yıldız → çerçeveye bildirilir
 *
 * ÇİZİM VE FİZİK arayüz iş parçacığındadır (lib/kariyer/sim.ts): her karede
 * durum ilerletilir ve sahne tek bir SkPicture'a kaydedilir. React yalnız
 * evre değişince (an başladı / bitti) yeniden çizer. Parmak hareketi JS'ten
 * paylaşılan değere yazılır; oyun onu bir sonraki karede okur.
 *
 * Yazılar ve düğmeler React Native katmanındadır (tuvalde metin çizilmez).
 * Oyun renkleri lib/kariyer/palette.ts'ten gelir; yerleşim tema tokenlarıyla.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { Canvas, Picture, Skia, createPicture } from "@shopify/react-native-skia";
import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import { runOnJS, useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";

import { SparkleBurst, Sunburst } from "@/components/game/Celebration";
import { Touchable } from "@/components/ui";
import { getPanelMe } from "@/lib/api/panel";
import {
  ATTR_ICONS,
  ATTR_KEYS,
  ATTR_LABELS,
  MOMENT_HINTS,
  MOMENT_ICONS,
  MOMENT_LABELS,
  applyGains,
  generateKariyerLevel,
  overallOf,
  ratingOf,
  starsOf,
  trainingOffer,
  type Attrs,
  type TrainingCard,
} from "@/lib/kariyer/levels";
import { HUD, paletteForTier } from "@/lib/kariyer/palette";
import { attrsOf, emptySave, identityOf, loadSave, storeSave, type KariyerSave } from "@/lib/kariyer/progress";
import { OUTCOME_TEXT, PHASE_OVER, createMoment, drawMoment, emptyTouch, stepMoment, type MomentState } from "@/lib/kariyer/sim";
import type { PuzzleGameProps } from "@/lib/puzzle/types";
import { usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { KIT } from "@/lib/puzzle/ligKitPalette";
import { fonts, haptics, radius, space, textScale, type } from "@/theme";

import { Button3D, CountBadge, softShadow, toonShadow } from "../soyunma/CartoonKit";

type Stage = "loading" | "train" | "intro" | "play" | "result" | "done";

/** "Krampon" güçlendiricisi: o maç boyunca bütün özelliklere eklenir. */
const BOOT_BONUS = 8;
/** "İkinci şans" yalnız kötü biten anda önerilir. */
const RETRY_BELOW = 0.5;

const glyph = (name: string) => name as keyof typeof Ionicons.glyphMap;

/** HUD satır yükseklikleri (sabit: tuval yüksekliği ölçüm beklemeden hesaplanır). */
const ROW1_H = 56;
const ROW2_H = 34;

export default function KariyerGame({ level, maxWidth, maxHeight, preBoosters, boosterStock, useBooster, onFinish, paused }: PuzzleGameProps) {
  const auth = useAuth();
  const puzzle = usePuzzleMe();
  const userId = auth.user?.id ?? 0;

  /* — Kimlik: gerçek oyuncu profili varsa oradan başlar — */
  const hasPlayer = Boolean(auth.user?.player_id);
  const panel = useQuery({ queryKey: ["panel", "me"], queryFn: getPanelMe, enabled: hasPlayer, staleTime: 60_000, retry: false });
  const identity = useMemo(() => identityOf(auth.user, panel.data?.player ?? null), [auth.user, panel.data?.player]);
  const identityReady = !hasPlayer || panel.isFetched || panel.fetchStatus === "idle";

  const def = useMemo(() => generateKariyerLevel(level, identity.line ?? "FWD"), [level, identity.line]);
  const pal = useMemo(() => paletteForTier(def.tier), [def.tier]);

  /* — Gelişim — */
  const [save, setSave] = useState<KariyerSave | null>(null);
  useEffect(() => {
    let alive = true;
    void loadSave(userId).then((loaded) => {
      if (alive) setSave(loaded);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Cüzdan sorgusu bitti ya da hiç çalışmıyor (çevrimdışı): oyun beklemeye takılmaz.
  const puzzleReady = puzzle.isFetched || puzzle.fetchStatus === "idle";
  const totalStars = puzzle.data?.games?.kariyer?.total_stars ?? 0;
  const points = save ? Math.max(0, totalStars - save.spent) : 0;
  const boots = preBoosters.includes("krampon");
  const attrs = useMemo<Attrs>(() => attrsOf(identity, save ?? emptySave(), boots ? BOOT_BONUS : 0), [identity, save, boots]);

  /* — Tuval ölçüsü: TAM EKRAN — genişlik çerçeveden, yükseklik oyun alanından
     kendi HUD'umuz düşülerek (sahne alanın altına kadar uzanır). Sim bütün
     konumları w/h oranıyla kurar; oran makul aralıkta tutulur. — */
  const width = Math.round(maxWidth);
  const compact = maxHeight < 460;
  const headerH = ROW1_H + space.sm + (compact ? 0 : ROW2_H + space.sm);
  const height = Math.round(Math.max(width * 0.8, Math.min(width * 2.1, maxHeight - headerH)));

  /* — Evre — */
  const [stage, setStage] = useState<Stage>("loading");
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [outcome, setOutcome] = useState(0);
  const [lastScore, setLastScore] = useState(0);
  const finished = useRef(false);

  useEffect(() => {
    if (stage !== "loading" || !save || !identityReady || !puzzleReady) return;
    setStage(points > 0 ? "train" : "intro");
  }, [identityReady, points, puzzleReady, save, stage]);

  /* — Motor: paylaşılan durum, parmak, kare döngüsü — */
  const state = useSharedValue<MomentState | null>(null);
  const touch = useSharedValue(emptyTouch());
  const running = useSharedValue(false);
  /** Bitişi bildirilmiş anın sırası (aynı an iki kez bildirilmesin). */
  const reported = useSharedValue(-1);
  const serial = useSharedValue(0);

  const onMomentEnd = useCallback((score: number, code: number) => {
    setLastScore(score);
    setOutcome(code);
    setStage("result");
    if (score >= 0.9) haptics.success();
    else if (score < RETRY_BELOW) haptics.error();
    else haptics.light();
  }, []);

  useFrameCallback((frame) => {
    "worklet";
    if (!running.value) return;
    const dt = Math.min(0.034, (frame.timeSincePreviousFrame ?? 16) / 1000);
    const input = touch.value;
    state.modify((s) => {
      "worklet";
      if (s) stepMoment(s, dt, input);
      return s;
    }, true);
    const now = state.value;
    if (now && now.phase === PHASE_OVER && reported.value !== serial.value) {
      reported.value = serial.value;
      running.value = false;
      runOnJS(onMomentEnd)(now.score, now.outcome);
    }
  });

  const bounds = useMemo(() => Skia.XYWHRect(0, 0, width, height), [width, height]);
  const picture = useDerivedValue(() => {
    const s = state.value;
    const input = touch.value;
    return createPicture((canvas) => {
      "worklet";
      if (s) drawMoment(canvas, s, input, pal);
    }, bounds);
  }, [pal, bounds]);

  const startMoment = useCallback(
    (at: number) => {
      const moment = def.moments[at];
      if (!moment) return;
      touch.value = emptyTouch();
      serial.value = serial.value + 1;
      state.value = createMoment(moment, attrs, width, height);
      setStage("play");
    },
    [attrs, def.moments, height, serial, state, touch, width],
  );

  // Oyun yalnız "oyun" evresinde ve duraklatılmamışken akar.
  useEffect(() => {
    running.value = stage === "play" && !paused;
  }, [paused, running, stage]);

  // Tanıtımda sahne hazır dursun (arkada görünür).
  useEffect(() => {
    if (stage === "intro" && def.moments[index]) state.value = createMoment(def.moments[index], attrs, width, height);
  }, [attrs, def.moments, height, index, stage, state, width]);

  /* — Sonuçtan sonra: sıradaki an ya da maç sonu — */
  const advance = useCallback(
    (score: number) => {
      const next = [...scores, score];
      setScores(next);
      if (next.length >= def.moments.length) {
        setStage("done");
        if (!finished.current) {
          finished.current = true;
          const rating = ratingOf(next);
          const stars = starsOf(rating, def);
          const goals = next.filter((value, i) => def.moments[i].kind === "shot" && value >= 1).length;
          onFinish({
            won: stars > 0,
            stars,
            score: Math.round(rating * 10),
            summary: `Reyting ${rating.toFixed(1).replace(".", ",")}${goals ? ` · ${goals} gol` : ""} · ${def.opponent}`,
          });
        }
        return;
      }
      setIndex(next.length);
      setStage("intro");
    },
    [def, onFinish, scores],
  );

  useEffect(() => {
    if (stage !== "result" || paused) return;
    // Kötü biten anda "İkinci şans" için biraz daha uzun beklenir.
    const canRetry = lastScore < RETRY_BELOW && (boosterStock.ikinci_sans ?? 0) > 0;
    const timer = setTimeout(() => advance(lastScore), canRetry ? 2600 : 1100);
    return () => clearTimeout(timer);
  }, [advance, boosterStock.ikinci_sans, lastScore, paused, stage]);

  // Sonuç rozeti: ezilip-gerilen çizgi film "pop"u (sonlu yay).
  const toastPop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (stage !== "result") return;
    toastPop.setValue(0);
    Animated.spring(toastPop, { toValue: 1, damping: 7, stiffness: 220, mass: 0.7, useNativeDriver: true }).start();
  }, [stage, toastPop]);

  const introPop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (stage !== "intro") return;
    introPop.setValue(0);
    Animated.spring(introPop, { toValue: 1, damping: 7, stiffness: 200, mass: 0.7, useNativeDriver: true }).start();
  }, [stage, index, introPop]);

  const retry = useCallback(() => {
    if (stage !== "result" || !useBooster("ikinci_sans")) return;
    haptics.select();
    startMoment(index);
  }, [index, stage, startMoment, useBooster]);

  /* — Antrenman kartı — */
  const offer = useMemo(() => (save ? trainingOffer(save.spent + 1, identity.real ? identity.line : null) : []), [identity, save]);
  const chooseCard = useCallback(
    (card: TrainingCard) => {
      if (!save) return;
      haptics.select();
      const zero: Attrs = { sut: 0, pas: 0, teknik: 0, hiz: 0 };
      const next: KariyerSave = { spent: save.spent + 1, gains: applyGains(applyGains(zero, save.gains), card.gains) };
      setSave(next);
      void storeSave(userId, next);
      if (totalStars - next.spent <= 0) setStage("intro");
    },
    [save, totalStars, userId],
  );

  /* — Parmak: çekiş başı ve ucu paylaşılan değere yazılır — */
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          touch.value = { down: true, x: locationX, y: locationY, sx: locationX, sy: locationY, up: touch.value.up };
        },
        onPanResponderMove: (event, gesture) => {
          const current = touch.value;
          // Bitiş noktası başlangıç + sürükleme: alt görünüm değişse de tutarlı.
          touch.value = { down: true, x: current.sx + gesture.dx, y: current.sy + gesture.dy, sx: current.sx, sy: current.sy, up: current.up };
        },
        onPanResponderRelease: () => {
          const current = touch.value;
          touch.value = { ...current, down: false, up: current.up + 1 };
        },
        onPanResponderTerminate: () => {
          touch.value = { ...touch.value, down: false };
        },
      }),
    [touch],
  );

  const moment = def.moments[Math.min(index, def.moments.length - 1)];
  const liveRating = scores.length ? ratingOf(scores) : null;
  const result = OUTCOME_TEXT[outcome];
  const canRetry = stage === "result" && lastScore < RETRY_BELOW && (boosterStock.ikinci_sans ?? 0) > 0;

  const retryStock = boosterStock.ikinci_sans ?? 0;
  const tone = result?.tone ?? "ok";
  const toneFace = tone === "good" ? HUD.good : tone === "ok" ? HUD.ok : HUD.bad;

  return (
    <View style={[styles.root, { width, height: maxHeight }]}>
      {/* ÜST ŞERİT: kimlik, anların durumu */}
      <View style={[styles.hud, { height: ROW1_H }]}>
        <View style={styles.avatar} accessibilityLabel={`Genel güç ${overallOf(attrs)}`}>
          <Text style={styles.avatarText} {...textScale.badge}>
            {overallOf(attrs)}
          </Text>
        </View>
        <View style={styles.hudBody}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {identity.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {def.tierName} · {def.matchNo}. maç · {def.opponent}
          </Text>
        </View>
        <View style={styles.dots}>
          {def.moments.map((item, i) => {
            const done = i < scores.length;
            const good = done && scores[i] >= 0.7;
            const ok = done && scores[i] >= RETRY_BELOW;
            const current = !done && i === index;
            const face = done ? (good ? HUD.good : ok ? HUD.ok : HUD.bad) : current ? KIT.white : HUD.chip;
            return (
              <View
                key={`${item.kind}-${item.minute}-${i}`}
                style={[styles.dot, current && styles.dotCurrent, { backgroundColor: face }]}
                accessibilityLabel={`${i + 1}. an: ${MOMENT_LABELS[item.kind]}${done ? (good ? ", çok iyi" : ok ? ", idare eder" : ", kötü") : ""}`}
              >
                <Ionicons name={glyph(done ? (good ? "checkmark" : ok ? "remove" : "close") : MOMENT_ICONS[item.kind])} size={current ? 15 : 12} color={current ? KIT.cardInk : HUD.text} />
              </View>
            );
          })}
        </View>
      </View>

      {/* ÖZELLİKLER: nötr çipler + 99 üzerinden dolum çubuğu */}
      {!compact ? (
        <View style={[styles.attrs, { height: ROW2_H }]}>
          {ATTR_KEYS.map((key) => (
            <View key={key} style={styles.attr} accessibilityLabel={`${ATTR_LABELS[key]} ${attrs[key]}`}>
              <View style={styles.attrTop}>
                <Ionicons name={glyph(ATTR_ICONS[key])} size={12} color={KIT.textSoft} />
                {width >= 360 ? (
                  <Text style={styles.attrLabel} numberOfLines={1} {...textScale.badge}>
                    {ATTR_LABELS[key]}
                  </Text>
                ) : null}
                <Text style={styles.attrValue} {...textScale.badge}>
                  {attrs[key]}
                </Text>
              </View>
              <View style={styles.attrTrack}>
                <View style={[styles.attrFill, { width: `${Math.max(4, Math.min(100, Math.round((attrs[key] / 99) * 100)))}%` }]} />
              </View>
            </View>
          ))}
          {liveRating != null || boots ? (
            <View style={styles.ratingChip} accessibilityLabel={liveRating != null ? `Reyting ${liveRating.toFixed(1)}` : "Yeni kramponlar etkin"}>
              <Ionicons name={liveRating != null ? "star" : "flash"} size={13} color={KIT.star} />
              <Text style={styles.ratingText} {...textScale.badge}>
                {liveRating != null ? liveRating.toFixed(1).replace(".", ",") : `+${BOOT_BONUS}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* SAHNE */}
      <View style={[styles.stage, { width, height }]}>
        <Canvas style={{ width, height }}>
          <Picture picture={picture} />
        </Canvas>
        <View pointerEvents="none" style={styles.stageRim} />
        <View style={StyleSheet.absoluteFill} {...(stage === "play" ? responder.panHandlers : {})} />

        {/* Canlı güçlendirici stoğu (gösterim; kullanım kötü biten anda çıkar) */}
        {stage === "play" || stage === "intro" ? (
          <View pointerEvents="none" style={styles.boosterPeek} accessibilityLabel={`İkinci şans stoğu ${retryStock}`}>
            <View style={styles.peekIcon}>
              <Ionicons name="refresh" size={18} color={HUD.text} />
            </View>
            <View style={[styles.countBadge, retryStock > 0 ? null : styles.countBadgeEmpty]}>
              <Text style={styles.countText} {...textScale.badge}>
                {retryStock}
              </Text>
            </View>
          </View>
        ) : null}

        {stage === "loading" ? (
          <View style={styles.overlay}>
            <Text style={styles.overlayHint} {...textScale.dense}>
              Soyunma odası hazırlanıyor…
            </Text>
          </View>
        ) : null}

        {stage === "train" ? (
          <View style={styles.overlay}>
            <View style={styles.pointsChip}>
              <Ionicons name="barbell" size={14} color={KIT.star} />
              <Text style={styles.pointsText} {...textScale.badge}>
                ANTRENMAN · {points} PUAN
              </Text>
            </View>
            <Text style={styles.overlayTitle} {...textScale.dense}>
              Bugün neye çalışıyorsun?
            </Text>
            <Text style={styles.overlayHint} {...textScale.long}>
              Kazandığın her yıldız bir antrenman puanıdır. Özelliklerin sahadaki anları gerçekten değiştirir.
            </Text>
            <View style={styles.cards}>
              {offer.map((card) => (
                <Touchable key={card.key} feedback="card" onPress={() => chooseCard(card)} style={styles.card} accessibilityRole="button" accessibilityLabel={`${card.title}. ${card.description}`}>
                  <View style={styles.cardIcon}>
                    <Ionicons name={glyph(card.icon)} size={22} color={KIT.cardInk} />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2} {...textScale.dense}>
                    {card.title}
                  </Text>
                  <View style={styles.gains}>
                    {ATTR_KEYS.filter((key) => card.gains[key]).map((key) => (
                      <View key={key} style={styles.gainPill}>
                        <Text style={styles.gain} {...textScale.badge}>
                          +{card.gains[key]} {ATTR_LABELS[key]}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Touchable>
              ))}
            </View>
            <Touchable feedback="button" onPress={() => setStage("intro")} style={styles.skip} accessibilityRole="button">
              <Text style={styles.skipText} {...textScale.dense}>
                Kalan puanı sakla, maça çık
              </Text>
            </Touchable>
          </View>
        ) : null}

        {stage === "intro" && moment ? (
          <View style={styles.overlay}>
            <Animated.View
              style={[
                styles.minuteBadge,
                {
                  transform: [
                    { scale: introPop.interpolate({ inputRange: [0, 0.6, 1, 2], outputRange: [0.6, 1.05, 1, 1] }) },
                  ],
                },
              ]}
            >
              <Text style={styles.minuteText} {...textScale.badge}>
                {`${moment.minute}'`}
              </Text>
            </Animated.View>
            <View style={styles.kindChip}>
              <Ionicons name={glyph(MOMENT_ICONS[moment.kind])} size={13} color={HUD.text} />
              <Text style={styles.overline} {...textScale.badge}>
                {MOMENT_LABELS[moment.kind].toLocaleUpperCase("tr-TR")}
                {def.cup && index === 0 ? " · KUPA MAÇI" : ""} · {index + 1}/{def.moments.length}
              </Text>
            </View>
            <Text style={styles.overlayTitle} {...textScale.dense}>
              {moment.story}
            </Text>
            <Text style={styles.overlayHint} {...textScale.long}>
              {index === 0 && def.tip ? def.tip : MOMENT_HINTS[moment.kind]}
            </Text>
            <Button3D tone="green" height={58} wiggle onPress={() => startMoment(index)} style={styles.go} testID="kariyer-go" accessibilityLabel={index === 0 ? "Maça çık" : "Devam"} r={29}>
              <Ionicons name="play" size={24} color={HUD.text} />
              <Text style={styles.goText} {...textScale.dense}>
                {index === 0 ? "MAÇA ÇIK" : "DEVAM"}
              </Text>
            </Button3D>
          </View>
        ) : null}

        {stage === "result" && result ? (
          <View style={styles.toastWrap} pointerEvents="box-none">
            {result.tone === "good" ? (
              <View pointerEvents="none" style={styles.toastBurst}>
                <Sunburst size={Math.min(280, width * 0.8)} color={pal.good} opacity={0.18} />
                <SparkleBurst trigger={index + 1} radius={Math.min(140, width * 0.36)} color={pal.trail} />
              </View>
            ) : null}
            <Animated.View
              style={[
                styles.toast,
                {
                  backgroundColor: toneFace,
                  transform: [
                    { scale: toastPop.interpolate({ inputRange: [0, 0.6, 1, 2], outputRange: [0.6, 1.06, 1, 1] }) },
                  ],
                },
              ]}
            >
              <Text style={styles.toastText} {...textScale.dense}>
                {result.title}
              </Text>
            </Animated.View>
            {canRetry ? (
              <Button3D tone="green" height={52} wiggle onPress={retry} accessibilityLabel={`İkinci şans, stok ${retryStock}`} badge={<CountBadge value={retryStock} size={24} />} r={26} faceStyle={styles.retryFace}>
                <Ionicons name="refresh" size={20} color={HUD.text} />
                <Text style={styles.goText} {...textScale.dense}>
                  İKİNCİ ŞANS
                </Text>
              </Button3D>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: "center", gap: space.sm },
  toastBurst: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },

  hud: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.xl,
    backgroundColor: KIT.panel,
    ...softShadow,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: KIT.white,
  },
  avatarText: { ...type.scoreSm, color: KIT.cardInk },
  hudBody: { flex: 1, minWidth: 0 },
  name: { ...type.h3, fontFamily: fonts.bold, color: HUD.text },
  meta: { ...type.caption, fontFamily: fonts.semibold, color: HUD.muted },
  dots: { flexDirection: "row", gap: space.xs, alignItems: "center" },
  dot: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dotCurrent: { width: 30, height: 30 },

  attrs: { flexDirection: "row", gap: space.xs },
  attr: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: space.s,
    borderRadius: radius.md,
    backgroundColor: KIT.panel,
  },
  attrTop: { flexDirection: "row", alignItems: "center", gap: 3 },
  attrLabel: { ...type.nano, fontFamily: fonts.semibold, color: HUD.muted, flexShrink: 1 },
  attrValue: { ...type.numSmStrong, fontFamily: fonts.bold, color: HUD.text, marginLeft: "auto" },
  attrTrack: { height: 4, borderRadius: radius.pill, backgroundColor: KIT.track, overflow: "hidden" },
  attrFill: { height: 4, borderRadius: radius.pill, backgroundColor: KIT.textSoft },
  ratingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: KIT.panel,
  },
  ratingText: { ...type.scoreXs, color: HUD.text },

  stage: { borderRadius: radius.xxl, overflow: "hidden", backgroundColor: HUD.scrim },
  stageRim: { ...StyleSheet.absoluteFillObject, borderRadius: radius.xxl, borderWidth: 1, borderColor: KIT.panelEdge },
  boosterPeek: { position: "absolute", right: space.sm, top: space.md },
  peekIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: KIT.scrim,
  },
  countBadge: {
    position: "absolute",
    right: -5,
    top: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    backgroundColor: KIT.white,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeEmpty: { backgroundColor: HUD.cardMuted },
  countText: { ...type.nano, fontFamily: fonts.bold, color: KIT.cardInk },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    padding: space.lg,
    backgroundColor: HUD.scrim,
  },
  minuteBadge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: KIT.white,
    ...softShadow,
  },
  minuteText: { ...type.scoreLg, color: KIT.cardInk },
  kindChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: KIT.glass,
  },
  overline: { ...type.overline, fontFamily: fonts.bold, color: HUD.text },
  overlayTitle: { ...type.display, color: HUD.text, textAlign: "center", ...toonShadow },
  overlayHint: { ...type.body, fontFamily: fonts.semibold, color: HUD.muted, textAlign: "center" },
  pointsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: KIT.glass,
  },
  pointsText: { ...type.labelSm, fontFamily: fonts.bold, color: HUD.text },

  cards: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  card: {
    flex: 1,
    minHeight: 150,
    alignItems: "center",
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.xl,
    backgroundColor: HUD.card,
    ...softShadow,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: KIT.cardSoft,
  },
  cardTitle: { ...type.labelSm, fontFamily: fonts.bold, color: HUD.cardInk, textAlign: "center" },
  gains: { alignItems: "center", gap: 3, marginTop: "auto" },
  gainPill: { paddingHorizontal: space.s, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: KIT.cardSoft },
  gain: { ...type.micro, fontFamily: fonts.bold, letterSpacing: 0, color: KIT.accentLip },
  skip: { paddingVertical: space.sm, paddingHorizontal: space.md },
  skipText: { ...type.caption, fontFamily: fonts.semibold, color: HUD.muted },

  go: { minWidth: 220, marginTop: space.md },
  goText: { ...type.h2, fontFamily: fonts.bold, color: HUD.text, ...toonShadow },
  retryFace: { paddingHorizontal: space.xl },

  toastWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: space.lg },
  toast: {
    paddingHorizontal: space.xxl,
    paddingVertical: space.md,
    borderRadius: radius.xl,
    ...softShadow,
  },
  toastText: { ...type.scoreLg, color: HUD.text, ...toonShadow },
});
