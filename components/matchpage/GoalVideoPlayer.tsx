/**
 * GOL VİDEOSU OYNATICI — maç sayfasının tam ekran gol oynatıcısı.
 *
 * Zaman tünelindeki "▶ Golü izle" ve "Gol videoları" ızgarası buraya açılır.
 * Ortak `VideoPlayerModal`ın (yayın stüdyosu alanı) maça özgü sürümü; ondan
 * farkı İNDİR düğmesi, "Senin golün" vurgusu ve golcüyle zenginleşmiş sıra
 * şerididir.
 *
 * DÜZEN (yukarıdan aşağı, tema ne olursa olsun sahne koyu):
 *   ┌ kapat ─── Gol videosu · 3/12 ─── ses ┐
 *   │             [ video ]               │  en-boy klipten; video izi
 *   │                                     │  gelince gerçek ölçüye geçer
 *   ├ 21'  Resul Kaya   ★ Senin golün      │  (dikey çekim dikey görünür)
 *   │ SAİNT DİRİLİŞ 16–1 Haymana           │
 *   │ [◀]   [ ⬇  Videoyu indir  ]   [▶]    │  indirirken yüzde + ilerleme
 *   └ 1' Kaan · 7' Gönen · 11' Bulut …    ┘
 *
 * Yükleniyor: kapak + dönen gösterge, ilk kare gelince kalkar. Hata:
 * "Tekrar dene". Uygulama arka plana geçince video durur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useEvent } from "expo";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GradientBar, Touchable, withAlpha } from "@/components/ui";
import { clipLabel, type GoalClip } from "@/lib/live/clips";
import { dark as stagePalette, fonts, glowStyle, hairline, radius, space, textScale, type } from "@/theme";

import { progressLabel, type ClipDownloads } from "./clipDownload";

/** Sahne her iki temada da koyudur: renkler koyu paletten. */
const S = stagePalette;

export interface GoalVideoPlayerProps {
  clips: GoalClip[];
  initialId: number | null;
  visible: boolean;
  onClose: () => void;
  /** Golcünün adı. */
  nameFor: (clip: GoalClip) => string | null;
  /** "SAİNT DİRİLİŞ 16–1 Haymana Demirspor" */
  subtitle?: string | null;
  /** Oturumdaki üyenin golü mü. */
  isMine?: (clip: GoalClip) => boolean;
  downloads: ClipDownloads;
}

const isPlayable = (url: unknown): boolean => /^https?:\/\//i.test(String(url ?? ""));

export function GoalVideoPlayer(props: GoalVideoPlayerProps) {
  const playable = useMemo(() => props.clips.filter((clip) => isPlayable(clip.url)), [props.clips]);
  // Kapalıyken Modal da yerel oynatıcı da kurulmaz.
  if (!props.visible || playable.length === 0) return null;
  return <PlayerWindow {...props} clips={playable} />;
}

function PlayerWindow({ clips, initialId, onClose, nameFor, subtitle, isMine, downloads }: GoalVideoPlayerProps) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(() => {
    const at = initialId != null ? clips.findIndex((clip) => clip.id === initialId) : -1;
    return at >= 0 ? at : 0;
  });
  const [muted, setMuted] = useState(false);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  /* Video izinden okunan gerçek ölçü (klip kaydında ölçü yoksa ya da çekim
     dikeyse kayıttaki ölçü yanıltır). Klip değişince sıfırlanır. */
  const [trackSize, setTrackSize] = useState<{ id: number; width: number; height: number } | null>(null);

  const safeIndex = Math.min(index, clips.length - 1);
  const current = clips[safeIndex];
  const many = clips.length > 1;
  const mine = isMine?.(current) ?? false;
  const name = nameFor(current);
  const dl = downloads.stateOf(current.id);
  const busy = dl.status === "downloading" || dl.status === "saving";

  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStage((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const go = useCallback((next: number) => setIndex(Math.min(Math.max(0, next), clips.length - 1)), [clips.length]);

  // Çerçeve: sahneye sığan en büyük, en-boy oranı korunmuş dikdörtgen.
  const size =
    trackSize && trackSize.id === current.id
      ? trackSize
      : current.width && current.height
        ? { width: current.width, height: current.height }
        : null;
  const ratio = size && size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const frameWidth = Math.floor(Math.min(stage.width, stage.height * ratio));
  const frameHeight = Math.floor(frameWidth / ratio);
  const onTrackSize = useCallback(
    (width: number, height: number) => setTrackSize({ id: current.id, width, height }),
    [current.id],
  );

  /* Sıra şeridinde seçili klip görünür alanda kalsın. */
  const stripRef = useRef<ScrollView>(null);
  const chipX = useRef(new Map<number, number>());
  const scrollToChip = useCallback((at: number, animated: boolean) => {
    const x = chipX.current.get(at);
    if (x != null) stripRef.current?.scrollTo({ x: Math.max(0, x - space.xl * 2), animated });
  }, []);
  useEffect(() => scrollToChip(safeIndex, true), [safeIndex, scrollToChip]);
  /* İlk açılışta çipler ölçülünce seçili olana atla (efekt ölçümden önce koşar). */
  const onChipLayout = useCallback(
    (at: number, x: number) => {
      chipX.current.set(at, x);
      if (at === safeIndex) scrollToChip(at, false);
    },
    [safeIndex, scrollToChip],
  );

  const download = useCallback(() => void downloads.download(current), [downloads, current]);

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      <StatusBar style="light" />
      <View
        style={[
          styles.root,
          { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
        ]}
      >
        {/* — Üst çubuk — */}
        <View style={styles.bar}>
          <Touchable style={styles.glassBtn} feedback="icon" onPress={onClose} accessibilityRole="button" accessibilityLabel="Videoyu kapat">
            <Ionicons name="close" size={22} color={S.textPrimary} />
          </Touchable>
          <View style={styles.headingWrap}>
            <Text style={styles.heading} numberOfLines={1} accessibilityRole="header" {...textScale.dense}>
              Gol videosu
            </Text>
            {many ? (
              <Text style={styles.counter} {...textScale.badge}>
                {`${safeIndex + 1}/${clips.length}`}
              </Text>
            ) : null}
          </View>
          <Touchable
            style={styles.glassBtn}
            feedback="icon"
            onPress={() => setMuted((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={muted ? "Sesi aç" : "Sesi kapat"}
          >
            <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color={S.textPrimary} />
          </Touchable>
        </View>

        {/* — Sahne — */}
        <View style={styles.stage} onLayout={onStageLayout}>
          {frameWidth > 0 && frameHeight > 0 ? (
            <View style={[styles.frameWrap, { width: frameWidth, height: frameHeight }]}>
              <StageVideo key={current.id} clip={current} muted={muted} onTrackSize={onTrackSize} />
            </View>
          ) : null}
        </View>

        {/* — Bilgi + eylemler — */}
        <View style={styles.panel}>
          <View style={styles.meta}>
            {current.minute != null ? (
              <View style={styles.minute}>
                <LinearGradient
                  colors={S.gradientSignature}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, styles.minuteFill]}
                />
                <Text style={styles.minuteText} {...textScale.badge}>
                  {`${current.minute}'`}
                </Text>
              </View>
            ) : null}
            <View style={styles.flex}>
              <View style={styles.titleLine}>
                <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
                  {name ?? clipLabel(current)}
                </Text>
                {mine ? (
                  <View style={styles.mineBadge}>
                    <Ionicons name="star" size={10} color={S.star} />
                    <Text style={styles.mineText} {...textScale.badge}>
                      Senin golün
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
                {[current.own_goal ? "Kendi kalesine" : null, subtitle].filter(Boolean).join(" · ") || clipLabel(current)}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <NavButton icon="play-skip-back" label="Önceki gol" disabled={!many || safeIndex === 0} onPress={() => go(safeIndex - 1)} />
            <Touchable
              feedback="button"
              haptic="light"
              onPress={download}
              disabled={busy}
              style={[styles.download, mine && styles.downloadMine]}
              accessibilityRole="button"
              accessibilityLabel={busy ? `Video indiriliyor ${progressLabel(dl)}` : "Videoyu indir"}
              accessibilityState={{ busy }}
            >
              <LinearGradient
                colors={S.gradientBrand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.downloadFill]}
              />
              {busy ? (
                <ActivityIndicator size="small" color={S.textOnBrand} />
              ) : (
                <Ionicons
                  name={dl.status === "done" ? "checkmark-circle" : "download-outline"}
                  size={18}
                  color={S.textOnBrand}
                />
              )}
              <Text style={styles.downloadText} numberOfLines={1} {...textScale.dense}>
                {dl.status === "downloading"
                  ? `İndiriliyor ${progressLabel(dl)}`
                  : dl.status === "saving"
                    ? "Kaydetmeye hazır"
                    : dl.status === "done"
                      ? "İndirildi · tekrar"
                      : "Videoyu indir"}
              </Text>
            </Touchable>
            <NavButton
              icon="play-skip-forward"
              label="Sonraki gol"
              disabled={!many || safeIndex >= clips.length - 1}
              onPress={() => go(safeIndex + 1)}
            />
          </View>
          {dl.status === "downloading" ? (
            <GradientBar value={dl.progress < 0 ? 0.5 : dl.progress} height={3} track={S.glassLine} style={styles.progress} />
          ) : (
            <Text style={styles.hint} numberOfLines={2} {...textScale.dense}>
              {Platform.OS === "web"
                ? "Video bilgisayarına indirilir."
                : "İndirince paylaşım sayfası açılır — “Videoyu kaydet”i seç."}
            </Text>
          )}

          {many ? (
            <ScrollView
              ref={stripRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.strip}
              style={styles.stripWrap}
            >
              {clips.map((clip, i) => {
                const on = i === safeIndex;
                const clipMine = isMine?.(clip) ?? false;
                const who = nameFor(clip);
                return (
                  <Touchable
                    key={clip.id}
                    feedback="icon"
                    haptic="selection"
                    style={[styles.chip, on && styles.chipOn, clipMine && !on && styles.chipMine]}
                    onPress={() => go(i)}
                    onLayout={(event: LayoutChangeEvent) => onChipLayout(i, event.nativeEvent.layout.x)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${clipLabel(clip)}${who ? `, ${who}` : ""}`}
                  >
                    {clipMine ? <Ionicons name="star" size={10} color={on ? S.bg : S.star} /> : null}
                    <Text style={[styles.chipMinute, on && styles.chipTextOn]} {...textScale.badge}>
                      {clip.minute != null ? `${clip.minute}'` : "—"}
                    </Text>
                    <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1} {...textScale.dense}>
                      {shortName(who) ?? "Gol"}
                    </Text>
                  </Touchable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function NavButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable
      feedback="icon"
      haptic="selection"
      style={[styles.navBtn, disabled && styles.navBtnOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={S.textPrimary} />
    </Touchable>
  );
}

/** "Ahmet Bulut Kaya" → "A. Kaya" (şeritte kısa ad). */
function shortName(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/u);
  if (parts.length < 2) return name;
  return `${parts[0].charAt(0)}. ${parts[parts.length - 1]}`;
}

/** Tek klibin sahnesi: klip değişince (`key`) baştan kurulur; "Tekrar dene" de. */
function StageVideo({
  clip,
  muted,
  onTrackSize,
}: {
  clip: GoalClip;
  muted: boolean;
  onTrackSize: (width: number, height: number) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    <StageAttempt
      key={attempt}
      clip={clip}
      muted={muted}
      onTrackSize={onTrackSize}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

function StageAttempt({
  clip,
  muted,
  onTrackSize,
  onRetry,
}: {
  clip: GoalClip;
  muted: boolean;
  onTrackSize: (width: number, height: number) => void;
  onRetry: () => void;
}) {
  const player = useVideoPlayer(clip.url, (p) => {
    p.loop = true;
    p.muted = muted;
    p.play();
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { videoTrack } = useEvent(player, "videoTrackChange", { videoTrack: null });
  const [firstFrame, setFirstFrame] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    if (isPlaying && status === "readyToPlay") setFirstFrame(true);
  }, [isPlaying, status]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    const w = videoTrack?.size?.width ?? 0;
    const h = videoTrack?.size?.height ?? 0;
    if (w > 0 && h > 0) onTrackSize(w, h);
  }, [videoTrack, onTrackSize]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        try {
          player.pause();
        } catch {
          /* oynatıcı serbest bırakılmış olabilir */
        }
      }
    });
    return () => sub.remove();
  }, [player]);

  const failed = status === "error";
  const waiting = !failed && !firstFrame;

  return (
    <View style={styles.frame}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
        fullscreenOptions={FULLSCREEN}
        surfaceType="textureView"
        onFirstFrameRender={() => setFirstFrame(true)}
      />
      {waiting ? (
        <View style={styles.cover} pointerEvents="none">
          {clip.poster_url && !posterFailed ? (
            <Image
              source={{ uri: clip.poster_url }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              onError={() => setPosterFailed(true)}
            />
          ) : null}
          <View style={styles.spinner}>
            <ActivityIndicator size="large" color={S.textPrimary} />
            <Text style={styles.spinnerText} {...textScale.badge}>
              Yükleniyor
            </Text>
          </View>
        </View>
      ) : null}
      {failed ? (
        <View style={styles.error}>
          <Ionicons name="cloud-offline-outline" size={32} color={S.textSecondary} />
          <Text style={styles.errorTitle} {...textScale.dense}>
            Video oynatılamadı
          </Text>
          <Text style={styles.errorBody} {...textScale.dense}>
            Bağlantını kontrol edip yeniden dene.
          </Text>
          <Touchable style={styles.retry} feedback="button" onPress={onRetry} haptic="light" accessibilityRole="button" accessibilityLabel="Videoyu tekrar dene">
            <Ionicons name="refresh" size={16} color={S.bg} />
            <Text style={styles.retryText} {...textScale.dense}>
              Tekrar dene
            </Text>
          </Touchable>
        </View>
      ) : null}
    </View>
  );
}

const FULLSCREEN = { enable: true } as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: S.bg },
  flex: { flex: 1, minWidth: 0 },
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, height: 56 },
  glassBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: S.glass,
    borderWidth: hairline,
    borderColor: S.glassBorder,
  },
  headingWrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs },
  heading: { ...type.h3, color: S.textPrimary },
  counter: {
    ...type.numSmStrong,
    color: S.brandAccent,
    paddingHorizontal: space.s,
    paddingVertical: space.px,
    borderRadius: radius.pill,
    backgroundColor: S.brandDim,
    overflow: "hidden",
  },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: S.matchCanvas },
  frameWrap: { overflow: "hidden" },
  frame: { flex: 1, backgroundColor: S.matchCanvas },
  cover: { ...StyleSheet.absoluteFillObject, backgroundColor: S.matchCanvas, alignItems: "center", justifyContent: "center" },
  spinner: {
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.xl,
    backgroundColor: withAlpha(S.bg, 0.72),
  },
  spinnerText: { ...type.overline, color: S.textSecondary },
  error: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: S.matchCanvas,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    padding: space.lg,
  },
  errorTitle: { ...type.h3, color: S.textPrimary, textAlign: "center" },
  errorBody: { ...type.bodySm, color: S.textSecondary, textAlign: "center" },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 40,
    paddingHorizontal: space.lg,
    marginTop: space.sm,
    borderRadius: radius.pill,
    backgroundColor: S.textPrimary,
  },
  retryText: { ...type.label, color: S.bg },

  panel: {
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.sm,
    borderTopWidth: hairline,
    borderColor: S.glassLine,
    backgroundColor: S.surface1,
  },
  meta: { flexDirection: "row", alignItems: "center", gap: space.m, paddingHorizontal: space.lg },
  minute: { minWidth: 44, height: 32, paddingHorizontal: space.s, alignItems: "center", justifyContent: "center", ...glowStyle(S.glow, 1) },
  minuteFill: { borderRadius: radius.pill },
  minuteText: { ...type.numSmStrong, color: S.onDark },
  titleLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  title: { ...type.h2, color: S.textPrimary, flexShrink: 1 },
  mineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.s,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(S.star, 0.16),
    borderWidth: hairline,
    borderColor: withAlpha(S.star, 0.5),
  },
  mineText: { ...type.micro, fontFamily: fonts.bold, color: S.star },
  sub: { ...type.bodySm, color: S.textSecondary, marginTop: space.xxs },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.xs },
  navBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: S.surface2,
    borderWidth: hairline,
    borderColor: S.border,
  },
  navBtnOff: { opacity: 0.35 },
  download: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    borderRadius: radius.pill,
    overflow: "hidden",
    ...glowStyle(S.glow, 1),
  },
  downloadMine: { borderWidth: 1, borderColor: withAlpha(S.star, 0.7) },
  downloadFill: { borderRadius: radius.pill },
  downloadText: { ...type.label, fontFamily: fonts.semibold, color: S.textOnBrand },
  progress: { marginHorizontal: space.lg },
  hint: { ...type.caption, color: S.textTertiary, textAlign: "center", paddingHorizontal: space.lg },
  stripWrap: { flexGrow: 0 },
  strip: { gap: space.xs, paddingHorizontal: space.lg, paddingTop: space.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 34,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    backgroundColor: S.surface2,
    borderWidth: hairline,
    borderColor: S.border,
  },
  chipOn: { backgroundColor: S.textPrimary, borderColor: S.textPrimary },
  chipMine: { borderColor: withAlpha(S.star, 0.6) },
  chipMinute: { ...type.numSmStrong, color: S.brandAccent },
  chipText: { ...type.caption, color: S.textSecondary, maxWidth: 110 },
  chipTextOn: { color: S.bg },
});
