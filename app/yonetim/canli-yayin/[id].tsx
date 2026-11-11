/**
 * MOBİL YAYIN STÜDYOSU — `/yonetim/canli-yayin/:id` (yetki: matches.live)
 *
 * Telefon yan çevrilir (ekran yatay kilitlidir). Solda 16:9 kamera sahnesi,
 * üstünde yayına gömülen grafikler; sağda reji rayı:
 *
 *   Reji      skor (+ GOL), saat / devre, kart · penaltı · değişiklik, geri al
 *   Tekrar    anlık tekrar (son 6–13 sn), gol klipleri, ağır çekim (Android)
 *   Skorbord  göster / gizle, çeşit, köşe, saat, kısa kod / renk, GOL bandı, sponsor
 *   Altyazı   serbest metin + hazır şablonlar, kendiliğinden kalkma süresi
 *   Yayın     YouTube yayını aç → başlat → bitir, elle RTMP, yayın sağlığı
 *   Ayarlar   kamera, yakınlaştırma, fener, mikrofon, kalite
 *
 * YAYINA GÖMME: sahnedeki grafik katmanı (skorbord, altyazı, GOL bandı,
 * sponsor, TEKRAR rozeti) PNG'ye çekilir (react-native-view-shot) ve yerel
 * modüle verilir; modül onu videonun her karesine basar. Ekranda gördüğün,
 * YouTube'daki görüntüdür. Ayrıntı: components/live/useOverlayBurn.ts.
 *
 * SKORBORD GÖRÜNÜMÜ: maçın web "Yayın Tasarımı"ndaki logo ve renk teması
 * (GET /api/maclar/:id/overlay-branding) bütün grafiklere uygulanır.
 *
 * Yerel modülün olmadığı derlemelerde (Expo Go, web) kamera alanı uyarı
 * gösterir; reji kontrolleri yine çalışır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { usePreventRemove } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Redirect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, AppState, BackHandler, Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { clientEventId } from "@/components/admin/matches/model";
import { BottomBoard } from "@/components/live/BottomBoard";
import { GoalFlash, LowerThird, ReplayBadge, SponsorBug, type GoalFlashData, type GoalFlashPhase } from "@/components/live/BroadcastGraphics";
import { BroadcastPanel, Btn } from "@/components/live/BroadcastPanel";
import { CaptionPanel, type CaptionTemplate } from "@/components/live/CaptionPanel";
import { CompactBug } from "@/components/live/CompactBug";
import { HealthCard, HealthHud } from "@/components/live/HealthHud";
import { PlayerPicker } from "@/components/live/PlayerPicker";
import { RejiPanel } from "@/components/live/RejiPanel";
import { REPLAY_RATE_SUPPORTED, ReplayPanel, type ReplayRate } from "@/components/live/ReplayPanel";
import { ScoreboardPanel } from "@/components/live/ScoreboardPanel";
import { SettingsPanel } from "@/components/live/SettingsPanel";
import { bugCode, ScoreBug, type ScoreBugProps } from "@/components/live/ScoreBug";
import { useGoalClips, type LocalClip } from "@/components/live/useGoalClips";
import { PHASE_LABEL, useLiveMatch, type ControlAction } from "@/components/live/useLiveMatch";
import { unionBox, useOverlayBurn, type BurnBox } from "@/components/live/useOverlayBurn";
import { useStudioSettings } from "@/components/live/useStudioSettings";
import { Touchable, useReduceMotion, useToast } from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { eventLabel, isGoalCode } from "@/lib/api/admin/matches";
import { mediaUrl } from "@/lib/format";
import { bugPalette, fetchOverlayBranding } from "@/lib/live/branding";
import {
  cardCaption,
  goalCaption,
  matchInfoCaption,
  playerCaption,
  scoreCaption,
  sponsorCaption,
  substitutionCaption,
  type Caption,
} from "@/lib/live/lowerThird";
import { RIG, encoderMessageText, resolveEncoder } from "@/lib/live/rig";
import { BUG, GFX, clockText, teamShortCode } from "@/lib/live/scorebug";
import { getBroadcastDesk, sponsorLogo } from "@/lib/live/studioApi";
import {
  createMatchLiveStream,
  endMatchLiveStream,
  getLiveStreamConfig,
  getMatchLiveStream,
  ingestUrl,
  liveErrorText,
  type MatchLiveStream,
  type YoutubePrivacy,
} from "@/lib/live/youtube";
import { useAuth } from "@/providers/AuthProvider";
import { duration, radius, space, type } from "@/theme";
import {
  LiveCameraView,
  getCameraCapabilities,
  getDeviceStatus,
  isLiveAvailable,
  playReplay,
  requestLivePermissions,
  setMuted as nativeSetMuted,
  setOverlay,
  setTorch as nativeSetTorch,
  setZoom as nativeSetZoom,
  startStream,
  stopReplay,
  stopStream,
  supportsCameraControls,
  type CameraCapabilities,
  type DeviceStatus,
  type LiveState,
  type LiveStats,
} from "@/modules/elitlig-live";

type Tab = "reji" | "tekrar" | "skorbord" | "altyazi" | "yayin" | "ayarlar";
type Side = "home" | "away";

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "reji", label: "Reji", icon: "football" },
  { key: "tekrar", label: "Tekrar", icon: "repeat" },
  { key: "skorbord", label: "Skor", icon: "easel" },
  { key: "altyazi", label: "Altyazı", icon: "text" },
  { key: "yayin", label: "Yayın", icon: "radio" },
  { key: "ayarlar", label: "Ayar", icon: "settings" },
];

const ON_AIR: LiveState[] = ["connecting", "live", "reconnecting"];
const KEEP_AWAKE_TAG = "elitlig-live";
/** GOL bandı: önce büyük "GOL!" (kısa), sonra golcü + skor. */
const GOAL_BURST_MS = 1800;
const GOAL_FLASH_MS = 7500;

/** Oyuncu seçici neyi soruyor. */
type PickerState =
  | { kind: "event"; side: Side; code: string; title: string; clipKey: string | null; clientId: string }
  | { kind: "subOut"; side: Side; clientId: string }
  | { kind: "subIn"; side: Side; outId: string | null; clientId: string }
  | { kind: "caption"; side: Side };

type SlotKey = "bug" | "caption" | "goal" | "sponsor" | "replay";

export default function LiveBroadcastScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const matchId = Number(Array.isArray(params.id) ? params.id[0] : params.id);

  if (!auth.user && !auth.initializing) return <Redirect href="/giris" />;
  if (!auth.user) return <View style={styles.root} />;
  if (!auth.isManagement || !hasAnyPermission(auth.user, ["matches.live"])) {
    return <Locked text="Canlı yayın ve reji için “matches.live” yetkisi gerekir." />;
  }
  if (!Number.isFinite(matchId) || matchId <= 0) return <Locked text="Maç bulunamadı." />;
  return <LiveBroadcast matchId={matchId} userId={Number(auth.user.id) || null} />;
}

function Locked({ text }: { text: string }) {
  const router = useRouter();
  return (
    <View style={[styles.root, styles.center]}>
      <StatusBar hidden />
      <Ionicons name="lock-closed" size={28} color={RIG.textSoft} />
      <Text style={styles.lockedText} allowFontScaling={false}>
        {text}
      </Text>
      <Btn label="Geri dön" icon="arrow-back" tone="soft" onPress={() => (router.canGoBack() ? router.back() : router.replace("/yonetim/studyo"))} />
    </View>
  );
}

function LiveBroadcast({ matchId, userId }: { matchId: number; userId: number | null }) {
  // Yayın boyunca ekran kararmasın (izin verilmeyen ortamda sessizce geçer).
  useEffect(() => {
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void Promise.resolve()
        .then(() => deactivateKeepAwake(KEEP_AWAKE_TAG))
        .catch(() => undefined);
    };
  }, []);
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const teams = useTeamLogos();
  const live = useLiveMatch(matchId, userId);
  const match = live.match;
  const { settings, change } = useStudioSettings();

  /* ───────── izin ───────── */
  const nativeReady = isLiveAvailable();
  const [permission, setPermission] = useState<boolean | null>(nativeReady ? null : false);
  const permissionRef = useRef(permission);
  permissionRef.current = permission;
  useEffect(() => {
    if (!nativeReady) return;
    let alive = true;
    const ask = () => void requestLivePermissions().then((ok) => alive && setPermission(ok), () => alive && setPermission(false));
    ask();
    // Ayarlar'dan izin verip dönen kullanıcı için: ön plana gelince yeniden bak.
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && permissionRef.current === false) ask();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [nativeReady]);

  /* ───────── yerleşim ───────── */
  const [collapsed, setCollapsed] = useState(false);
  const usableW = width - insets.left - insets.right;
  const usableH = height - insets.top - insets.bottom;
  const railW = collapsed ? 60 : Math.min(340, Math.max(264, Math.round(usableW * 0.36)));
  const stageW = Math.max(160, Math.floor(Math.min(usableW - railW - space.sm, (usableH * 16) / 9)));
  const stageH = Math.floor((stageW * 9) / 16);
  const bugScale = stageW / BUG.stageW;

  /* ───────── kodlayıcı (telefon → RTMP) ───────── */
  const [encoder, setEncoder] = useState<{ state: LiveState; message?: string }>({ state: "idle" });
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [muted, setMutedState] = useState(false);
  const mutedRef = useRef(false);
  const toggleMic = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMutedState(next);
    void nativeSetMuted(next).catch(() => undefined);
  }, []);
  const [overlayOn, setOverlayOn] = useState(true);
  const [onAirSince, setOnAirSince] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const encoderOn = ON_AIR.includes(encoder.state);
  const encoderCfg = useMemo(() => resolveEncoder(settings.quality, settings.fps, settings.bitrateKbps), [settings.quality, settings.fps, settings.bitrateKbps]);

  /* ───────── kamera: yakınlaştırma / fener ───────── */
  const controlsSupported = nativeReady && supportsCameraControls();
  const [caps, setCaps] = useState<CameraCapabilities | null>(null);
  const [zoom, setZoomState] = useState(1);
  const [torchOn, setTorchOn] = useState(false);
  const refreshCaps = useCallback(() => {
    if (!controlsSupported) return;
    void getCameraCapabilities().then((c) => {
      if (!c) return;
      setCaps(c);
      setZoomState(c.zoom);
      setTorchOn(c.torchOn);
    });
  }, [controlsSupported]);
  const capsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshCapsSoon = useCallback(() => {
    if (capsTimer.current) clearTimeout(capsTimer.current);
    // Kamera açılışı / değişimi eşzamansız: kısa bir süre sonra sor.
    capsTimer.current = setTimeout(refreshCaps, 700);
  }, [refreshCaps]);
  useEffect(
    () => () => {
      if (capsTimer.current) clearTimeout(capsTimer.current);
    },
    []
  );
  const applyZoom = (level: number) => {
    setZoomState(level);
    void nativeSetZoom(level)
      .then((applied) => applied != null && setZoomState(applied))
      .catch(() => toast.show({ message: "Yakınlaştırma uygulanamadı.", tone: "danger" }));
  };
  const applyTorch = (on: boolean) => {
    void nativeSetTorch(on)
      .then((result) => setTorchOn(Boolean(result)))
      .catch(() => toast.show({ message: "Fener açılamadı.", tone: "danger" }));
  };
  const flipCamera = () => {
    setFacing((f) => (f === "back" ? "front" : "back"));
    setTorchOn(false);
    setZoomState(1);
    refreshCapsSoon();
  };

  /* ───────── pil / ağ (dakikada bir) ───────── */
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  useEffect(() => {
    if (!nativeReady) return;
    let alive = true;
    const read = () => void getDeviceStatus().then((d) => alive && d && setDevice(d));
    read();
    const id = setInterval(read, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [nativeReady]);

  const onState = useCallback(
    (e: { nativeEvent: { state: LiveState; message?: string } }) => {
      const next = e.nativeEvent;
      setEncoder({ state: next.state, message: next.message });
      if (next.state === "live") setOnAirSince((v) => v ?? Date.now());
      if (next.state === "failed") {
        setOnAirSince(null);
        setStats(null);
        toast.show({ message: encoderMessageText("failed", next.message), tone: "danger" });
      }
      if (next.state === "stopped" || next.state === "idle" || next.state === "previewing") {
        setOnAirSince(null);
        setStats(null);
      }
      if (next.state === "previewing" || next.state === "live") refreshCapsSoon();
    },
    [refreshCapsSoon, toast]
  );
  const onStats = useCallback((e: { nativeEvent: LiveStats }) => setStats(e.nativeEvent), []);

  /* ───────── YouTube ───────── */
  const [privacy, setPrivacy] = useState<YoutubePrivacy>("public");
  const config = useQuery({ queryKey: ["live-stream", "config"], queryFn: getLiveStreamConfig, staleTime: 5 * 60_000, retry: false });
  useEffect(() => {
    if (config.data?.privacy) setPrivacy(config.data.privacy);
  }, [config.data?.privacy]);
  const streamKey = ["live-stream", "match", matchId] as const;
  const streamQuery = useQuery({
    queryKey: streamKey,
    queryFn: async () => (await getMatchLiveStream(matchId)).live_stream,
    enabled: Boolean(config.data?.configured),
    // YouTube kotası (her sorgu ≈2 birim): açılışta bir kez, sonra yalnız
    // telefon görüntü gönderirken 30 sn'de bir.
    refetchInterval: encoderOn ? 30_000 : false,
    staleTime: 20_000,
    retry: false,
  });
  const ytStream = streamQuery.data ?? null;
  const setYt = (next: MatchLiveStream | null) => queryClient.setQueryData(streamKey, next);

  const burnResetRef = useRef<() => void>(() => undefined);
  const begin = useCallback(
    async (url: string) => {
      if (!nativeReady) throw new Error("Kamera yayını bu uygulama sürümünde yok. Mağazadaki güncel sürümü kullan.");
      const ok = permissionRef.current === true ? true : await requestLivePermissions();
      setPermission(ok);
      if (!ok) {
        Alert.alert("İzin gerekli", "Canlı yayın için kamera ve mikrofon izni gerekir.", [
          { text: "Vazgeç", style: "cancel" },
          { text: "Ayarları aç", onPress: () => void Linking.openSettings().catch(() => undefined) },
        ]);
        return false;
      }
      // İzin yeni verildiyse kamera görünümü bu çizimde bağlanır; yerel taraf hazır olsun.
      if (permissionRef.current !== true) await new Promise((resolve) => setTimeout(resolve, 600));
      // "Bağlanıyor" ÖNCE yazılır: yerel modülün live / failed olayı, startStream
      // sözü çözülmeden gelebilir ve sonradan yazılan "connecting" onu ezerdi.
      setEncoder({ state: "connecting" });
      try {
        await startStream(url, {
          width: encoderCfg.width,
          height: encoderCfg.height,
          fps: encoderCfg.fps,
          videoBitrateKbps: encoderCfg.videoBitrateKbps,
          audioBitrateKbps: 128,
        });
      } catch (error) {
        setEncoder((current) => (current.state === "connecting" ? { state: "previewing" } : current));
        throw error;
      }
      burnResetRef.current();
      return true;
    },
    [nativeReady, encoderCfg]
  );

  const startYoutube = async () => {
    if (busy || encoderOn) return;
    setBusy(true);
    try {
      const open = ytStream && ytStream.active !== false && ingestUrl(ytStream) ? ytStream : await createMatchLiveStream(matchId, { privacy });
      setYt(open);
      const url = ingestUrl(open);
      if (!url) throw new Error("YouTube yayın adresi alınamadı. Birkaç saniye sonra yeniden dene.");
      if (await begin(url)) {
        void queryClient.invalidateQueries({ queryKey: ["admin", "matches", "detail", matchId] });
        toast.show({ message: "Görüntü YouTube'a gönderiliyor. Yayın 10–30 saniye içinde canlıya geçer.", tone: "success" });
      }
    } catch (error) {
      toast.show({ message: liveErrorText(error, "YouTube yayını açılamadı. Bağlantını kontrol edip yeniden dene."), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const startManual = async (url: string) => {
    if (busy || encoderOn) return;
    setBusy(true);
    try {
      if (await begin(url)) toast.show({ message: "Bağlanılıyor. Yayın birkaç saniye içinde başlar.", tone: "success" });
    } catch (error) {
      toast.show({ message: liveErrorText(error, "Yayın başlatılamadı. Adresi ve anahtarı kontrol et."), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const stopEncoder = useCallback(async () => {
    try {
      await stopReplay().catch(() => undefined);
      await setOverlay(null).catch(() => undefined);
      await stopStream().catch(() => undefined);
    } finally {
      setEncoder({ state: "stopped" });
      setOnAirSince(null);
      setStats(null);
      setReplaying(null);
    }
  }, []);

  const endYoutube = () =>
    Alert.alert("Yayını bitir", "Telefonun görüntüsü kesilir ve YouTube yayını kapatılır. Kayıt kanalında kalır.", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Bitir",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await stopEncoder();
            if (ytStream?.broadcast_id) setYt(await endMatchLiveStream(matchId));
            toast.show({ message: "Yayın bitti.", tone: "success" });
          } catch (error) {
            toast.show({ message: liveErrorText(error, "Görüntü kesildi ama YouTube yayını kapatılamadı. Yeniden dene."), tone: "danger" });
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  // Ekrandan çıkarken: yayındaysa sor; çıkışta kodlayıcıyı kapat.
  usePreventRemove(encoderOn, ({ data }) => {
    Alert.alert("Yayın sürüyor", "Çıkarsan telefonun görüntüsü kesilir. YouTube yayını açık kalır; geri gelip devam edebilirsin.", [
      { text: "Kal", style: "cancel" },
      {
        text: "Görüntüyü kes ve çık",
        style: "destructive",
        onPress: () => {
          void stopEncoder().finally(() => navigation.dispatch(data.action));
        },
      },
    ]);
  });
  useEffect(
    () => () => {
      void stopReplay().catch(() => undefined);
      void stopStream().catch(() => undefined);
    },
    []
  );

  /* ───────── takımlar ve görünüm ───────── */
  const homeName = match?.first_team_name || "Ev sahibi";
  const awayName = match?.second_team_name || "Deplasman";
  const homeLogo = match ? teams.logoFor(match.home_team_id, match.first_team_name) : null;
  const awayLogo = match ? teams.logoFor(match.away_team_id, match.second_team_name) : null;
  const homeKey = String(live.homeTeamId ?? `h-${matchId}`);
  const awayKey = String(live.awayTeamId ?? `a-${matchId}`);
  const homeCode = bugCode(homeName, settings.teamCodes[homeKey]);
  const awayCode = bugCode(awayName, settings.teamCodes[awayKey]);
  const finished = live.phase === "finished";
  const nameOfSide = (side: Side) => (side === "home" ? homeName : awayName);
  const logoOfSide = (side: Side) => (side === "home" ? homeLogo : awayLogo);

  // Maçın yayın görünümü (logo + renk teması). Hata/yetki yoksa varsayılan.
  const brandingQuery = useQuery({
    queryKey: ["live", "overlay-branding", matchId],
    queryFn: () => fetchOverlayBranding(matchId),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const branding = brandingQuery.data ?? null;
  const palette = useMemo(() => bugPalette(branding?.scoreboard), [branding?.scoreboard]);

  // Sponsorlar ve web / masaüstü rejide yazılmış altyazı satırları.
  const deskQuery = useQuery({ queryKey: ["live", "broadcast-desk", matchId], queryFn: () => getBroadcastDesk(matchId), staleTime: 5 * 60_000, retry: false });
  const sponsors = deskQuery.data?.sponsors ?? [];
  const headlines = deskQuery.data?.headlines ?? [];

  /* ───────── tekrar (replay) ───────── */
  const goalClips = useGoalClips(matchId);
  const [replaying, setReplaying] = useState<LocalClip | null>(null);
  const [replayLabel, setReplayLabel] = useState("TEKRAR");
  const [instantBusy, setInstantBusy] = useState(false);
  const replayRate = settings.replayRate as ReplayRate;
  // Skorbord sağ üstteyken modülün sağ üste çizdiği rozet onun altında kalır;
  // o durumda rozet grafik katmanında sol üste gömülür.
  const bugTopRight = overlayOn && settings.bugVariant !== "bottom" && settings.bugCorner === "right";
  const startReplay = async (clip: LocalClip | null) => {
    if (!clip?.uri) {
      toast.show({ message: "Tekrar için henüz kayıtlı klip yok.", tone: "warn" });
      return;
    }
    const slow = REPLAY_RATE_SUPPORTED && replayRate < 1;
    const label = slow ? "AĞIR ÇEKİM" : "TEKRAR";
    try {
      setReplayLabel(label);
      setReplaying(clip);
      await playReplay(clip.uri, { label: bugTopRight ? null : label, rate: REPLAY_RATE_SUPPORTED ? replayRate : 1 });
    } catch (error) {
      setReplaying(null);
      toast.show({ message: liveErrorText(error, "Tekrar oynatılamadı."), tone: "danger" });
    }
  };
  const endReplay = () => {
    void stopReplay().catch(() => undefined);
    setReplaying(null);
  };
  const instantReplay = async () => {
    if (instantBusy || replaying) return;
    if (!nativeReady) {
      toast.show({ message: "Tekrar bu uygulama sürümünde yok.", tone: "warn" });
      return;
    }
    if (!encoderOn) {
      toast.show({ message: "Tekrar yayından kesilir; önce yayını başlat.", tone: "warn" });
      return;
    }
    setInstantBusy(true);
    try {
      const clip = await goalClips.captureInstant({ seconds: settings.replaySeconds, minute: live.minute });
      await startReplay(clip);
    } catch (error) {
      toast.show({ message: error instanceof Error && error.message ? error.message : "Tekrar kaydedilemedi.", tone: "danger" });
    } finally {
      setInstantBusy(false);
    }
  };

  /* ───────── altyazı ───────── */
  const [caption, setCaption] = useState<{ item: Caption; until: number | null } | null>(null);
  const showCaption = useCallback(
    (item: Caption) => {
      setCaption({ item, until: settings.captionSeconds > 0 ? Date.now() + settings.captionSeconds * 1000 : null });
    },
    [settings.captionSeconds]
  );
  const hideCaption = useCallback(() => setCaption(null), []);
  useEffect(() => {
    if (!caption?.until) return;
    const id = setTimeout(() => setCaption((c) => (c && c.item.id === caption.item.id ? null : c)), Math.max(0, caption.until - Date.now()));
    return () => clearTimeout(id);
  }, [caption]);
  const captionRemaining = caption?.until ? Math.max(0, Math.ceil((caption.until - Date.now()) / 1000)) : null;

  /* ───────── sponsor yuvası ───────── */
  const [sponsorPick, setSponsorPick] = useState<number | null>(null);
  const [sponsorTurn, setSponsorTurn] = useState(0);
  useEffect(() => {
    if (settings.sponsorMode !== "rotate" || sponsors.length < 2) return;
    const id = setInterval(() => setSponsorTurn((n) => n + 1), Math.max(5, settings.sponsorSeconds) * 1000);
    return () => clearInterval(id);
  }, [settings.sponsorMode, settings.sponsorSeconds, sponsors.length]);
  const activeSponsor =
    settings.sponsorMode === "off" || !sponsors.length
      ? null
      : settings.sponsorMode === "rotate"
        ? sponsors[sponsorTurn % sponsors.length]
        : sponsors.find((s) => s.id === sponsorPick) ?? sponsors[0];
  const sponsorVisible = Boolean(activeSponsor) && !replaying;

  /* ───────── GOL bandı ───────── */
  const goalSource = live.bannerSource && isGoalCode(live.bannerSource.event.olay_kodu) ? live.bannerSource : null;
  const goalAge = goalSource ? Date.now() - goalSource.since : Infinity;
  const goalPhase: GoalFlashPhase | null = !settings.goalFlash || replaying || !goalSource || goalAge >= GOAL_FLASH_MS ? null : goalAge < GOAL_BURST_MS ? "burst" : "detail";
  const goalData: GoalFlashData | null = (() => {
    if (!goalSource) return null;
    const ev = goalSource.event;
    const code = String(ev.olay_kodu).toUpperCase();
    const own = code === "GOAL_OWN";
    const eventSide: Side = Number(ev.takim_id) === Number(live.homeTeamId) ? "home" : "away";
    // Kendi kalesine gol rakibin hanesine yazılır.
    const scoringSide: Side = own ? (eventSide === "home" ? "away" : "home") : eventSide;
    return {
      teamName: nameOfSide(scoringSide),
      teamLogo: logoOfSide(scoringSide),
      scorer: live.nameOf(ev.oyuncu_id),
      own,
      penalty: code === "GOAL_PENALTY",
      homeCode,
      awayCode,
      homeScore: live.score.home,
      awayScore: live.score.away,
      minute: Number(ev.dakika) || 0,
    };
  })();
  // Önizlemede kısa bir parlama (yayına gitmez; hareket azaltma açıksa yok).
  const flash = useRef(new Animated.Value(0)).current;
  const goalId = goalSource ? Number(goalSource.event.id) : 0;
  useEffect(() => {
    if (!goalId || reduceMotion || !settings.goalFlash) return;
    flash.setValue(0.55);
    const anim = Animated.timing(flash, { toValue: 0, duration: duration.flash, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [flash, goalId, reduceMotion, settings.goalFlash]);

  /* ───────── grafik katmanı: öğe kutuları ve yayına gömme ───────── */
  const [rects, setRects] = useState<Partial<Record<SlotKey, BurnBox>>>({});
  const measure = (key: SlotKey) => (e: LayoutChangeEvent) => {
    const { x, y, width: w, height: h } = e.nativeEvent.layout;
    setRects((prev) => {
      const old = prev[key];
      if (old && Math.abs(old.x - x) < 0.5 && Math.abs(old.y - y) < 0.5 && Math.abs(old.w - w) < 0.5 && Math.abs(old.h - h) < 0.5) return prev;
      return { ...prev, [key]: { x, y, w, h } };
    });
  };
  const [assetTick, setAssetTick] = useState(0);
  const onAssetLoad = useCallback(() => setAssetTick((n) => n + 1), []);
  const replayBadge = Boolean(replaying) && bugTopRight;
  const visible: Record<SlotKey, boolean> = {
    bug: overlayOn,
    caption: Boolean(caption),
    goal: Boolean(goalPhase && goalData),
    sponsor: sponsorVisible,
    replay: replayBadge,
  };
  const box = unionBox(
    (Object.keys(visible) as SlotKey[]).map((k) => (visible[k] ? rects[k] : null)),
    stageW,
    stageH
  );

  const bannerEvent = replaying && replaying.kind === "goal"
    ? {
        kind: "goal" as const,
        label: replaying.code === "GOAL_OWN" ? "KENDİ KALESİNE" : "GOL",
        player: replaying.scorer ? replaying.scorer.toLocaleUpperCase("tr-TR") : null,
      }
    : goalPhase
      ? null // GOL bandı ekrandayken skorbord altındaki küçük bant tekrar etmesin
      : live.bannerEvent;
  const clockVisible = settings.showClock && !finished;

  const signature = [
    overlayOn ? 1 : 0,
    live.score.home,
    live.score.away,
    overlayOn && clockVisible ? Math.floor(live.clockMs / 1000) : "-",
    live.period,
    finished ? 1 : 0,
    bannerEvent?.label ?? "",
    bannerEvent?.player ?? "",
    settings.bugVariant,
    settings.bugCorner,
    settings.showClock ? 1 : 0,
    homeCode,
    awayCode,
    homeName,
    awayName,
    settings.teamColors[homeKey] ?? "",
    settings.teamColors[awayKey] ?? "",
    homeLogo ?? "",
    awayLogo ?? "",
    branding?.logoUrl ?? "",
    branding ? JSON.stringify(branding.scoreboard) : "",
    caption?.item.id ?? "",
    goalPhase ?? "",
    goalPhase ? goalId : "",
    sponsorVisible ? activeSponsor?.id : "",
    replayBadge ? replayLabel : "",
    assetTick,
  ].join("|");

  const burnRef = useRef<View>(null);
  const burn = useOverlayBurn({
    active: nativeReady && encoderOn,
    targetRef: burnRef,
    box,
    stageW,
    stageH,
    frameW: encoderCfg.width,
    frameH: encoderCfg.height,
    signature,
  });
  burnResetRef.current = burn.reset;

  /* ───────── olay girişi ───────── */
  const [tab, setTab] = useState<Tab>("reji");
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [saving, setSaving] = useState(false);

  const requireLive = () => {
    if (live.status === "canli") return true;
    Alert.alert("Maç canlı değil", "Olay girmek için önce Reji sekmesinden maçı başlat.");
    return false;
  };

  const ask = (side: Side, code: string, title: string) => {
    if (!requireLive()) return;
    // GOL: dokunuş anında yayının son 10 saniyesi klip olarak yazılır.
    const clipKey = isGoalCode(code) && nativeReady && encoderOn ? goalClips.capture({ side, code, minute: live.minute }) : null;
    setPicker({ kind: "event", side, code, title, clipKey, clientId: clientEventId() });
  };
  const askSubstitution = (side: Side) => {
    if (!requireLive()) return;
    setPicker({ kind: "subOut", side, clientId: clientEventId() });
  };

  const save = async (job: () => Promise<void>) => {
    setSaving(true);
    try {
      await job();
      setPicker(null);
    } catch (error) {
      toast.show({ message: errorText(error, "Olay kaydedilemedi. Bağlantını kontrol edip yeniden dene."), tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const onPick = (playerId: string | null) => {
    const p = picker;
    if (!p || saving) return;
    if (p.kind === "caption") {
      const player = (p.side === "home" ? live.squads.home : live.squads.away).find((x) => x.id === playerId);
      const item = player ? playerCaption(player.name, nameOfSide(p.side), player.number, logoOfSide(p.side)) : null;
      if (item) showCaption(item);
      setPicker(null);
      return;
    }
    if (p.kind === "subOut") {
      setPicker({ kind: "subIn", side: p.side, outId: playerId, clientId: p.clientId });
      return;
    }
    if (p.kind === "subIn") {
      if (!playerId && !p.outId) {
        toast.show({ message: "Değişiklik için en az bir oyuncu seç.", tone: "warn" });
        return;
      }
      void save(async () => {
        await live.addEvent({ side: p.side, code: "SUBSTITUTION", outPlayerId: p.outId, inPlayerId: playerId, clientId: p.clientId });
        toast.show({ message: `Değişiklik kaydedildi (${live.minute}').`, tone: "success" });
      });
      return;
    }
    void save(async () => {
      const created = await live.addEvent({ side: p.side, code: p.code, playerId, clientId: p.clientId });
      if (p.clipKey) goalClips.attach(p.clipKey, Number(created?.id) || null, live.nameOf(playerId), p.side, p.code);
      toast.show({ message: `${eventLabel(p.code)} kaydedildi (${live.minute}').`, tone: "success" });
    });
  };

  const cancelPicker = useCallback(() => {
    setPicker((p) => {
      // Gol kaydedilmedi: klip (varsa) yalnız bu telefonda tekrar için kalır.
      if (p?.kind === "event" && p.clipKey) goalClips.attach(p.clipKey, null, null);
      return null;
    });
  }, [goalClips]);

  // Android geri tuşu: önce açık seçiciyi kapat.
  const pickerOpen = picker != null;
  useEffect(() => {
    if (!pickerOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      cancelPicker();
      return true;
    });
    return () => sub.remove();
  }, [pickerOpen, cancelPicker]);

  const runControl = async (action: ControlAction) => {
    setSaving(true);
    try {
      toast.show({ message: await live.control(action), tone: "success" });
    } catch (error) {
      toast.show({ message: errorText(error, "İşlem yapılamadı. Bağlantını kontrol edip yeniden dene."), tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const askFinish = () =>
    Alert.alert("Maçı bitir", `Maç ${live.score.home} – ${live.score.away} bitsin mi? Skor tescil edilir.`, [
      { text: "Vazgeç", style: "cancel" },
      { text: "Bitir", style: "destructive", onPress: () => void runControl("finish") },
    ]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/yonetim/studyo"));

  /* ───────── altyazı şablonları ───────── */
  const templates: CaptionTemplate[] = (() => {
    const list: CaptionTemplate[] = [];
    const scoreLine = `${homeName} ${live.score.home} – ${live.score.away} ${awayName}`;
    list.push({
      key: "info",
      label: "Maç bilgisi",
      preview: [match?.league_name, match?.match_field].filter(Boolean).join(" · ") || `${homeName} – ${awayName}`,
      icon: "information-circle",
      build: () => matchInfoCaption(homeName, awayName, [match?.league_name, match?.match_season, match?.match_field]),
    });
    list.push({
      key: "score",
      label: live.phase === "halftime" ? "Devre arası skoru" : finished ? "Maç sonucu" : "Skor",
      preview: scoreLine,
      icon: "podium",
      build: () =>
        scoreCaption(live.phase === "halftime" ? "DEVRE ARASI" : finished ? "MAÇ SONU" : "SKOR", homeName, awayName, live.score.home, live.score.away, finished ? null : `${PHASE_LABEL[live.phase]} · ${live.minute}'`),
    });
    const newestOf = (test: (code: string) => boolean) =>
      live.timeline.reduce<(typeof live.timeline)[number] | null>((best, e) => (test(String(e.olay_kodu).toUpperCase()) && (!best || Number(e.id) > Number(best.id)) ? e : best), null);
    const sideOf = (teamId: unknown): Side => (Number(teamId) === Number(live.homeTeamId) ? "home" : "away");
    const goal = newestOf((c) => c.startsWith("GOAL_"));
    if (goal) {
      const side = sideOf(goal.takim_id);
      const scorer = live.nameOf(goal.oyuncu_id);
      list.push({
        key: "goal",
        label: "Son gol",
        preview: `${scorer ?? nameOfSide(side)} ${goal.dakika ?? 0}'`,
        icon: "football",
        build: () =>
          goalCaption(scorer, nameOfSide(side), Number(goal.dakika) || 0, `${homeCode} ${live.score.home} – ${live.score.away} ${awayCode}`, String(goal.olay_kodu).toUpperCase() === "GOAL_OWN", logoOfSide(side)),
      });
    }
    const card = newestOf((c) => c === "YELLOW_CARD" || c === "RED_CARD");
    if (card) {
      const side = sideOf(card.takim_id);
      const player = live.nameOf(card.oyuncu_id);
      const red = String(card.olay_kodu).toUpperCase() === "RED_CARD";
      list.push({
        key: "card",
        label: red ? "Son kırmızı kart" : "Son sarı kart",
        preview: `${player ?? nameOfSide(side)} ${card.dakika ?? 0}'`,
        icon: "square",
        build: () => cardCaption(red ? "red" : "yellow", player, nameOfSide(side), Number(card.dakika) || 0, logoOfSide(side)),
      });
    }
    const sub = newestOf((c) => c === "SUBSTITUTION");
    if (sub) {
      const side = sideOf(sub.takim_id);
      const inn = live.nameOf(sub.oyuncu_giren_id);
      const out = live.nameOf(sub.oyuncu_cikan_id);
      list.push({
        key: "sub",
        label: "Son değişiklik",
        preview: [inn ? `Giren ${inn}` : null, out ? `çıkan ${out}` : null].filter(Boolean).join(", ") || nameOfSide(side),
        icon: "swap-horizontal",
        build: () => substitutionCaption(inn, out, nameOfSide(side), Number(sub.dakika) || 0, logoOfSide(side)),
      });
    }
    for (const s of sponsors.slice(0, 4)) {
      list.push({
        key: `sponsor-${s.id}`,
        label: "Sponsor",
        preview: s.name,
        icon: "ribbon",
        build: () => sponsorCaption(s.name, s.tagline, mediaUrl(sponsorLogo(s))),
      });
    }
    return list;
  })();

  /* ───────── skorbord çizimi (çeşitler aynı veriyi alır) ───────── */
  const alignRight = settings.bugVariant !== "bottom" && settings.bugCorner === "right";
  const bugProps: ScoreBugProps = {
    homeName,
    awayName,
    homeLogo,
    awayLogo,
    homeScore: live.score.home,
    awayScore: live.score.away,
    clockMs: live.clockMs,
    period: live.period,
    finished,
    event: bannerEvent,
    scale: bugScale,
    palette,
    logoUrl: branding?.logoUrl ?? null,
    logoScale: branding?.scoreboard.logoScale ?? 100,
    homeCode: settings.teamCodes[homeKey] ?? null,
    awayCode: settings.teamCodes[awayKey] ?? null,
    homeColor: settings.teamColors[homeKey] ?? null,
    awayColor: settings.teamColors[awayKey] ?? null,
    showClock: settings.showClock,
    align: alignRight ? "right" : "left",
    onAssetLoad,
  };

  /* ───────── çizim ───────── */
  const elapsed = onAirSince ? Date.now() - onAirSince : 0;
  const healthProps = { state: encoder.state, message: encoder.message, stats, elapsedMs: elapsed, encoder: encoderCfg, device, muted, replaying: Boolean(replaying) };

  if (live.loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <StatusBar hidden />
        <Text style={styles.lockedText} allowFontScaling={false}>
          Maç yükleniyor…
        </Text>
      </View>
    );
  }
  if (!match) {
    return <Locked text={errorText(live.error, "Maç bulunamadı.")} />;
  }

  const padX = stageW * (BUG.left / BUG.stageW);
  const padTop = stageH * (BUG.top / BUG.stageH);
  const boardOn = overlayOn && settings.bugVariant === "bottom";
  const captionBottom = stageH * ((boardOn ? GFX.caption.liftOverBoard : GFX.caption.bottom) / BUG.stageH);
  const goalBottom = stageH * ((boardOn ? GFX.goal.bottomOverBoard : GFX.goal.bottom) / BUG.stageH) + (caption ? stageH * 0.12 : 0);
  // Çekilen kap `box` konumundadır; içindeki sahne boyu katman ters yönde kaydırılır,
  // böylece öğeler ekranda yerinden oynamaz.
  const frame = box ?? { x: 0, y: 0, w: stageW, h: stageH };

  const pickerPlayers = (() => {
    if (!picker) return [];
    const squad = picker.side === "home" ? live.squads.home : live.squads.away;
    if (picker.kind === "subOut") {
      const on = live.onPitch[picker.side];
      const list = squad.filter((p) => on.has(p.id));
      return list.length ? list : squad;
    }
    if (picker.kind === "subIn") {
      const on = live.onPitch[picker.side];
      const list = squad.filter((p) => !on.has(p.id) && p.id !== picker.outId);
      return list.length ? list : squad.filter((p) => p.id !== picker.outId);
    }
    return squad;
  })();

  return (
    <View style={[styles.root, { paddingLeft: insets.left, paddingRight: insets.right, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar hidden />
      <View style={styles.row}>
        {/* ═════════ SAHNE ═════════ */}
        <View style={styles.stageWrap}>
          <View style={[styles.stage, { width: stageW, height: stageH }]}>
            {nativeReady && permission ? (
              <LiveCameraView
                style={StyleSheet.absoluteFill}
                facing={facing}
                onStateChange={onState}
                onStats={onStats}
                onReplayStateChange={(e) => {
                  if (!e.nativeEvent.playing) setReplaying(null);
                }}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.center, styles.noCam]}>
                <Ionicons name="videocam-off" size={26} color={RIG.textMute} />
                <Text style={styles.noCamText} allowFontScaling={false}>
                  {!nativeReady
                    ? "Kamera yayını bu sürümde yok. Mağazadaki güncel sürümü kullan."
                    : permission === false
                      ? "Kamera ve mikrofon izni verilmedi."
                      : "Kamera açılıyor…"}
                </Text>
                {nativeReady && permission === false ? (
                  <Btn label="Ayarları aç" icon="settings" tone="soft" onPress={() => void Linking.openSettings().catch(() => undefined)} />
                ) : null}
              </View>
            )}

            {/* Yayına gömülen grafik katmanı */}
            <View
              ref={burnRef}
              collapsable={false}
              pointerEvents="none"
              style={{ position: "absolute", left: frame.x, top: frame.y, width: frame.w, height: frame.h, overflow: "hidden" }}
            >
              <View style={{ position: "absolute", left: -frame.x, top: -frame.y, width: stageW, height: stageH }}>
                {sponsorVisible && activeSponsor ? (
                  <View style={[styles.slot, { alignItems: alignRight || settings.bugVariant === "bottom" ? "flex-start" : "flex-end", paddingTop: padTop, paddingHorizontal: padX }]}>
                    <View onLayout={measure("sponsor")} key={`sp-${activeSponsor.id}`}>
                      <SponsorBug name={activeSponsor.name} logoUrl={mediaUrl(sponsorLogo(activeSponsor))} scale={bugScale} palette={palette} onAssetLoad={onAssetLoad} />
                    </View>
                  </View>
                ) : null}
                {replayBadge ? (
                  <View style={[styles.slot, { alignItems: "flex-start", paddingTop: padTop, paddingHorizontal: padX }]}>
                    <View onLayout={measure("replay")}>
                      <ReplayBadge label={replayLabel} scale={bugScale} palette={palette} />
                    </View>
                  </View>
                ) : null}
                {overlayOn ? (
                  settings.bugVariant === "bottom" ? (
                    <View style={[styles.slot, styles.slotBottom, { alignItems: "center", paddingBottom: stageH * (BUG.low.bottom / BUG.stageH) }]}>
                      <View onLayout={measure("bug")} key="bottom">
                        <BottomBoard {...bugProps} />
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.slot, { alignItems: alignRight ? "flex-end" : "flex-start", paddingTop: padTop, paddingHorizontal: padX }]}>
                      <View onLayout={measure("bug")} key={`${settings.bugVariant}-${settings.bugCorner}`}>
                        {settings.bugVariant === "compact" ? <CompactBug {...bugProps} /> : <ScoreBug {...bugProps} />}
                      </View>
                    </View>
                  )
                ) : null}
                {goalPhase && goalData ? (
                  <View style={[styles.slot, styles.slotBottom, { alignItems: "center", paddingBottom: goalBottom }]}>
                    <View onLayout={measure("goal")} key={goalPhase}>
                      <GoalFlash phase={goalPhase} data={goalData} scale={bugScale} palette={palette} onAssetLoad={onAssetLoad} />
                    </View>
                  </View>
                ) : null}
                {caption ? (
                  <View style={[styles.slot, styles.slotBottom, { alignItems: "flex-start", paddingBottom: captionBottom, paddingHorizontal: padX }]}>
                    <View onLayout={measure("caption")} key={caption.item.id}>
                      <LowerThird caption={caption.item} scale={bugScale} palette={palette} onAssetLoad={onAssetLoad} />
                    </View>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Gol parlaması: yalnız önizleme */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />

            {/* Önizleme göstergeleri (yayına gitmez) */}
            <HealthHud {...healthProps} />

            {/* Sahne üstü hızlı düğmeler (yayına gitmez) */}
            <View style={styles.stageBar}>
              <Touchable
                style={[styles.stageBtn, muted && styles.stageBtnOff]}
                onPress={toggleMic}
                disabled={!nativeReady}
                accessibilityLabel={muted ? "Mikrofonu aç" : "Mikrofonu kapat"}
                haptic="medium"
              >
                <Ionicons name={muted ? "mic-off" : "mic"} size={20} color={RIG.text} />
              </Touchable>
              {replaying ? (
                <Touchable style={[styles.stageBtn, styles.stageBtnOff]} onPress={endReplay} accessibilityLabel="Tekrarı durdur, canlıya dön" haptic="medium">
                  <Ionicons name="stop" size={20} color={RIG.text} />
                </Touchable>
              ) : (
                <Touchable
                  style={[styles.stageBtn, styles.stageBtnReplay, (!encoderOn || instantBusy) && styles.stageBtnDisabled]}
                  onPress={() => void instantReplay()}
                  disabled={!nativeReady || instantBusy}
                  accessibilityLabel={`Son ${settings.replaySeconds} saniyeyi tekrar oynat`}
                  haptic="medium"
                >
                  <Ionicons name="play-back" size={20} color={RIG.text} />
                </Touchable>
              )}
              {caption ? (
                <Touchable style={styles.stageBtn} onPress={hideCaption} accessibilityLabel="Altyazıyı kaldır" haptic="light">
                  <Ionicons name="close" size={20} color={RIG.text} />
                </Touchable>
              ) : null}
            </View>
          </View>
        </View>

        {/* ═════════ REJİ RAYI ═════════ */}
        <View style={[styles.rail, { width: railW }]}>
          {collapsed ? (
            <View style={styles.collapsed}>
              <RailIcon icon="chevron-back" label="Rejiyi aç" onPress={() => setCollapsed(false)} />
              <RailIcon icon="add-circle" label="Ev sahibi gol" color={RIG.home} onPress={() => ask("home", "GOAL_RIGHT_FOOT", `${homeName} — golü atan`)} />
              <RailIcon icon="add-circle" label="Deplasman gol" color={RIG.away} onPress={() => ask("away", "GOAL_RIGHT_FOOT", `${awayName} — golü atan`)} />
              <RailIcon icon="camera-reverse" label="Kamerayı çevir" onPress={flipCamera} />
              <RailIcon icon="close" label="Kapat" onPress={close} />
            </View>
          ) : (
            <>
              <View style={styles.railHead}>
                <RailIcon icon="chevron-forward" label="Rejiyi daralt" onPress={() => setCollapsed(true)} small />
                <View style={styles.flex}>
                  <Text style={styles.railTitle} numberOfLines={1} allowFontScaling={false}>
                    {homeCode} {live.score.home} – {live.score.away} {awayCode}
                  </Text>
                  <Text style={styles.railSub} numberOfLines={1} allowFontScaling={false}>
                    {PHASE_LABEL[live.phase]} · {clockText(live.clockMs)}
                  </Text>
                </View>
                <RailIcon icon="close" label="Kapat" onPress={close} small />
              </View>
              <View style={styles.tabs} accessibilityRole="tablist">
                {TABS.map((t) => (
                  <Touchable
                    key={t.key}
                    style={[styles.tab, tab === t.key && styles.tabOn]}
                    onPress={() => setTab(t.key)}
                    accessibilityRole="tab"
                    accessibilityLabel={t.label}
                    accessibilityState={{ selected: tab === t.key }}
                  >
                    <Ionicons name={t.icon} size={16} color={tab === t.key ? RIG.text : RIG.textMute} />
                    <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]} numberOfLines={1} allowFontScaling={false}>
                      {t.label}
                    </Text>
                  </Touchable>
                ))}
              </View>
              <ScrollView contentContainerStyle={styles.railBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {tab === "reji" ? (
                  <RejiPanel
                    live={live}
                    homeName={homeName}
                    awayName={awayName}
                    saving={saving}
                    onAsk={ask}
                    onSubstitution={askSubstitution}
                    onControl={(a) => void runControl(a)}
                    onFinish={askFinish}
                    onToast={(m, ok) => toast.show({ message: m, tone: ok ? "success" : "danger" })}
                  />
                ) : tab === "tekrar" ? (
                  <ReplayPanel
                    rate={replayRate}
                    onRate={(rate) => change({ replayRate: rate })}
                    clips={goalClips.clips}
                    replayingKey={replaying?.key ?? null}
                    nativeReady={nativeReady}
                    encoderOn={encoderOn}
                    homeName={homeName}
                    awayName={awayName}
                    onPlay={(clip) => void startReplay(clip)}
                    onStop={endReplay}
                    onRetry={goalClips.retry}
                    onRemove={goalClips.remove}
                    instantSeconds={settings.replaySeconds}
                    onInstantSeconds={(replaySeconds) => change({ replaySeconds })}
                    onInstant={() => void instantReplay()}
                    instantBusy={instantBusy}
                  />
                ) : tab === "skorbord" ? (
                  <ScoreboardPanel
                    settings={settings}
                    onChange={change}
                    visible={overlayOn}
                    onVisible={setOverlayOn}
                    homeName={homeName}
                    awayName={awayName}
                    homeKey={homeKey}
                    awayKey={awayKey}
                    branded={Boolean(branding && (branding.logoUrl || branding.scoreboard.theme !== "elitlig"))}
                    sponsors={sponsors}
                    activeSponsor={activeSponsor ?? null}
                    onPickSponsor={setSponsorPick}
                  />
                ) : tab === "altyazi" ? (
                  <CaptionPanel
                    onAir={caption?.item ?? null}
                    remaining={captionRemaining}
                    seconds={settings.captionSeconds}
                    onSeconds={(captionSeconds) => change({ captionSeconds })}
                    onShow={showCaption}
                    onHide={hideCaption}
                    templates={templates}
                    homeName={homeName}
                    awayName={awayName}
                    onPlayerTemplate={(side) => setPicker({ kind: "caption", side })}
                    headlines={headlines}
                    encoderOn={encoderOn}
                  />
                ) : tab === "yayin" ? (
                  <BroadcastPanel
                    config={config.data}
                    configLoading={config.isLoading}
                    stream={ytStream}
                    encoderOn={encoderOn}
                    busy={busy}
                    nativeReady={nativeReady}
                    privacy={privacy}
                    onPrivacy={setPrivacy}
                    onStartYoutube={() => void startYoutube()}
                    onStartManual={(url) => void startManual(url)}
                    onStop={() => void stopEncoder()}
                    onEndYoutube={endYoutube}
                    onToast={(m, tone) => toast.show({ message: m, tone: tone ?? "success" })}
                    health={nativeReady ? <HealthCard {...healthProps} /> : null}
                  />
                ) : (
                  <SettingsPanel
                    nativeReady={nativeReady}
                    encoderOn={encoderOn}
                    facing={facing}
                    onFlip={flipCamera}
                    muted={muted}
                    onMute={toggleMic}
                    caps={caps}
                    controlsSupported={controlsSupported}
                    zoom={zoom}
                    onZoom={applyZoom}
                    torchOn={torchOn}
                    onTorch={applyTorch}
                    settings={settings}
                    onChange={change}
                    encoder={encoderCfg}
                  />
                )}
              </ScrollView>
            </>
          )}
        </View>
      </View>

      {picker ? (
        <PlayerPicker
          key={picker.kind}
          title={
            picker.kind === "event"
              ? picker.title
              : picker.kind === "subOut"
                ? `${nameOfSide(picker.side)} — çıkan oyuncu`
                : picker.kind === "subIn"
                  ? `${nameOfSide(picker.side)} — giren oyuncu`
                  : `${nameOfSide(picker.side)} — altyazıya çıkacak oyuncu`
          }
          subtitle={
            picker.kind === "event"
              ? `${eventLabel(picker.code)} · ${live.minute}'`
              : picker.kind === "caption"
                ? "Oyuncu adı ve takımı alt bantta gösterilir"
                : `Değişiklik · ${live.minute}'${picker.kind === "subIn" && picker.outId ? ` · çıkan: ${live.nameOf(picker.outId) ?? ""}` : ""}`
          }
          players={pickerPlayers}
          accent={picker.side === "home" ? RIG.home : RIG.away}
          busy={saving}
          onPick={onPick}
          onClose={cancelPicker}
          skipLabel={picker.kind === "caption" ? null : picker.kind === "event" ? "Oyuncusuz kaydet" : picker.kind === "subOut" ? "Çıkanı atla" : "Gireni atla"}
          starterLabel={picker.kind === "subOut" ? "SAHADA" : picker.kind === "subIn" ? "YEDEKLER" : "İLK 11"}
          otherLabel={picker.kind === "subOut" || picker.kind === "subIn" ? "DİĞER" : "YEDEKLER"}
          emptyText={
            picker.kind === "caption"
              ? "Bu takımın maç kadrosu girilmemiş. Oyuncu adını Altyazı sekmesinden elle yazabilirsin."
              : "Bu takımın maç kadrosu girilmemiş. Olayı oyuncusuz kaydedebilirsin."
          }
        />
      ) : null}
    </View>
  );
}

function RailIcon({
  icon,
  label,
  onPress,
  color,
  small,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  small?: boolean;
}) {
  return (
    <Touchable style={[styles.railIcon, small && styles.railIconSmall]} onPress={onPress} accessibilityLabel={label} haptic="selection" hitSlop={small ? 6 : 0}>
      <Ionicons name={icon} size={small ? 18 : 20} color={color ?? RIG.text} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RIG.bg },
  center: { alignItems: "center", justifyContent: "center", gap: space.md, padding: space.lg },
  row: { flex: 1, flexDirection: "row", gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  lockedText: { ...type.body, color: RIG.textSoft, textAlign: "center", maxWidth: 420 },

  stageWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  stage: { backgroundColor: RIG.stage, overflow: "hidden", borderRadius: radius.sm },
  noCam: { backgroundColor: RIG.panel },
  noCamText: { ...type.bodySm, color: RIG.textSoft, textAlign: "center", maxWidth: 320 },
  slot: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-start" },
  slotBottom: { justifyContent: "flex-end" },
  flash: { backgroundColor: RIG.flash },
  stageBar: { position: "absolute", right: space.sm, top: 0, bottom: 0, justifyContent: "center", gap: space.sm },
  stageBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: RIG.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RIG.line,
  },
  stageBtnOff: { backgroundColor: RIG.live },
  stageBtnReplay: { backgroundColor: RIG.brand },
  stageBtnDisabled: { opacity: 0.5 },

  rail: { backgroundColor: RIG.panel, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: RIG.line },
  collapsed: { flex: 1, alignItems: "center", justifyContent: "space-evenly", paddingVertical: space.sm },
  railHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, paddingTop: space.xs },
  railTitle: { ...type.h4, color: RIG.text },
  railSub: { ...type.caption, color: RIG.textMute },
  railIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: RIG.panelSoft },
  railIconSmall: { width: 38, height: 38 },
  tabs: { flexDirection: "row", margin: space.sm, padding: space.xxs, borderRadius: radius.md, backgroundColor: RIG.panelSoft },
  tab: { flex: 1, height: 44, gap: space.xxs, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  tabOn: { backgroundColor: RIG.panelStrong },
  tabText: { ...type.nano, color: RIG.textMute },
  tabTextOn: { color: RIG.text },
  railBody: { paddingHorizontal: space.sm, paddingBottom: space.xl, gap: space.sm },
});
