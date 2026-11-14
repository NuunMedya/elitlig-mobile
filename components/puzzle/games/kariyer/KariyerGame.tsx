/**
 * KARİYER YOLU — maç ekranı (Lig Yolu oyun modülü).
 *
 * AKIŞ:
 *   antrenman  harcanmamış antrenman puanı varsa üç karttan biri seçilir
 *              (puan = kazanılan yıldız; kart özellikleri büyütür)
 *   tanıtım    anın dakikası ve hikâyesi ("23' · Ceza sahası dışında top sende!")
 *   oyun       Skia tuvalinde an oynanır (şut · pas · çalım · penaltı ·
 *              frikik · kafa; engeller: rüzgâr, çamur, ofsayt…)
 *   sonuç      "GOL!" / "Kaleci çıkardı" … kısa bir an, sonra sıradaki an
 *   bitiş      an skorlarından maç reytingi → yıldız → çerçeveye bildirilir
 *
 * ÇİZİM VE FİZİK arayüz iş parçacığındadır (lib/kariyer/sim.ts): her karede
 * durum ilerletilir ve sahne tek bir SkPicture'a kaydedilir. React yalnız
 * evre değişince (an başladı / bitti) yeniden çizer. Parmak hareketi JS'ten
 * paylaşılan değere yazılır; oyun onu bir sonraki karede okur.
 *
 * 2026-11 YENİLEMESİ: üstte REYTİNG ÇUBUĞU — 1/2/3 yıldız eşikleri çubuk
 * üstünde işaretli, her anın skoru çubuğu canlı doldurur; hedef her an
 * görünür. Tanıtım kartı anın kuralını ("Kavisli çek") ve o andaki engelleri
 * rozetle söyler; sonuç rozeti anın notunu (0–3 yıldız) gösterir.
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
  MODS,
  MOMENT_HINTS,
  MOMENT_ICONS,
  MOMENT_LABELS,
  MOMENT_RULES,
  applyGains,
  generateKariyerLevel,
  gradeOf,
  overallOf,
  ratingOf,
  starsOf,
  trainingOffer,
  type Attrs,
  type TrainingCard,
} from "@/lib/kariyer/levels";
import { HUD, paletteForTier, uiForTier } from "@/lib/kariyer/palette";
import { attrsOf, emptySave, identityOf, normalizeSave, type KariyerSave } from "@/lib/kariyer/progress";
import { useGameSave } from "@/lib/puzzle/saves";
import {
  OUTCOME_TEXT,
  OUT_GOAL,
  PHASE_OVER,
  createMoment,
  drawMoment,
  emptyTouch,
  perpDistance,
  stepMoment,
  type MomentState,
} from "@/lib/kariyer/sim";
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
const ROW2_H = 46;
/** Reyting çubuğunun ölçeği. */
const R_MIN = 4;
const R_MAX = 10;

export default function KariyerGame({ level, maxWidth, maxHeight, preBoosters, boosterStock, useBooster, onFinish, paused }: PuzzleGameProps) {
  const auth = useAuth();
  const puzzle = usePuzzleMe();

  /* — Kimlik: gerçek oyuncu profili varsa oradan başlar — */
  const hasPlayer = Boolean(auth.user?.player_id);
  const panel = useQuery({ queryKey: ["panel", "me"], queryFn: getPanelMe, enabled: hasPlayer, staleTime: 60_000, retry: false });
  const identity = useMemo(() => identityOf(auth.user, panel.data?.player ?? null), [auth.user, panel.data?.player]);
  const identityReady = !hasPlayer || panel.isFetched || panel.fetchStatus === "idle";

  const def = useMemo(() => generateKariyerLevel(level, identity.line ?? "FWD"), [level, identity.line]);
  const pal = useMemo(() => paletteForTier(def.tier), [def.tier]);
  const ui = useMemo(() => uiForTier(def.tier), [def.tier]);

  /* — Gelişim — */
  // Hesaba bağlı kayıt (lib/puzzle/saves): sunucu yanıtı gelene dek beklenir —
  // başka telefonda harcanan puanlar yeniden dağıtılmaya açılmasın.
  const kariyerSave = useGameSave("kariyer");
  const save = useMemo<KariyerSave | null>(() => (kariyerSave.ready ? normalizeSave(kariyerSave.data) : null), [kariyerSave.ready, kariyerSave.data]);
  const writeKariyer = kariyerSave.update;

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
  /** Bu maçta atılan goller (sonuç koduyla sayılır). */
  const goalsRef = useRef(0);
  const [goals, setGoals] = useState(0);

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
    if (code === OUT_GOAL) haptics.goal();
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
          const goals = goalsRef.current;
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

  // Gol sayacı: yalnız sonuç kesinleşince (ikinci şans geri sayımı bozmasın).
  const countGoal = useCallback(
    (score: number) => {
      if (outcome === OUT_GOAL && score >= 1) {
        goalsRef.current += 1;
        setGoals(goalsRef.current);
      }
    },
    [outcome],
  );

  useEffect(() => {
    if (stage !== "result" || paused) return;
    // Kötü biten anda "İkinci şans" için biraz daha uzun beklenir.
    const canRetry = lastScore < RETRY_BELOW && (boosterStock.ikinci_sans ?? 0) > 0;
    const timer = setTimeout(() => {
      countGoal(lastScore);
      advance(lastScore);
    }, canRetry ? 2600 : 1300);
    return () => clearTimeout(timer);
  }, [advance, boosterStock.ikinci_sans, countGoal, lastScore, paused, stage]);

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
      writeKariyer(next);
      if (totalStars - next.spent <= 0) setStage("intro");
    },
    [save, totalStars, writeKariyer],
  );

  /* — Parmak: çekiş başı, ucu ve yolun en çok büküldüğü nokta (frikik
     kavisi) paylaşılan değere yazılır. Kavis noktası: her harekette önceki
     uç ile saklı nokta yeni kirişe göre kıyaslanır, uzak olan kalır. — */
  const prevPoint = useRef({ x: 0, y: 0 });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          prevPoint.current = { x: locationX, y: locationY };
          const cur = touch.value;
          touch.value = { down: true, x: locationX, y: locationY, sx: locationX, sy: locationY, bx: locationX, by: locationY, up: cur.up, taps: cur.taps + 1 };
        },
        onPanResponderMove: (event, gesture) => {
          const current = touch.value;
          // Bitiş noktası başlangıç + sürükleme: alt görünüm değişse de tutarlı.
          const x = current.sx + gesture.dx;
          const y = current.sy + gesture.dy;
          const prev = prevPoint.current;
          const devB = Math.abs(perpDistance(current.sx, current.sy, x, y, current.bx, current.by));
          const devP = Math.abs(perpDistance(current.sx, current.sy, x, y, prev.x, prev.y));
          const bulge = devP > devB ? prev : { x: current.bx, y: current.by };
          prevPoint.current = { x, y };
          touch.value = { ...current, down: true, x, y, bx: bulge.x, by: bulge.y };
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
        {goals > 0 ? (
          <View style={styles.goalsChip} accessibilityLabel={`${goals} gol`}>
            <Ionicons name="football" size={13} color={KIT.cardInk} />
            <Text style={styles.goalsText} {...textScale.badge}>
              {goals}
            </Text>
          </View>
        ) : null}
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

      {/* HEDEF: reyting çubuğu (yıldız eşikleri işaretli) + özellikler */}
      {!compact ? (
        <View style={[styles.goalRow, { height: ROW2_H }]}>
          <RatingMeter rating={liveRating} pass={def.pass} star2={def.star2} star3={def.star3} accent={ui.accent} />
          <View style={styles.attrMini} accessibilityLabel={ATTR_KEYS.map((key) => `${ATTR_LABELS[key]} ${attrs[key]}`).join(", ")}>
            {ATTR_KEYS.map((key) => (
              <View key={key} style={styles.attrMiniItem}>
                <Ionicons name={glyph(ATTR_ICONS[key])} size={11} color={KIT.textSoft} />
                <Text style={styles.attrMiniValue} {...textScale.badge}>
                  {attrs[key]}
                </Text>
              </View>
            ))}
            {boots ? (
              <View style={styles.attrMiniItem}>
                <Ionicons name="flash" size={11} color={KIT.star} />
                <Text style={styles.attrMiniValue} {...textScale.badge}>
                  +{BOOT_BONUS}
                </Text>
              </View>
            ) : null}
          </View>
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
                {def.cup && index === 0 ? " · KUPA MAÇI" : ""}
                {def.breather && index === 0 ? " · NEFES MAÇI" : ""} · {index + 1}/{def.moments.length}
              </Text>
            </View>
            <Text style={styles.overlayTitle} {...textScale.dense}>
              {moment.story}
            </Text>
            <View style={styles.tagRow}>
              <View style={[styles.ruleChip, { backgroundColor: ui.accent }]}>
                <Ionicons name="hand-left" size={13} color={ui.ink} />
                <Text style={[styles.ruleText, { color: ui.ink }]} {...textScale.badge}>
                  {MOMENT_RULES[moment.kind]}
                </Text>
              </View>
              {MODS.filter((mod) => moment.mods & mod.bit).map((mod) => (
                <View key={mod.key} style={styles.modChip}>
                  <Ionicons name={glyph(mod.icon)} size={13} color={HUD.gold} />
                  <Text style={styles.modText} {...textScale.badge}>
                    {mod.key === "ruzgar" ? `${mod.label} ${moment.wind > 0 ? "→" : "←"}` : mod.label}
                  </Text>
                </View>
              ))}
            </View>
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
              <View style={styles.gradeRow} accessibilityLabel={`${gradeOf(lastScore).label}, ${gradeOf(lastScore).stars} yıldız`}>
                {[1, 2, 3].map((n) => (
                  <Ionicons key={n} name="star" size={18} color={n <= gradeOf(lastScore).stars ? HUD.gold : HUD.starOff} />
                ))}
                <Text style={styles.gradeText} {...textScale.badge}>
                  {gradeOf(lastScore).label}
                </Text>
              </View>
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

/**
 * Reyting çubuğu: 4,0–10,0 ölçeği; geçme (1★), 2★ ve 3★ eşikleri çubuk
 * üstünde yıldız işaretiyle durur. Dolum, oynanan anların ortalamasıdır —
 * oyuncu her an hedefe ne kadar yaklaştığını görür.
 */
const RatingMeter = React.memo(function RatingMeter({
  rating,
  pass,
  star2,
  star3,
  accent,
}: {
  rating: number | null;
  pass: number;
  star2: number;
  star3: number;
  accent: string;
}) {
  const pct = (value: number) => `${Math.max(0, Math.min(100, ((value - R_MIN) / (R_MAX - R_MIN)) * 100))}%` as const;
  const fill = useRef(new Animated.Value(0)).current;
  const value = rating ?? R_MIN;
  useEffect(() => {
    Animated.spring(fill, { toValue: (value - R_MIN) / (R_MAX - R_MIN), damping: 14, stiffness: 120, mass: 0.8, useNativeDriver: false }).start();
  }, [fill, value]);
  const earned = rating == null ? 0 : rating >= star3 ? 3 : rating >= star2 ? 2 : rating >= pass ? 1 : 0;
  return (
    <View
      style={styles.meter}
      accessibilityLabel={`Reyting ${rating != null ? rating.toFixed(1).replace(".", ",") : "henüz yok"}. Hedef ${pass.toFixed(1).replace(".", ",")}`}
    >
      <View style={styles.meterHead}>
        <Text style={styles.meterLabel} {...textScale.badge}>
          REYTİNG
        </Text>
        <Text style={styles.meterValue} {...textScale.badge}>
          {rating != null ? rating.toFixed(1).replace(".", ",") : "–"}
        </Text>
        <Text style={styles.meterGoal} numberOfLines={1} {...textScale.badge}>
          hedef {pass.toFixed(1).replace(".", ",")}
        </Text>
      </View>
      <View style={styles.meterTrack}>
        <Animated.View
          style={[
            styles.meterFill,
            { backgroundColor: earned > 0 ? KIT.accent : accent, width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
          ]}
        />
        {[pass, star2, star3].map((mark, i) => (
          <View key={i} style={[styles.meterMark, { left: pct(mark) }]}>
            <View style={styles.meterTick} />
            <View style={[styles.meterStar, earned > i ? styles.meterStarOn : null]}>
              <Ionicons name="star" size={10} color={earned > i ? KIT.cardInk : HUD.text} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { alignSelf: "center", gap: space.sm },
  goalRow: { flexDirection: "row", gap: space.xs, alignItems: "stretch" },
  meter: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: KIT.panel,
  },
  meterHead: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  meterLabel: { ...type.nano, fontFamily: fonts.bold, color: HUD.muted },
  meterValue: { ...type.scoreXs, color: HUD.text },
  meterGoal: { ...type.nano, fontFamily: fonts.semibold, color: HUD.muted, marginLeft: "auto" },
  meterTrack: { height: 8, borderRadius: radius.pill, backgroundColor: KIT.track, marginRight: 8 },
  meterFill: { height: 8, borderRadius: radius.pill },
  meterMark: { position: "absolute", top: -5, width: 0, alignItems: "center" },
  meterTick: { width: 2, height: 18, backgroundColor: HUD.text, opacity: 0.55 },
  meterStar: {
    position: "absolute",
    top: 1,
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: KIT.panelLip,
    borderWidth: 1,
    borderColor: HUD.glassBorder,
  },
  meterStarOn: { backgroundColor: KIT.star, borderColor: KIT.star },
  attrMini: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 104,
    alignContent: "center",
    justifyContent: "center",
    columnGap: space.xs,
    rowGap: 2,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    backgroundColor: KIT.panel,
  },
  attrMiniItem: { flexDirection: "row", alignItems: "center", gap: 2, minWidth: 40 },
  attrMiniValue: { ...type.numSmStrong, fontFamily: fonts.bold, color: HUD.text },
  goalsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 26,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: KIT.star,
  },
  goalsText: { ...type.scoreXs, color: KIT.cardInk },
  tagRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.xs },
  ruleChip: { flexDirection: "row", alignItems: "center", gap: 4, height: 26, paddingHorizontal: space.md, borderRadius: radius.pill },
  ruleText: { ...type.labelSm, fontFamily: fonts.bold },
  modChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: KIT.glass,
    borderWidth: 1,
    borderColor: HUD.gold,
  },
  modText: { ...type.labelSm, fontFamily: fonts.bold, color: HUD.text },
  gradeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, marginTop: 2 },
  gradeText: { ...type.labelSm, fontFamily: fonts.bold, color: HUD.text, marginLeft: 4 },
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
    alignItems: "center",
    paddingHorizontal: space.xxl,
    paddingVertical: space.md,
    borderRadius: radius.xl,
    ...softShadow,
  },
  toastText: { ...type.scoreLg, color: HUD.text, ...toonShadow },
});
