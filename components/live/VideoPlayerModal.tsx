/**
 * TAM EKRAN VİDEO OYNATICI — gol videoları, maç özeti, röportaj ve "maçın
 * golü" kartlarının ortak oynatıcısı.
 *
 * NEDEN ALT SAYFA YA DA SATIR İÇİ DEĞİL: oynatıcı eskiden ya bir alt sayfanın
 * (BottomSheet) içinde ya da kaydırılan listenin içindeki kartın yerinde
 * açılıyordu. Alt sayfada gövde `flex: 1` olduğu hâlde panelin yüksekliği
 * tanımsızdı (yalnız `maxHeight`), yani video alanının boyu düzen motorunun
 * kipine kalıyordu; satır içinde ise liste kayınca video ekrandan çıkıyordu.
 * Burada oynatıcı kendi penceresinde (Modal), ekranın tamamında ve ölçüleri
 * AÇIKÇA hesaplanarak çizilir — hangi listeden açıldığı fark etmez.
 *
 * - Kapak + yükleniyor göstergesi ilk kare gelene kadar; hata olursa
 *   "Tekrar dene".
 * - Yerel denetimler (oynat/duraklat, ileri-geri sarma, tam ekran/yatay).
 * - Birden çok video varsa önceki/sonraki ve altta sıra şeridi.
 * - Kapatınca, uygulama arka plana geçince video durur; pencere kapanınca
 *   oynatıcı serbest bırakılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useEvent } from "expo";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Touchable } from "@/components/ui";
import { RIG } from "@/lib/live/rig";
import { radius, space, textScale, type } from "@/theme";

export interface PlayerItem {
  id: string | number;
  url: string;
  poster?: string | null;
  /** Videonun altındaki ana satır, ör. "12' Gol · Ali Yılmaz". */
  title: string;
  /** İkinci satır, ör. "Kartal 2–1 Şahin". */
  subtitle?: string | null;
  /** Sıra şeridindeki kısa etiket (yoksa başlık). */
  chip?: string;
  /** Video ölçüsü biliniyorsa en-boy oranı buradan; yoksa 16:9. */
  width?: number | null;
  height?: number | null;
}

export interface VideoPlayerModalProps {
  visible: boolean;
  onClose: () => void;
  items: PlayerItem[];
  /** Açılışta gösterilecek videonun sırası. */
  initialIndex?: number;
  /** Pencerenin üst başlığı, ör. "Gol videosu". */
  heading: string;
  /** Video bitince başa dönsün (kısa klipler için). */
  loop?: boolean;
}

export function VideoPlayerModal(props: VideoPlayerModalProps) {
  // Kapalıyken hiçbir şey kurulmaz: Modal da yerel oynatıcı da yalnız açıkken var.
  if (!props.visible || props.items.length === 0) return null;
  return <PlayerWindow {...props} />;
}

function PlayerWindow({ onClose, items, initialIndex = 0, heading, loop = false }: VideoPlayerModalProps) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), items.length - 1));
  const [muted, setMuted] = useState(false);
  const [stage, setStage] = useState({ width: 0, height: 0 });

  const safeIndex = Math.min(index, items.length - 1);
  const current = items[safeIndex];
  const many = items.length > 1;

  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStage((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const go = useCallback(
    (next: number) => setIndex(Math.min(Math.max(0, next), items.length - 1)),
    [items.length],
  );

  // Video çerçevesi: sahneye sığan en büyük, en-boy oranı korunmuş dikdörtgen.
  const ratio =
    current.width && current.height && current.width > 0 && current.height > 0 ? current.width / current.height : 16 / 9;
  const frameWidth = Math.floor(Math.min(stage.width, stage.height * ratio));
  const frameHeight = Math.floor(frameWidth / ratio);

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
        <View style={styles.bar}>
          <Touchable style={styles.barBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Videoyu kapat">
            <Ionicons name="close" size={24} color={RIG.text} />
          </Touchable>
          <Text style={styles.heading} numberOfLines={1} accessibilityRole="header" {...textScale.dense}>
            {heading}
            {many ? ` · ${safeIndex + 1}/${items.length}` : ""}
          </Text>
          <Touchable
            style={styles.barBtn}
            onPress={() => setMuted((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={muted ? "Sesi aç" : "Sesi kapat"}
          >
            <Ionicons name={muted ? "volume-mute" : "volume-high"} size={22} color={RIG.text} />
          </Touchable>
        </View>

        <View style={styles.stage} onLayout={onStageLayout}>
          {frameWidth > 0 && frameHeight > 0 ? (
            <View style={{ width: frameWidth, height: frameHeight }}>
              <StageVideo key={current.id} item={current} muted={muted} loop={loop} />
            </View>
          ) : null}
        </View>

        <View style={styles.panel}>
          <View style={styles.meta}>
            <View style={styles.flex}>
              <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
                {current.title}
              </Text>
              {current.subtitle ? (
                <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
                  {current.subtitle}
                </Text>
              ) : null}
            </View>
            {many ? (
              <View style={styles.nav}>
                <Touchable
                  style={[styles.navBtn, safeIndex === 0 && styles.navBtnOff]}
                  onPress={() => go(safeIndex - 1)}
                  disabled={safeIndex === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Önceki video"
                >
                  <Ionicons name="play-skip-back" size={18} color={RIG.text} />
                </Touchable>
                <Touchable
                  style={[styles.navBtn, safeIndex >= items.length - 1 && styles.navBtnOff]}
                  onPress={() => go(safeIndex + 1)}
                  disabled={safeIndex >= items.length - 1}
                  accessibilityRole="button"
                  accessibilityLabel="Sonraki video"
                >
                  <Ionicons name="play-skip-forward" size={18} color={RIG.text} />
                </Touchable>
              </View>
            ) : null}
          </View>

          {many ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.strip}
              style={styles.stripWrap}
            >
              {items.map((item, i) => (
                <Touchable
                  key={item.id}
                  style={[styles.chip, i === safeIndex && styles.chipOn]}
                  onPress={() => go(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: i === safeIndex }}
                  accessibilityLabel={item.chip ?? item.title}
                >
                  <Ionicons name="play" size={11} color={i === safeIndex ? RIG.ink : RIG.textSoft} />
                  <Text style={[styles.chipText, i === safeIndex && styles.chipTextOn]} numberOfLines={1} {...textScale.dense}>
                    {item.chip ?? item.title}
                  </Text>
                </Touchable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Tek videonun sahnesi. Video değişince (`key`) baştan kurulur; "Tekrar dene"
 * de aynı yolu kullanır (yeni oynatıcı, temiz durum).
 */
function StageVideo({ item, muted, loop }: { item: PlayerItem; muted: boolean; loop: boolean }) {
  const [attempt, setAttempt] = useState(0);
  return <StageAttempt key={attempt} item={item} muted={muted} loop={loop} onRetry={() => setAttempt((n) => n + 1)} />;
}

function StageAttempt({
  item,
  muted,
  loop,
  onRetry,
}: {
  item: PlayerItem;
  muted: boolean;
  loop: boolean;
  onRetry: () => void;
}) {
  const player = useVideoPlayer(item.url, (p) => {
    p.loop = loop;
    p.muted = muted;
    p.play();
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  // Kapak, ilk kare gelince kalkar. Oynatma başladıysa da kalkar: ilk kare
  // olayı kaçsa bile kapak videonun üstünde asılı kalmasın.
  const [firstFrame, setFirstFrame] = useState(false);
  useEffect(() => {
    if (isPlaying && status === "readyToPlay") setFirstFrame(true);
  }, [isPlaying, status]);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  // Uygulama arka plana geçince dur (ekran kilidi, başka uygulamaya geçiş).
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
        // Modal ayrı bir penceredir; SurfaceView orada katman/kırpma sorunu
        // çıkarabildiği için görüntü TextureView ile çizilir.
        surfaceType="textureView"
        onFirstFrameRender={() => setFirstFrame(true)}
      />
      {waiting ? (
        <View style={styles.cover} pointerEvents="none">
          {item.poster && !posterFailed ? (
            <Image
              source={{ uri: item.poster }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              onError={() => setPosterFailed(true)}
            />
          ) : null}
          <View style={styles.spinner}>
            <ActivityIndicator size="large" color={RIG.text} />
          </View>
        </View>
      ) : null}
      {failed ? (
        <View style={styles.error}>
          <Ionicons name="cloud-offline-outline" size={32} color={RIG.textSoft} />
          <Text style={styles.errorTitle} {...textScale.dense}>
            Video oynatılamadı
          </Text>
          <Text style={styles.errorBody} {...textScale.dense}>
            Bağlantını kontrol edip yeniden dene.
          </Text>
          <Touchable style={styles.retry} onPress={onRetry} haptic="light" accessibilityRole="button" accessibilityLabel="Videoyu tekrar dene">
            <Ionicons name="refresh" size={16} color={RIG.ink} />
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
  root: { flex: 1, backgroundColor: RIG.stage },
  flex: { flex: 1, minWidth: 0 },
  bar: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.xs, height: 52 },
  barBtn: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  heading: { ...type.h2, color: RIG.text, flex: 1, textAlign: "center" },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  frame: { flex: 1, backgroundColor: RIG.stage },
  cover: { ...StyleSheet.absoluteFillObject, backgroundColor: RIG.stage, alignItems: "center", justifyContent: "center" },
  spinner: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: RIG.glass,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: RIG.stage,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    padding: space.lg,
  },
  errorTitle: { ...type.h2, color: RIG.text, textAlign: "center" },
  errorBody: { ...type.bodySm, color: RIG.textSoft, textAlign: "center" },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 40,
    paddingHorizontal: space.lg,
    marginTop: space.sm,
    borderRadius: radius.pill,
    backgroundColor: RIG.text,
  },
  retryText: { ...type.label, color: RIG.ink },
  panel: { paddingTop: space.md, paddingBottom: space.md, gap: space.md },
  meta: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg },
  title: { ...type.h2, color: RIG.text },
  sub: { ...type.bodySm, color: RIG.textSoft, marginTop: space.xxs },
  nav: { flexDirection: "row", alignItems: "center", gap: space.xs },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: RIG.panelStrong,
  },
  navBtnOff: { opacity: 0.35 },
  stripWrap: { flexGrow: 0 },
  strip: { gap: space.xs, paddingHorizontal: space.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: RIG.panelStrong,
  },
  chipOn: { backgroundColor: RIG.text },
  chipText: { ...type.caption, color: RIG.textSoft },
  chipTextOn: { color: RIG.ink },
});
