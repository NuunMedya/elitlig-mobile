/**
 * MOBİL CANLI YAYIN + REJİ — `/yonetim/canli-yayin/:id` (yetki: matches.live)
 *
 * Telefon yan çevrilir (ekran yatay kilitlidir). Solda 16:9 kamera sahnesi,
 * üstünde web /skoroverlay skorbordunun birebir kopyası; sağda reji rayı:
 *
 *   Maç    skor (+ GOL), saat ve devre düğmesi, saat düzeltme, maçı bitir
 *   Olay   kart / penaltı / kendi kalesine, son olaylar (silinebilir)
 *   Yayın  YouTube yayınını aç → başlat → bitir, izleme bağlantısı, elle RTMP
 *   Tekrar gol klipleri, ağır çekim hızı (yalnız Android)
 *   Kamera ön/arka, mikrofon, skorbord aç/kapa + tipi (köşe / orta-alt), kalite
 *
 * SKORBORD GÖRÜNÜMÜ: maçın web "Yayın Tasarımı"nda seçilen logo ve renk teması
 * (GET /api/maclar/:id/overlay-branding) skorborda uygulanır; uç yanıt vermezse
 * Elitlig varsayılanı kalır.
 *
 * YAYINA GÖMME: ekrandaki skorbord saniyede bir PNG'ye çekilir
 * (react-native-view-shot) ve yerel modüle verilir; modül onu videonun her
 * karesine kendisi basar. Yani ekranda gördüğün skorbord, YouTube'daki
 * görüntüdür. Konum, web sahnesindeki yerle aynı oranlardadır
 * (1920×1080'de sol 56, üst 48 piksel).
 *
 * Yerel modülün olmadığı derlemelerde (Expo Go, web) kamera alanı uyarı
 * gösterir; reji kontrolleri yine çalışır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Redirect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef, releaseCapture } from "react-native-view-shot";

import { BottomBoard } from "@/components/live/BottomBoard";
import { BroadcastPanel, Btn } from "@/components/live/BroadcastPanel";
import { PlayerPicker } from "@/components/live/PlayerPicker";
import { REPLAY_RATE_SUPPORTED, ReplayPanel, type ReplayRate } from "@/components/live/ReplayPanel";
import { useGoalClips, type LocalClip } from "@/components/live/useGoalClips";
import { ScoreBug, type ScoreBugProps } from "@/components/live/ScoreBug";
import { HALF_MS, PHASE_LABEL, useLiveMatch, type ControlAction, type LiveMatch } from "@/components/live/useLiveMatch";
import { Touchable, useToast } from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { eventLabel } from "@/lib/api/admin/matches";
import { bugPalette, fetchOverlayBranding } from "@/lib/live/branding";
import { BUG, BUG_VARIANTS, clockText, teamShortCode, type BugVariant } from "@/lib/live/scorebug";
import { QUALITY_PRESETS, RIG, elapsedText, type QualityKey } from "@/lib/live/rig";
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
import { radius, space, type } from "@/theme";
import {
  LiveCameraView,
  isLiveAvailable,
  requestLivePermissions,
  playReplay,
  setMuted as nativeSetMuted,
  stopReplay,
  setOverlay,
  startStream,
  stopStream,
  type LiveState,
  type LiveStats,
} from "@/modules/elitlig-live";

type Tab = "mac" | "olay" | "tekrar" | "yayin" | "kamera";
type Side = "home" | "away";

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "mac", label: "Maç", icon: "football" },
  { key: "olay", label: "Olay", icon: "flag" },
  { key: "tekrar", label: "Tekrar", icon: "repeat" },
  { key: "yayin", label: "Yayın", icon: "radio" },
  { key: "kamera", label: "Kamera", icon: "videocam" },
];

const ON_AIR: LiveState[] = ["connecting", "live", "reconnecting"];

export default function LiveBroadcastScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const matchId = Number(Array.isArray(params.id) ? params.id[0] : params.id);

  if (!auth.user && !auth.initializing) return <Redirect href="/giris" />;
  if (!auth.user) return <View style={styles.root} />;
  if (!auth.isManagement || !hasAnyPermission(auth.user, ["matches.live"])) {
    return <Locked text="Canlı yayın ve reji için “matches.live” yetkisi gerekir." />;
  }
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
      <Btn label="Geri dön" icon="arrow-back" tone="soft" onPress={() => router.back()} />
    </View>
  );
}

const KEEP_AWAKE_TAG = "elitlig-live";

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
  const teams = useTeamLogos();
  const live = useLiveMatch(matchId, userId);
  const match = live.match;

  const nativeReady = isLiveAvailable();
  const [permission, setPermission] = useState<boolean | null>(nativeReady ? null : false);
  useEffect(() => {
    if (!nativeReady) return;
    void requestLivePermissions().then(setPermission, () => setPermission(false));
  }, [nativeReady]);

  /* ───────── yerleşim ───────── */
  const [collapsed, setCollapsed] = useState(false);
  const usableW = width - insets.left - insets.right;
  const usableH = height - insets.top - insets.bottom;
  const railW = collapsed ? 60 : Math.min(340, Math.max(250, Math.round(usableW * 0.36)));
  const stageW = Math.max(160, Math.min(usableW - railW - space.sm, (usableH * 16) / 9));
  const stageH = (stageW * 9) / 16;
  const bugScale = stageW / BUG.stageW;

  /* ───────── kodlayıcı (telefon → RTMP) ───────── */
  const [encoder, setEncoder] = useState<{ state: LiveState; message?: string }>({ state: "idle" });
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [muted, setMutedState] = useState(false);
  const toggleMic = useCallback(() => {
    setMutedState((prev) => {
      const next = !prev;
      void nativeSetMuted(next).catch(() => undefined);
      return next;
    });
  }, []);
  const [overlayOn, setOverlayOn] = useState(true);
  const [quality, setQuality] = useState<QualityKey>("720p");
  const [onAirSince, setOnAirSince] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const encoderOn = ON_AIR.includes(encoder.state);
  const preset = QUALITY_PRESETS.find((q) => q.key === quality) ?? QUALITY_PRESETS[0];

  const onState = useCallback(
    (e: { nativeEvent: { state: LiveState; message?: string } }) => {
      const next = e.nativeEvent;
      setEncoder(next);
      if (next.state === "live") setOnAirSince((v) => v ?? Date.now());
      if (next.state === "failed") {
        setOnAirSince(null);
        toast.show({ message: next.message ? `Yayın bağlantısı koptu: ${next.message}` : "Yayın bağlantısı kurulamadı.", tone: "danger" });
      }
      if (next.state === "stopped" || next.state === "idle" || next.state === "previewing") setOnAirSince(null);
    },
    [toast]
  );

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

  const begin = useCallback(
    async (url: string) => {
      if (!nativeReady) return;
      const ok = permission ?? (await requestLivePermissions());
      setPermission(ok);
      if (!ok) {
        Alert.alert("İzin gerekli", "Canlı yayın için Ayarlar'dan kamera ve mikrofon izni ver.");
        return;
      }
      await startStream(url, {
        width: preset.width,
        height: preset.height,
        fps: preset.fps,
        videoBitrateKbps: preset.videoBitrateKbps,
        audioBitrateKbps: 128,
      });
      setEncoder({ state: "connecting" });
    },
    [nativeReady, permission, preset]
  );

  const startYoutube = async () => {
    setBusy(true);
    try {
      const open = ytStream && ytStream.active !== false && ingestUrl(ytStream) ? ytStream : await createMatchLiveStream(matchId, { privacy });
      setYt(open);
      const url = ingestUrl(open);
      if (!url) throw new Error("YouTube yayın adresi alınamadı.");
      await begin(url);
      void queryClient.invalidateQueries({ queryKey: ["admin", "matches", "detail", matchId] });
      toast.show({ message: "Görüntü YouTube'a gönderiliyor. Yayın birkaç saniye içinde canlıya geçer.", tone: "success" });
    } catch (error) {
      toast.show({ message: liveErrorText(error, "YouTube yayını açılamadı."), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const startManual = async (url: string) => {
    setBusy(true);
    try {
      await begin(url);
    } catch (error) {
      toast.show({ message: liveErrorText(error, "Yayın başlatılamadı."), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const stopEncoder = useCallback(async () => {
    try {
      await setOverlay(null);
      await stopStream();
    } finally {
      setEncoder({ state: "stopped" });
      setOnAirSince(null);
      setStats(null);
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
            toast.show({ message: liveErrorText(error, "Yayın kapatılamadı."), tone: "danger" });
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  // Ekrandan çıkarken: yayındaysa sor; çıkışta kodlayıcıyı kapat.
  const encoderOnRef = useRef(encoderOn);
  encoderOnRef.current = encoderOn;
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (!encoderOnRef.current) return;
      e.preventDefault();
      Alert.alert("Yayın sürüyor", "Çıkarsan telefonun görüntüsü kesilir. YouTube yayını açık kalır; geri gelip devam edebilirsin.", [
        { text: "Kal", style: "cancel" },
        {
          text: "Görüntüyü kes ve çık",
          style: "destructive",
          onPress: () => {
            void stopEncoder().finally(() => navigation.dispatch(e.data.action));
          },
        },
      ]);
    });
    return unsubscribe;
  }, [navigation, stopEncoder]);
  useEffect(
    () => () => {
      void setOverlay(null).catch(() => undefined);
      void stopStream().catch(() => undefined);
    },
    []
  );

  /* ───────── skorbord ───────── */
  const homeName = match?.first_team_name || "Ev sahibi";
  const awayName = match?.second_team_name || "Deplasman";
  const homeLogo = match ? teams.logoFor(match.home_team_id, match.first_team_name) : null;
  const awayLogo = match ? teams.logoFor(match.away_team_id, match.second_team_name) : null;
  const finished = live.phase === "finished";

  // Maçın yayın görünümü (logo + renk teması). Hata/yetki yoksa varsayılan.
  const brandingQuery = useQuery({
    queryKey: ["live", "overlay-branding", matchId],
    queryFn: () => fetchOverlayBranding(matchId),
    enabled: Number.isFinite(matchId) && matchId > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const branding = brandingQuery.data ?? null;
  const palette = useMemo(() => bugPalette(branding?.scoreboard), [branding?.scoreboard]);
  const [bugVariant, setBugVariant] = useState<BugVariant>("premier");

  const bugRef = useRef<View>(null);
  const [bugBox, setBugBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const onBugLayout = (e: LayoutChangeEvent) => {
    const { x, y, width: w, height: h } = e.nativeEvent.layout;
    setBugBox({ x, y, w, h });
  };

  const overlaySignature = [
    live.score.home,
    live.score.away,
    Math.floor(live.clockMs / 1000),
    live.period,
    finished ? 1 : 0,
    live.bannerEvent?.label ?? "",
    live.bannerEvent?.player ?? "",
    bugBox ? `${Math.round(bugBox.w)}x${Math.round(bugBox.h)}` : "",
    homeLogo ?? "",
    awayLogo ?? "",
    bugVariant,
    branding?.logoUrl ?? "",
    branding ? JSON.stringify(branding.scoreboard) : "",
  ].join("|");

  const lastFile = useRef<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!nativeReady) return;
    if (!encoderOn || !overlayOn || !bugBox || !bugRef.current) {
      if (lastFile.current) {
        void setOverlay(null).catch(() => undefined);
        releaseCapture(lastFile.current);
        lastFile.current = null;
      }
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    const outW = Math.max(1, Math.round((bugBox.w / stageW) * preset.width));
    const outH = Math.max(1, Math.round((bugBox.h / stageH) * preset.height));
    void (async () => {
      try {
        const uri = await captureRef(bugRef, { format: "png", result: "tmpfile", width: outW, height: outH });
        await setOverlay(uri, {
          x: bugBox.x / stageW,
          y: bugBox.y / stageH,
          width: bugBox.w / stageW,
          height: bugBox.h / stageH,
        });
        if (lastFile.current && lastFile.current !== uri) releaseCapture(lastFile.current);
        lastFile.current = uri;
      } catch {
        /* tek kare kaçarsa bir sonraki saniye yeniden çekilir */
      } finally {
        inFlight.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlaySignature, encoderOn, overlayOn, nativeReady, stageW, stageH, preset.width, preset.height]);

  /* ───────── olay girişi ───────── */
  const [tab, setTab] = useState<Tab>("mac");
  const [picker, setPicker] = useState<{ side: Side; code: string; title: string; clipKey: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const goalClips = useGoalClips(matchId);

  const record = async (side: Side, code: string, playerId: string | null) => {
    setSaving(true);
    try {
      const created = await live.addEvent({ side, code, playerId });
      if (picker?.clipKey) goalClips.attach(picker.clipKey, Number(created?.id) || null, live.nameOf(playerId), side, code);
      toast.show({ message: `${eventLabel(code)} kaydedildi (${live.minute}').`, tone: "success" });
      setPicker(null);
    } catch (error) {
      toast.show({ message: errorText(error, "Olay kaydedilemedi."), tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const cancelPicker = () => {
    // Gol kaydedilmedi: klip (varsa) yalnız bu telefonda tekrar için kalır.
    if (picker?.clipKey) goalClips.attach(picker.clipKey, null, null);
    setPicker(null);
  };

  const ask = (side: Side, code: string, title: string) => {
    if (live.status !== "canli") {
      Alert.alert("Maç canlı değil", "Olay girmek için önce Maç sekmesinden maçı başlat.");
      return;
    }
    // GOL: dokunuş anında yayının son 10 saniyesi klip olarak yazılır.
    const isGoal = code.toUpperCase().startsWith("GOAL_");
    const clipKey = isGoal && nativeReady && encoderOn ? goalClips.capture({ side, code, minute: live.minute }) : null;
    setPicker({ side, code, title, clipKey });
  };

  /* ───────── tekrar (replay) ───────── */
  const [replaying, setReplaying] = useState<LocalClip | null>(null);
  // Ağır çekim hızı: bir sonraki oynatmada uygulanır (yalnız Android).
  const [replayRate, setReplayRate] = useState<ReplayRate>(1);
  const startReplay = async (clip: LocalClip | null) => {
    if (!clip?.uri) {
      toast.show({ message: "Tekrar için henüz kayıtlı gol klibi yok.", tone: "warn" });
      return;
    }
    try {
      setReplaying(clip);
      // Yayının sağ üstüne modül "TEKRAR" rozetini çizer; skorbord bandı golü söyler.
      const slow = REPLAY_RATE_SUPPORTED && replayRate < 1;
      await playReplay(clip.uri, { label: slow ? "AĞIR ÇEKİM" : "TEKRAR", rate: REPLAY_RATE_SUPPORTED ? replayRate : 1 });
    } catch (error) {
      setReplaying(null);
      toast.show({ message: liveErrorText(error, "Tekrar oynatılamadı."), tone: "danger" });
    }
  };
  const endReplay = () => {
    void stopReplay().catch(() => undefined);
    setReplaying(null);
  };

  const runControl = async (action: ControlAction) => {
    setSaving(true);
    try {
      toast.show({ message: await live.control(action), tone: "success" });
    } catch (error) {
      toast.show({ message: errorText(error, "İşlem yapılamadı."), tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const askFinish = () =>
    Alert.alert("Maçı bitir", `Maç ${live.score.home} – ${live.score.away} bitsin mi? Skor tescil edilir.`, [
      { text: "Vazgeç", style: "cancel" },
      { text: "Bitir", style: "destructive", onPress: () => void runControl("finish") },
    ]);

  const close = () => router.back();

  /* ───────── skorbord çizimi (köşe ya da orta-alt; ikisi aynı veriyi alır) ───────── */
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
    event: replaying
      ? {
          kind: "goal",
          label: replaying.code === "GOAL_OWN" ? "KENDİ KALESİNE" : "GOL",
          player: replaying.scorer ? replaying.scorer.toLocaleUpperCase("tr-TR") : null,
        }
      : live.bannerEvent,
    scale: bugScale,
    palette,
    logoUrl: branding?.logoUrl ?? null,
    logoScale: branding?.scoreboard.logoScale ?? 100,
  };

  /* ───────── çizim ───────── */
  const elapsed = onAirSince ? Date.now() - onAirSince : 0;

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
                onStats={(e) => setStats(e.nativeEvent)}
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
                      ? "Kamera / mikrofon izni verilmedi. Ayarlar'dan izin ver."
                      : "Kamera açılıyor…"}
                </Text>
              </View>
            )}

            {overlayOn ? (
              <View
                key={bugVariant}
                style={
                  bugVariant === "bottom"
                    ? {
                        position: "absolute",
                        left: (stageW - BUG.low.width * bugScale) / 2,
                        bottom: stageH * (BUG.low.bottom / BUG.stageH),
                      }
                    : { position: "absolute", left: stageW * (BUG.left / BUG.stageW), top: stageH * (BUG.top / BUG.stageH) }
                }
                onLayout={onBugLayout}
                pointerEvents="none"
              >
                {/* Hangi skorbord görünüyorsa o PNG'ye çekilip yayına gömülür. */}
                {bugVariant === "bottom" ? (
                  <BottomBoard ref={bugRef} {...bugProps} />
                ) : (
                  <ScoreBug ref={bugRef} {...bugProps} />
                )}
              </View>
            ) : null}

            {/* Önizleme göstergeleri (yayına gitmez) */}
            <View style={styles.hud} pointerEvents="none">
              <View style={[styles.pill, { backgroundColor: encoder.state === "live" ? RIG.live : encoderOn ? RIG.warn : RIG.glass }]}>
                <View style={[styles.pillDot, { backgroundColor: RIG.text }]} />
                <Text style={styles.pillText} allowFontScaling={false}>
                  {encoder.state === "live"
                    ? `CANLI ${elapsedText(elapsed)}`
                    : encoder.state === "connecting"
                      ? "BAĞLANIYOR"
                      : encoder.state === "reconnecting"
                        ? "YENİDEN BAĞLANIYOR"
                        : "YAYIN KAPALI"}
                </Text>
              </View>
              {stats && encoderOn ? (
                <View style={[styles.pill, { backgroundColor: RIG.glass }]}>
                  <Text style={styles.pillText} allowFontScaling={false}>
                    {Math.round(stats.bitrateKbps)} kbps · {Math.round(stats.fps)} fps
                  </Text>
                </View>
              ) : null}
              {replaying ? (
                <View style={[styles.pill, { backgroundColor: RIG.brand }]}>
                  <Ionicons name="repeat" size={11} color={RIG.text} />
                  <Text style={styles.pillText} allowFontScaling={false}>
                    TEKRAR YAYINDA
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Sahne üstü hızlı düğmeler: mikrofon ve tekrar (yayına gitmez) */}
            <View style={styles.stageBar}>
              <Touchable
                style={[styles.stageBtn, muted && styles.stageBtnOff]}
                onPress={toggleMic}
                disabled={!nativeReady}
                accessibilityLabel={muted ? "Mikrofonu aç" : "Mikrofonu kapat"}
                haptic="medium"
              >
                <Ionicons name={muted ? "mic-off" : "mic"} size={20} color={RIG.text} />
                <Text style={styles.stageBtnText} allowFontScaling={false}>
                  {muted ? "SES KAPALI" : "SES AÇIK"}
                </Text>
              </Touchable>
              {replaying ? (
                <Touchable style={[styles.stageBtn, styles.stageBtnReplay]} onPress={endReplay} accessibilityLabel="Tekrarı durdur" haptic="medium">
                  <Ionicons name="stop" size={18} color={RIG.text} />
                  <Text style={styles.stageBtnText} allowFontScaling={false}>
                    CANLIYA DÖN
                  </Text>
                </Touchable>
              ) : (
                <Touchable
                  style={[styles.stageBtn, styles.stageBtnReplay, !goalClips.latest && styles.stageBtnDisabled]}
                  onPress={() => void startReplay(goalClips.latest)}
                  disabled={!nativeReady}
                  accessibilityLabel="Son golün tekrarını yayına ver"
                  haptic="medium"
                >
                  <Ionicons name="repeat" size={18} color={RIG.text} />
                  <Text style={styles.stageBtnText} allowFontScaling={false}>
                    TEKRAR
                  </Text>
                </Touchable>
              )}
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
              <RailIcon icon={muted ? "mic-off" : "mic"} label={muted ? "Mikrofonu aç" : "Mikrofonu kapat"} color={muted ? RIG.live : RIG.text} onPress={toggleMic} />
              <RailIcon icon="camera-reverse" label="Kamerayı çevir" onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))} />
              <RailIcon icon="close" label="Kapat" onPress={close} />
            </View>
          ) : (
            <>
              <View style={styles.railHead}>
                <RailIcon icon="chevron-forward" label="Rejiyi daralt" onPress={() => setCollapsed(true)} small />
                <View style={styles.flex}>
                  <Text style={styles.railTitle} numberOfLines={1} allowFontScaling={false}>
                    {teamShortCode(homeName)} {live.score.home} – {live.score.away} {teamShortCode(awayName)}
                  </Text>
                  <Text style={styles.railSub} numberOfLines={1} allowFontScaling={false}>
                    {PHASE_LABEL[live.phase]} · {clockText(live.clockMs)}
                  </Text>
                </View>
                <RailIcon icon="close" label="Kapat" onPress={close} small />
              </View>
              <View style={styles.tabs}>
                {TABS.map((t) => (
                  <Touchable key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]} onPress={() => setTab(t.key)} accessibilityLabel={t.label}>
                    <Ionicons name={t.icon} size={14} color={tab === t.key ? RIG.text : RIG.textMute} />
                    <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]} allowFontScaling={false}>
                      {t.label}
                    </Text>
                  </Touchable>
                ))}
              </View>
              <ScrollView contentContainerStyle={styles.railBody} keyboardShouldPersistTaps="handled">
                {tab === "mac" ? (
                  <MatchPanel
                    live={live}
                    homeName={homeName}
                    awayName={awayName}
                    saving={saving}
                    onGoal={(side) => ask(side, "GOAL_RIGHT_FOOT", `${side === "home" ? homeName : awayName} — golü atan`)}
                    onControl={(a) => void runControl(a)}
                    onFinish={askFinish}
                    onToast={(m) => toast.show({ message: m, tone: "danger" })}
                  />
                ) : tab === "olay" ? (
                  <EventPanel live={live} homeName={homeName} awayName={awayName} onAsk={ask} onToast={(m, ok) => toast.show({ message: m, tone: ok ? "success" : "danger" })} />
                ) : tab === "tekrar" ? (
                  <ReplayPanel
                    rate={replayRate}
                    onRate={setReplayRate}
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
                    onToast={(m) => toast.show({ message: m, tone: "success" })}
                  />
                ) : (
                  <View style={styles.stack}>
                    <Btn
                      label={facing === "back" ? "Ön kameraya geç" : "Arka kameraya geç"}
                      icon="camera-reverse"
                      tone="soft"
                      disabled={!nativeReady}
                      onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
                    />
                    <Btn
                      label={muted ? "Mikrofonu aç" : "Mikrofonu kapat"}
                      icon={muted ? "mic" : "mic-off"}
                      tone="soft"
                      disabled={!nativeReady}
                      onPress={toggleMic}
                    />
                    <Btn
                      label={overlayOn ? "Skorbordu gizle" : "Skorbordu göster"}
                      icon={overlayOn ? "eye-off" : "eye"}
                      tone="soft"
                      onPress={() => setOverlayOn((v) => !v)}
                    />
                    <Text style={styles.groupTitle} allowFontScaling={false}>
                      SKORBORD
                    </Text>
                    {BUG_VARIANTS.map((v) => (
                      <Touchable
                        key={v.key}
                        style={[styles.option, bugVariant === v.key && styles.optionOn]}
                        onPress={() => setBugVariant(v.key)}
                        accessibilityLabel={v.label}
                        accessibilityState={{ selected: bugVariant === v.key }}
                      >
                        <Ionicons
                          name={bugVariant === v.key ? "radio-button-on" : "radio-button-off"}
                          size={16}
                          color={bugVariant === v.key ? RIG.brand : RIG.textMute}
                        />
                        <View style={styles.flex}>
                          <Text style={styles.optionTitle} allowFontScaling={false}>
                            {v.label}
                          </Text>
                          <Text style={styles.railSub} allowFontScaling={false}>
                            {v.hint}
                          </Text>
                        </View>
                      </Touchable>
                    ))}
                    <Text style={styles.railSub} allowFontScaling={false}>
                      {branding && (branding.logoUrl || branding.scoreboard.theme !== "elitlig")
                        ? "Logo ve renkler bu maçın web “Yayın Tasarımı” ayarından geliyor."
                        : "Logo ve renkler web reji panelindeki “Yayın Tasarımı”ndan değiştirilebilir."}
                    </Text>
                    <Text style={styles.groupTitle} allowFontScaling={false}>
                      YAYIN KALİTESİ
                    </Text>
                    {QUALITY_PRESETS.map((q) => (
                      <Touchable
                        key={q.key}
                        style={[styles.option, quality === q.key && styles.optionOn]}
                        onPress={() => setQuality(q.key)}
                        disabled={encoderOn}
                        accessibilityLabel={q.label}
                      >
                        <Ionicons name={quality === q.key ? "radio-button-on" : "radio-button-off"} size={16} color={quality === q.key ? RIG.brand : RIG.textMute} />
                        <View style={styles.flex}>
                          <Text style={styles.optionTitle} allowFontScaling={false}>
                            {q.label}
                          </Text>
                          <Text style={styles.railSub} allowFontScaling={false}>
                            {q.hint}
                          </Text>
                        </View>
                      </Touchable>
                    ))}
                    {encoderOn ? (
                      <Text style={styles.railSub} allowFontScaling={false}>
                        Kalite yayın sürerken değişmez; değiştirmek için görüntüyü durdurup yeniden başlat.
                      </Text>
                    ) : null}
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </View>

      {picker ? (
        <PlayerPicker
          title={picker.title}
          subtitle={`${eventLabel(picker.code)} · ${live.minute}'`}
          players={picker.side === "home" ? live.squads.home : live.squads.away}
          accent={picker.side === "home" ? RIG.home : RIG.away}
          busy={saving}
          onPick={(playerId) => void record(picker.side, picker.code, playerId)}
          onClose={cancelPicker}
        />
      ) : null}
    </View>
  );
}

/* ═══════════════════════════ MAÇ SEKMESİ ═══════════════════════════ */

function MatchPanel({
  live,
  homeName,
  awayName,
  saving,
  onGoal,
  onControl,
  onFinish,
  onToast,
}: {
  live: LiveMatch;
  homeName: string;
  awayName: string;
  saving: boolean;
  onGoal: (side: Side) => void;
  onControl: (a: ControlAction) => void;
  onFinish: () => void;
  onToast: (m: string) => void;
}) {
  const primary: { label: string; icon: keyof typeof Ionicons.glyphMap; action?: ControlAction; finish?: boolean } = (() => {
    switch (live.phase) {
      case "notStarted":
        return { label: "Maçı başlat", icon: "play", action: "start" };
      case "kickoff":
        return { label: "1. yarıyı başlat", icon: "play", action: "kickoff" };
      case "first":
        return { label: "Devre arası", icon: "cafe", action: "halftime" };
      case "halftime":
        return { label: "2. yarıyı başlat", icon: "play-forward", action: "second" };
      case "paused":
        return { label: "Saati sürdür", icon: "play", action: "resume" };
      case "second":
      case "extra":
        return { label: "Maçı bitir", icon: "flag", finish: true };
      case "finished":
        return { label: "Tekrar canlıya al", icon: "refresh", action: "reopen" };
    }
  })();

  const lastGoal = [...live.timeline].reverse().find((e) => String(e.olay_kodu).toUpperCase().startsWith("GOAL_"));

  const undo = () => {
    if (!lastGoal) return;
    Alert.alert("Son golü sil", `${eventLabel(lastGoal.olay_kodu)} (${lastGoal.dakika ?? 0}') silinsin mi? Skor yeniden hesaplanır.`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: () => void live.removeEvent(Number(lastGoal.id)).catch((e: unknown) => onToast(errorText(e, "Gol silinemedi."))),
      },
    ]);
  };

  return (
    <View style={styles.stack}>
      <View style={styles.scoreRow}>
        {(["home", "away"] as const).map((side) => (
          <View key={side} style={styles.scoreCard}>
            <View style={[styles.teamStripe, { backgroundColor: side === "home" ? RIG.home : RIG.away }]} />
            <Text style={styles.teamName} numberOfLines={1} allowFontScaling={false}>
              {side === "home" ? homeName : awayName}
            </Text>
            <Text style={styles.bigScore} allowFontScaling={false}>
              {side === "home" ? live.score.home : live.score.away}
            </Text>
            <Btn label="GOL" icon="add" tone="brand" compact onPress={() => onGoal(side)} disabled={saving || live.manual} />
          </View>
        ))}
      </View>
      {live.manual ? (
        <Text style={styles.railSub} allowFontScaling={false}>
          Skor elle / hükmen tescil edildi; goller skoru değiştirmez.
        </Text>
      ) : null}
      {lastGoal ? (
        <Touchable style={styles.undo} onPress={undo} accessibilityLabel="Son golü sil">
          <Ionicons name="arrow-undo" size={14} color={RIG.textSoft} />
          <Text style={styles.undoText} numberOfLines={1} allowFontScaling={false}>
            Son gol: {live.nameOf(lastGoal.oyuncu_id) ?? "oyuncusuz"} {lastGoal.dakika ?? 0}' — geri al
          </Text>
        </Touchable>
      ) : null}

      <View style={styles.clockCard}>
        <Text style={styles.clock} allowFontScaling={false}>
          {clockText(live.clockMs)}
        </Text>
        <Text style={styles.railSub} allowFontScaling={false}>
          {PHASE_LABEL[live.phase]} · {live.period >= 3 ? "Uzatma" : `${live.period}. devre`}
        </Text>
        <View style={styles.nudgeRow}>
          {[-60_000, -10_000, 10_000, 60_000].map((d) => (
            <Touchable
              key={d}
              style={styles.nudge}
              onPress={() => void live.nudgeClock(d).catch((e: unknown) => onToast(errorText(e, "Saat düzeltilemedi.")))}
              disabled={saving || live.status !== "canli"}
              accessibilityLabel={`Saati ${d > 0 ? "ileri" : "geri"} al`}
            >
              <Text style={styles.nudgeText} allowFontScaling={false}>
                {d > 0 ? "+" : "−"}
                {Math.abs(d) >= 60_000 ? "1 dk" : "10 sn"}
              </Text>
            </Touchable>
          ))}
        </View>
      </View>

      <Btn
        label={primary.label}
        icon={primary.icon}
        tone={primary.finish ? "danger" : "ok"}
        disabled={saving}
        onPress={() => (primary.finish ? onFinish() : primary.action && onControl(primary.action))}
      />
      {live.running ? (
        <Btn label="Saati durdur" icon="pause" tone="soft" disabled={saving} onPress={() => onControl("pause")} />
      ) : null}
      {live.phase === "second" && live.clockMs >= HALF_MS * 2 ? (
        <Btn label="Uzatmaya geç" icon="time" tone="soft" disabled={saving} onPress={() => onControl("extra")} />
      ) : null}
      {live.phase === "paused" && live.period >= 2 ? (
        <Btn label="Maçı bitir" icon="flag" tone="danger" disabled={saving} onPress={onFinish} />
      ) : null}
    </View>
  );
}

/* ═══════════════════════════ OLAY SEKMESİ ═══════════════════════════ */

const QUICK_EVENTS: { code: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { code: "YELLOW_CARD", label: "Sarı kart", icon: "square", color: RIG.yellow },
  { code: "RED_CARD", label: "Kırmızı kart", icon: "square", color: RIG.red },
  { code: "GOAL_PENALTY", label: "Penaltı golü", icon: "football", color: RIG.text },
  { code: "GOAL_HEADER", label: "Kafa golü", icon: "football", color: RIG.text },
  { code: "GOAL_FREEKICK", label: "Frikik golü", icon: "football", color: RIG.text },
  { code: "GOAL_OWN", label: "Kendi kalesine", icon: "football", color: RIG.warn },
];

function EventPanel({
  live,
  homeName,
  awayName,
  onAsk,
  onToast,
}: {
  live: LiveMatch;
  homeName: string;
  awayName: string;
  onAsk: (side: Side, code: string, title: string) => void;
  onToast: (m: string, ok?: boolean) => void;
}) {
  const recent = [...live.timeline].reverse().slice(0, 8);
  const remove = (id: number, label: string) =>
    Alert.alert("Olayı sil", `${label} silinsin mi?`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: () =>
          void live
            .removeEvent(id)
            .then(() => onToast("Olay silindi.", true))
            .catch((e: unknown) => onToast(errorText(e, "Olay silinemedi."))),
      },
    ]);

  return (
    <View style={styles.stack}>
      {(["home", "away"] as const).map((side) => {
        const name = side === "home" ? homeName : awayName;
        return (
          <View key={side} style={styles.stack}>
            <Text style={styles.groupTitle} numberOfLines={1} allowFontScaling={false}>
              {name.toLocaleUpperCase("tr-TR")}
            </Text>
            <View style={styles.quickGrid}>
              {QUICK_EVENTS.map((q) => (
                <Touchable key={q.code} style={styles.quick} onPress={() => onAsk(side, q.code, `${name} — ${q.label}`)} accessibilityLabel={`${name} ${q.label}`}>
                  <Ionicons name={q.icon} size={13} color={q.color} />
                  <Text style={styles.quickText} numberOfLines={1} allowFontScaling={false}>
                    {q.label}
                  </Text>
                </Touchable>
              ))}
            </View>
          </View>
        );
      })}

      <Text style={styles.groupTitle} allowFontScaling={false}>
        SON OLAYLAR
      </Text>
      {recent.length ? (
        recent.map((ev) => {
          const side = Number(ev.takim_id) === Number(live.homeTeamId) ? "home" : "away";
          const label = `${eventLabel(ev.olay_kodu)} ${ev.dakika ?? 0}'`;
          return (
            <View key={ev.id} style={styles.eventRow}>
              <View style={[styles.eventDot, { backgroundColor: side === "home" ? RIG.home : RIG.away }]} />
              <View style={styles.flex}>
                <Text style={styles.optionTitle} numberOfLines={1} allowFontScaling={false}>
                  {label}
                </Text>
                <Text style={styles.railSub} numberOfLines={1} allowFontScaling={false}>
                  {live.nameOf(ev.oyuncu_id ?? ev.oyuncu_giren_id) ?? (side === "home" ? homeName : awayName)}
                </Text>
              </View>
              <Touchable style={styles.trash} onPress={() => remove(Number(ev.id), label)} accessibilityLabel={`${label} sil`}>
                <Ionicons name="trash-outline" size={15} color={RIG.textSoft} />
              </Touchable>
            </View>
          );
        })
      ) : (
        <Text style={styles.railSub} allowFontScaling={false}>
          Henüz gol / kart girilmedi.
        </Text>
      )}
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
    <Touchable style={[styles.railIcon, small && styles.railIconSmall]} onPress={onPress} accessibilityLabel={label} haptic="selection">
      <Ionicons name={icon} size={small ? 16 : 20} color={color ?? RIG.text} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RIG.bg },
  center: { alignItems: "center", justifyContent: "center", gap: space.md, padding: space.lg },
  row: { flex: 1, flexDirection: "row", gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  stack: { gap: space.sm },
  lockedText: { ...type.body, color: RIG.textSoft, textAlign: "center", maxWidth: 420 },

  stageWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  stage: { backgroundColor: RIG.stage, overflow: "hidden", borderRadius: radius.sm },
  noCam: { backgroundColor: RIG.panel },
  noCamText: { ...type.bodySm, color: RIG.textSoft, textAlign: "center", maxWidth: 320 },
  hud: { position: "absolute", right: space.sm, top: space.sm, flexDirection: "row", gap: space.xs },
  pill: { flexDirection: "row", alignItems: "center", gap: space.xs, height: 22, paddingHorizontal: space.sm, borderRadius: radius.pill },
  pillDot: { width: 6, height: 6, borderRadius: radius.pill },
  pillText: { ...type.micro, color: RIG.text },
  stageBar: { position: "absolute", left: space.sm, bottom: space.sm, flexDirection: "row", gap: space.sm },
  stageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: RIG.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RIG.line,
  },
  stageBtnOff: { backgroundColor: RIG.live },
  stageBtnReplay: { backgroundColor: RIG.brand },
  stageBtnDisabled: { opacity: 0.5 },
  stageBtnText: { ...type.micro, color: RIG.text },

  rail: { backgroundColor: RIG.panel, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: RIG.line },
  collapsed: { flex: 1, alignItems: "center", justifyContent: "space-evenly", paddingVertical: space.sm },
  railHead: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.xs, paddingTop: space.xs },
  railTitle: { ...type.h4, color: RIG.text },
  railSub: { ...type.caption, color: RIG.textMute },
  railIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: RIG.panelSoft },
  railIconSmall: { width: 34, height: 34 },
  tabs: { flexDirection: "row", margin: space.sm, padding: space.xxs, borderRadius: radius.md, backgroundColor: RIG.panelSoft },
  tab: { flex: 1, height: 30, flexDirection: "row", gap: space.xxs, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  tabOn: { backgroundColor: RIG.panelStrong },
  tabText: { ...type.micro, color: RIG.textMute },
  tabTextOn: { color: RIG.text },
  railBody: { paddingHorizontal: space.sm, paddingBottom: space.lg, gap: space.sm },

  scoreRow: { flexDirection: "row", gap: space.sm },
  scoreCard: { flex: 1, alignItems: "center", gap: space.xs, padding: space.sm, borderRadius: radius.md, backgroundColor: RIG.panelSoft, overflow: "hidden" },
  teamStripe: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  teamName: { ...type.caption, color: RIG.textSoft, alignSelf: "stretch", textAlign: "center" },
  bigScore: { ...type.scoreLg, color: RIG.text },
  undo: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs },
  undoText: { ...type.caption, color: RIG.textSoft, flex: 1 },
  clockCard: { alignItems: "center", gap: space.xxs, padding: space.sm, borderRadius: radius.md, backgroundColor: RIG.panelSoft },
  clock: { ...type.scoreMd, color: RIG.text },
  nudgeRow: { flexDirection: "row", gap: space.xs, marginTop: space.xs },
  nudge: { paddingHorizontal: space.sm, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: RIG.panelStrong },
  nudgeText: { ...type.micro, color: RIG.text },

  groupTitle: { ...type.micro, color: RIG.textMute, marginTop: space.xs },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  quick: {
    width: "48.5%",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 34,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: RIG.panelSoft,
  },
  quickText: { ...type.caption, color: RIG.text, flex: 1 },
  eventRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xxs },
  eventDot: { width: 8, height: 8, borderRadius: radius.pill },
  trash: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: RIG.panelSoft },

  option: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: RIG.panelSoft },
  optionOn: { backgroundColor: RIG.brandDim },
  optionTitle: { ...type.label, color: RIG.text },
});
