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
import { PanResponder, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
import { ATTR_COLORS, HUD, paletteForTier, uiForTier } from "@/lib/kariyer/palette";
import { attrsOf, emptySave, identityOf, loadSave, storeSave, type KariyerSave } from "@/lib/kariyer/progress";
import { OUTCOME_TEXT, PHASE_OVER, createMoment, drawMoment, emptyTouch, stepMoment, type MomentState } from "@/lib/kariyer/sim";
import type { PuzzleGameProps } from "@/lib/puzzle/types";
import { usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { fonts, haptics, radius, space, textScale, type } from "@/theme";

type Stage = "loading" | "train" | "intro" | "play" | "result" | "done";

/** "Krampon" güçlendiricisi: o maç boyunca bütün özelliklere eklenir. */
const BOOT_BONUS = 8;
/** "İkinci şans" yalnız kötü biten anda önerilir. */
const RETRY_BELOW = 0.5;

const glyph = (name: string) => name as keyof typeof Ionicons.glyphMap;

export default function KariyerGame({ level, maxWidth, preBoosters, boosterStock, useBooster, onFinish, paused }: PuzzleGameProps) {
  const auth = useAuth();
  const window = useWindowDimensions();
  const puzzle = usePuzzleMe();
  const userId = auth.user?.id ?? 0;

  /* — Kimlik: gerçek oyuncu profili varsa oradan başlar — */
  const hasPlayer = Boolean(auth.user?.player_id);
  const panel = useQuery({ queryKey: ["panel", "me"], queryFn: getPanelMe, enabled: hasPlayer, staleTime: 60_000, retry: false });
  const identity = useMemo(() => identityOf(auth.user, panel.data?.player ?? null), [auth.user, panel.data?.player]);
  const identityReady = !hasPlayer || panel.isFetched || panel.fetchStatus === "idle";

  const def = useMemo(() => generateKariyerLevel(level, identity.line ?? "FWD"), [level, identity.line]);
  const pal = useMemo(() => paletteForTier(def.tier), [def.tier]);
  const ui = uiForTier(def.tier);

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

  /* — Tuval ölçüsü: genişlik çerçeveden, yükseklik ekrana sığacak kadar — */
  const width = Math.round(maxWidth);
  const height = Math.round(Math.max(width * 1.05, Math.min(width * 1.42, window.height - 300)));

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

  return (
    <View style={[styles.root, { width }]}>
      {/* ÜST ŞERİT: kimlik, özellikler, anların durumu */}
      <View style={[styles.hud, { borderColor: ui.soft }]}>
        <View style={[styles.avatar, { backgroundColor: ui.accent }]}>
          <Text style={[styles.avatarText, { color: ui.ink }]} {...textScale.badge}>
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
            return (
              <View
                key={`${item.kind}-${item.minute}-${i}`}
                style={[styles.dot, done ? { backgroundColor: good ? pal.good : ok ? pal.trail : pal.bad } : i === index ? { borderColor: ui.accent } : null]}
              >
                <Ionicons name={glyph(MOMENT_ICONS[item.kind])} size={11} color={done ? HUD.scrim : i === index ? ui.accent : HUD.muted} />
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.attrs}>
        {ATTR_KEYS.map((key) => (
          <View key={key} style={styles.attr}>
            <Ionicons name={glyph(ATTR_ICONS[key])} size={12} color={ATTR_COLORS[key]} />
            <Text style={styles.attrLabel} {...textScale.badge}>
              {ATTR_LABELS[key]}
            </Text>
            <Text style={styles.attrValue} {...textScale.badge}>
              {attrs[key]}
            </Text>
          </View>
        ))}
        {liveRating != null ? (
          <View style={[styles.attr, styles.rating]}>
            <Ionicons name="star" size={12} color={ui.accent} />
            <Text style={styles.attrValue} {...textScale.badge}>
              {liveRating.toFixed(1).replace(".", ",")}
            </Text>
          </View>
        ) : null}
      </View>

      {/* SAHNE */}
      <View style={[styles.stage, { width, height }]}>
        <Canvas style={{ width, height }}>
          <Picture picture={picture} />
        </Canvas>
        <View style={StyleSheet.absoluteFill} {...(stage === "play" ? responder.panHandlers : {})} />

        {stage === "loading" ? (
          <View style={styles.overlay}>
            <Text style={styles.overlayHint} {...textScale.dense}>
              Soyunma odası hazırlanıyor…
            </Text>
          </View>
        ) : null}

        {stage === "train" ? (
          <View style={styles.overlay}>
            <Text style={styles.overline} {...textScale.badge}>
              ANTRENMAN · {points} PUAN
            </Text>
            <Text style={styles.overlayTitle} {...textScale.dense}>
              Bugün neye çalışıyorsun?
            </Text>
            <Text style={styles.overlayHint} {...textScale.long}>
              Kazandığın her yıldız bir antrenman puanıdır. Özelliklerin sahadaki anları gerçekten değiştirir.
            </Text>
            <View style={styles.cards}>
              {offer.map((card) => (
                <Touchable key={card.key} feedback="card" onPress={() => chooseCard(card)} style={styles.card} accessibilityRole="button" accessibilityLabel={`${card.title}. ${card.description}`}>
                  <Ionicons name={glyph(card.icon)} size={22} color={ui.accent} />
                  <Text style={styles.cardTitle} numberOfLines={2} {...textScale.dense}>
                    {card.title}
                  </Text>
                  <View style={styles.gains}>
                    {ATTR_KEYS.filter((key) => card.gains[key]).map((key) => (
                      <Text key={key} style={[styles.gain, { color: ATTR_COLORS[key] }]} {...textScale.badge}>
                        +{card.gains[key]} {ATTR_LABELS[key]}
                      </Text>
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
            <Text style={styles.overline} {...textScale.badge}>
              {moment.minute}. DAKİKA · {MOMENT_LABELS[moment.kind].toLocaleUpperCase("tr-TR")}
              {def.cup && index === 0 ? " · KUPA MAÇI" : ""}
            </Text>
            <Text style={styles.overlayTitle} {...textScale.dense}>
              {moment.story}
            </Text>
            <Text style={styles.overlayHint} {...textScale.long}>
              {index === 0 && def.tip ? def.tip : MOMENT_HINTS[moment.kind]}
            </Text>
            <Touchable feedback="button" haptic="light" onPress={() => startMoment(index)} style={[styles.go, { backgroundColor: ui.accent }]} accessibilityRole="button" testID="kariyer-go">
              <Ionicons name="play" size={18} color={ui.ink} />
              <Text style={[styles.goText, { color: ui.ink }]} {...textScale.dense}>
                {index === 0 ? "Maça çık" : "Devam"}
              </Text>
            </Touchable>
          </View>
        ) : null}

        {stage === "result" && result ? (
          <View style={styles.toastWrap} pointerEvents="box-none">
            {result.tone === "good" ? (
              <View pointerEvents="none" style={styles.toastBurst}>
                <Sunburst size={260} color={pal.good} opacity={0.4} />
                <SparkleBurst trigger={index + 1} radius={110} color={pal.trail} />
              </View>
            ) : null}
            <View style={[styles.toast, { borderColor: result.tone === "good" ? pal.good : result.tone === "ok" ? pal.trail : pal.bad }]}>
              <Text style={[styles.toastText, { color: result.tone === "good" ? pal.good : HUD.text }]} {...textScale.dense}>
                {result.title}
              </Text>
            </View>
            {canRetry ? (
              <Touchable feedback="button" onPress={retry} style={[styles.retry, { backgroundColor: ui.accent }]} accessibilityRole="button">
                <Ionicons name="refresh" size={16} color={ui.ink} />
                <Text style={[styles.goText, { color: ui.ink }]} {...textScale.dense}>
                  İkinci şans ({boosterStock.ikinci_sans})
                </Text>
              </Touchable>
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
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: HUD.scrim,
  },
  avatar: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  avatarText: { ...type.h2, fontFamily: fonts.bold },
  hudBody: { flex: 1, minWidth: 0 },
  name: { ...type.h3, color: HUD.text },
  meta: { ...type.caption, color: HUD.muted },
  dots: { flexDirection: "row", gap: space.xxs },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: HUD.glassBorder,
  },

  attrs: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  attr: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.sm,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: HUD.scrim,
  },
  rating: { marginLeft: "auto" },
  attrLabel: { ...type.micro, letterSpacing: 0, color: HUD.muted },
  attrValue: { ...type.labelSm, color: HUD.text },

  stage: { borderRadius: radius.xxl, overflow: "hidden", backgroundColor: HUD.scrim },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    padding: space.lg,
    backgroundColor: HUD.scrim,
  },
  overline: { ...type.overline, color: HUD.muted },
  overlayTitle: { ...type.display, color: HUD.text, textAlign: "center" },
  overlayHint: { ...type.body, color: HUD.muted, textAlign: "center" },

  cards: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  card: {
    flex: 1,
    minHeight: 132,
    alignItems: "center",
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.xl,
    backgroundColor: HUD.glass,
    borderWidth: 1,
    borderColor: HUD.glassBorder,
  },
  cardTitle: { ...type.labelSm, color: HUD.text, textAlign: "center" },
  gains: { alignItems: "center", gap: 1, marginTop: "auto" },
  gain: { ...type.micro, letterSpacing: 0 },
  skip: { paddingVertical: space.sm, paddingHorizontal: space.md },
  skipText: { ...type.caption, color: HUD.muted },

  go: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.xl,
    marginTop: space.sm,
    borderRadius: radius.pill,
  },
  goText: { ...type.h3, fontFamily: fonts.bold },

  toastWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: space.md },
  toast: {
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    backgroundColor: HUD.scrim,
  },
  toastText: { ...type.display, fontFamily: fonts.bold },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
});
