/**
 * YAYIN STÜDYOSU — ana ekran (`/yonetim/studyo`, yetki: matches.live)
 *
 * Stüdyonun dikey "giriş salonu": yayınlanacak maç seçilir, yayın öncesi
 * denetim yapılır ve tek büyük düğmeyle yatay stüdyo açılır
 * (`/yonetim/canli-yayin/:id`).
 *
 *   SAHNE KARTI   seçili maç + "Stüdyoyu aç". Canlı maç varsa o, yoksa bugünün
 *                 ilk maçı kendiliğinden seçilir.
 *   ÖN KONTROL    kamera / mikrofon izni, ağ türü ve sunucu yanıt süresi, pil,
 *                 yayın hedefi (YouTube bağlantısı ya da kayıtlı RTMP anahtarı).
 *   YENİ MAÇ      maç oluşturma yetkisi olan, listede olmayan maçı buradan
 *                 açar (`/yonetim/mac-olustur?donus=studyo`); kayıttan sonra
 *                 stüdyoya dönülür, yeni maç listede seçili gelir.
 *   MAÇLAR        canlı · bugün · yaklaşan (14 gün), aranabilir. Seçili maçın
 *                 altında "Kadro" ve "Maç sonu" kısayolları açılır.
 *   SON YAYINLAR  son 30 günde yayın / kayıt bağlantısı olan maçlar.
 *
 * Maç listesi masaüstü stüdyoyla aynı uçtan gelir
 * (GET /api/admin/live-streams/matches): il kapsamı sunucuda uygulanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Linking, StyleSheet, Text, View } from "react-native";

import { AdminScreen } from "@/components/admin";
import { dayOf, hhmm, shortDay } from "@/components/admin/matches/model";
import { Badge, Button, EmptyState, ErrorState, GradientFill, Input, SectionHeader, Touchable, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { takeStudioMatch } from "@/lib/admin/studioHandoff";
import { normalizeMatchStatus } from "@/lib/api/admin/matches";
import { get } from "@/lib/http";
import { loadRtmpTarget } from "@/lib/live/studioSettings";
import { listStudioMatches, type StudioMatch } from "@/lib/live/studioApi";
import { getLiveStreamConfig } from "@/lib/live/youtube";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, type } from "@/theme";
import { getDeviceStatus, isLiveAvailable, requestLivePermissions, type DeviceStatus } from "@/modules/elitlig-live";

const isoDay = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const NETWORK_TEXT: Record<DeviceStatus["network"], string> = {
  wifi: "Wi-Fi",
  cellular: "Mobil veri",
  ethernet: "Kablolu ağ",
  none: "Bağlantı yok",
  unknown: "Ağ türü okunamadı",
};

type CheckTone = "ok" | "warn" | "bad" | "wait";

const fold = (v: string) => v.toLocaleLowerCase("tr-TR");

export default function StudioHomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const today = isoDay(0);
  const canCreate = hasAnyPermission(auth.user, ["matches.create"]);
  const canLineup = hasAnyPermission(auth.user, ["matches.lineup"]);
  const canPost = hasAnyPermission(auth.user, ["matches.stats", "matches.update"]);
  const canWorkflow = hasAnyPermission(auth.user, ["matches.view", "matches.update", "matches.lineup", "matches.live", "matches.stats"]);

  const matchesQuery = useQuery({
    queryKey: ["studio", "matches", today],
    queryFn: () => listStudioMatches({ date_from: isoDay(-30), date_to: isoDay(14), limit: 400 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  /* ───────── maç grupları ───────── */
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = fold(query.trim());
    const all = (matchesQuery.data?.items ?? []).filter((m) => {
      if (normalizeMatchStatus(m.mac_durumu) === "taslak") return false;
      if (!q) return true;
      return fold(`${m.first_team_name ?? ""} ${m.second_team_name ?? ""} ${m.league_name ?? ""} ${m.match_field ?? ""}`).includes(q);
    });
    const byTime = (a: StudioMatch, b: StudioMatch) => `${dayOf(a.date)} ${a.time ?? ""}`.localeCompare(`${dayOf(b.date)} ${b.time ?? ""}`);
    const status = (m: StudioMatch) => normalizeMatchStatus(m.mac_durumu);
    const liveNow = all.filter((m) => status(m) === "canli").sort(byTime);
    const todays = all.filter((m) => status(m) !== "canli" && dayOf(m.date) === today).sort(byTime);
    const upcoming = all
      .filter((m) => status(m) === "zamanlanmis" && dayOf(m.date) > today)
      .sort(byTime)
      .slice(0, 30);
    const recent = all
      .filter((m) => dayOf(m.date) < today && Boolean(String(m.match_video ?? "").trim()))
      .sort((a, b) => byTime(b, a))
      .slice(0, 12);
    return { liveNow, todays, upcoming, recent };
  }, [matchesQuery.data, query, today]);

  const [pickedId, setPickedId] = useState<number | null>(null);

  /* "Yeni maç"tan dönüş: yeni maç listeye gelsin ve seçili olsun. */
  const refetchMatches = matchesQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      const createdId = takeStudioMatch();
      if (!createdId) return;
      setQuery("");
      setPickedId(createdId);
      void refetchMatches();
    }, [refetchMatches])
  );
  const createMatch = () => router.push("/yonetim/mac-olustur?donus=studyo");
  const openStep = (m: StudioMatch, step?: "kadro" | "mac-sonu") => router.push(`/yonetim/mac/${m.id}${step ? `?adim=${step}` : ""}`);
  const candidates = useMemo(() => [...groups.liveNow, ...groups.todays, ...groups.upcoming], [groups]);
  const selected = candidates.find((m) => m.id === pickedId) ?? groups.liveNow[0] ?? groups.todays.find((m) => normalizeMatchStatus(m.mac_durumu) !== "yayinlanmis") ?? null;

  /* ───────── ön kontrol ───────── */
  const nativeReady = isLiveAvailable();
  const [permission, setPermission] = useState<boolean | null>(null);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [hasRtmp, setHasRtmp] = useState(false);
  const config = useQuery({ queryKey: ["live-stream", "config"], queryFn: getLiveStreamConfig, staleTime: 5 * 60_000, retry: false });
  const ping = useQuery({
    queryKey: ["studio", "ping"],
    queryFn: async () => {
      const started = Date.now();
      await get("/api/meta/cities", undefined, { retry: false });
      return Date.now() - started;
    },
    staleTime: 20_000,
    retry: false,
  });

  const readDevice = useCallback(() => {
    void getDeviceStatus().then(setDevice);
    void loadRtmpTarget().then((t) => setHasRtmp(Boolean(t)));
  }, []);
  useEffect(() => {
    readDevice();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") readDevice();
    });
    return () => sub.remove();
  }, [readDevice]);

  const askPermission = async () => {
    const ok = await requestLivePermissions().catch(() => false);
    setPermission(ok);
    if (!ok) {
      toast.show({ message: "İzin verilmedi. Ayarlar'dan kamera ve mikrofon iznini aç.", tone: "warn" });
      void Linking.openSettings().catch(() => undefined);
    }
  };

  const refresh = () => {
    readDevice();
    void queryClient.invalidateQueries({ queryKey: ["studio"] });
    return matchesQuery.refetch();
  };

  const open = (m: StudioMatch) => router.push(`/yonetim/canli-yayin/${m.id}`);

  const battery = device && device.batteryLevel >= 0 ? Math.round(device.batteryLevel * 100) : null;
  const checks: { key: string; icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; tone: CheckTone; action?: { label: string; onPress: () => void } }[] = [
    !nativeReady
      ? { key: "app", icon: "construct", title: "Kamera yayını", detail: "Bu uygulama sürümünde yok. Mağazadaki güncel sürümle çalışır; reji kontrolleri yine kullanılabilir.", tone: "bad" }
      : {
          key: "perm",
          icon: "videocam",
          title: "Kamera ve mikrofon",
          detail: permission === true ? "İzin verildi" : permission === false ? "İzin verilmedi" : "Yayın için izin gerekir",
          tone: permission === true ? "ok" : permission === false ? "bad" : "wait",
          action: permission === true ? undefined : { label: "İzin ver", onPress: () => void askPermission() },
        },
    {
      key: "net",
      icon: device?.network === "cellular" ? "cellular" : "wifi",
      title: "İnternet",
      detail: ping.isError
        ? "Sunucuya ulaşılamıyor. Bağlantını kontrol et."
        : `${device ? NETWORK_TEXT[device.network] : "Bağlantı"}${ping.data != null ? ` · sunucu yanıtı ${ping.data} ms` : " · ölçülüyor…"}${device?.network === "cellular" ? " · 720p için saatte ≈1,2 GB veri" : ""}`,
      tone: ping.isError || device?.network === "none" ? "bad" : ping.data == null ? "wait" : ping.data > 1500 || device?.network === "cellular" ? "warn" : "ok",
    },
    {
      key: "battery",
      icon: device?.charging ? "battery-charging" : "battery-half",
      title: "Pil",
      detail:
        battery == null
          ? "Uzun maçta telefonu şarja tak; yayın pili hızlı tüketir ve telefonu ısıtır."
          : `%${battery}${device?.charging ? " · şarjda" : ""}${device?.lowPower ? " · pil tasarrufu açık (kapatman önerilir)" : !device?.charging && battery < 50 ? " · bir maç için şarja takman önerilir" : ""}`,
      tone: battery == null ? "wait" : device?.lowPower || (!device?.charging && battery < 25) ? "bad" : !device?.charging && battery < 50 ? "warn" : "ok",
    },
    {
      key: "target",
      icon: "logo-youtube",
      title: "Yayın hedefi",
      detail: config.data?.configured
        ? "YouTube kanalı bağlı: yayın stüdyodan tek dokunuşla açılır"
        : hasRtmp
          ? "Kayıtlı yayın anahtarı (elle RTMP) kullanılacak"
          : config.isLoading
            ? "YouTube bağlantısı denetleniyor…"
            : "YouTube kanalı bağlı değil. Stüdyoda Yayın sekmesinden yayın anahtarını gir.",
      tone: config.data?.configured || hasRtmp ? "ok" : config.isLoading ? "wait" : "warn",
    },
  ];
  const blocking = checks.filter((c) => c.tone === "bad").length;

  const row = (m: StudioMatch, mode: "pick" | "recent") => {
    const status = normalizeMatchStatus(m.mac_durumu);
    const isLive = status === "canli";
    const done = status === "yayinlanmis";
    const on = mode === "pick" && selected?.id === m.id;
    const video = String(m.match_video ?? "").trim();
    return (
      <React.Fragment key={`${mode}-${m.id}`}>
      <Touchable
        style={[styles.match, on && styles.matchOn]}
        onPress={() => (mode === "recent" ? void Linking.openURL(video).catch(() => toast.show({ message: "Yayın bağlantısı açılamadı.", tone: "danger" })) : setPickedId(m.id))}
        accessibilityLabel={`${m.first_team_name ?? "Ev sahibi"} – ${m.second_team_name ?? "Deplasman"}${mode === "recent" ? ", yayını aç" : ", seç"}`}
        accessibilityState={mode === "pick" ? { selected: on } : undefined}
        haptic="selection"
      >
        <View style={styles.matchTime}>
          <Text style={[styles.time, isLive && styles.timeLive]} numberOfLines={1}>
            {isLive ? "CANLI" : mode === "recent" || dayOf(m.date) !== today ? shortDay(m.date).split(" ").slice(0, 2).join(" ") : hhmm(m.time) || "–"}
          </Text>
          {mode === "pick" && dayOf(m.date) !== today && !isLive ? (
            <Text style={styles.meta} numberOfLines={1}>
              {hhmm(m.time)}
            </Text>
          ) : null}
        </View>
        <View style={styles.flex}>
          <Text style={styles.teams} numberOfLines={1}>
            {m.first_team_name ?? "Ev sahibi"} – {m.second_team_name ?? "Deplasman"}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[m.league_name, m.match_field].filter(Boolean).join(" · ") || "Lig bilgisi yok"}
          </Text>
        </View>
        {isLive || done ? (
          <Text style={styles.score}>
            {m.first_team_score ?? 0}–{m.second_team_score ?? 0}
          </Text>
        ) : null}
        {mode === "recent" ? (
          <Ionicons name="play-circle" size={22} color={colors.brand} />
        ) : (
          <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? colors.brand : colors.textTertiary} />
        )}
      </Touchable>
      {on && (canLineup || canPost || canWorkflow) ? (
        <View style={styles.quick}>
          {canLineup ? <Button label="Kadro" icon="people-outline" size="sm" variant="secondary" onPress={() => openStep(m, "kadro")} style={styles.flex} accessibilityHint="Bu maçın kadro girişini aç" /> : null}
          {canPost ? <Button label="Maç sonu" icon="star-outline" size="sm" variant="secondary" onPress={() => openStep(m, "mac-sonu")} style={styles.flex} accessibilityHint="Sonuç, puanlar, içerik ve istatistikler" /> : null}
          {canWorkflow ? <Button label="İş akışı" icon="git-branch-outline" size="sm" variant="ghost" onPress={() => openStep(m)} style={styles.flex} /> : null}
        </View>
      ) : null}
      </React.Fragment>
    );
  };

  const empty = !groups.liveNow.length && !groups.todays.length && !groups.upcoming.length;
  const scopeCity = matchesQuery.data?.scope?.city;

  return (
    <AdminScreen
      title="Yayın Stüdyosu"
      subtitle={scopeCity ? `${scopeCity} · maç yayını` : "Maç yayını"}
      permission={["matches.live"]}
      onRefresh={refresh}
      refreshing={matchesQuery.isRefetching}
      contentStyle={styles.content}
      actions={canCreate ? [{ icon: "add-circle-outline", accessibilityLabel: "Yeni maç oluştur", onPress: createMatch }] : undefined}
    >
      {/* ═════════ SAHNE KARTI ═════════ */}
      <View style={styles.stage}>
        <GradientFill tone="ink" radius="xxl" />
        <View style={styles.stageHead}>
          <View style={styles.stageIcon}>
            <Ionicons name="videocam" size={18} color={colors.onDark} />
          </View>
          <Text style={styles.stageBrand}>STÜDYO</Text>
          {selected && normalizeMatchStatus(selected.mac_durumu) === "canli" ? <Badge label="Maç canlı" tone="live" variant="solid" /> : null}
        </View>
        {selected ? (
          <>
            <Text style={styles.stageTeams} numberOfLines={2}>
              {selected.first_team_name ?? "Ev sahibi"} – {selected.second_team_name ?? "Deplasman"}
            </Text>
            <Text style={styles.stageMeta} numberOfLines={2}>
              {[dayOf(selected.date) === today ? "Bugün" : shortDay(selected.date), hhmm(selected.time), selected.league_name, selected.match_field].filter(Boolean).join(" · ")}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.stageTeams}>Yayınlanacak maçı seç</Text>
            <Text style={styles.stageMeta}>Aşağıdaki listeden bir maça dokun; skorbord, tekrar ve altyazı o maçın verisiyle çalışır.</Text>
          </>
        )}
        <Button
          label="Stüdyoyu aç"
          icon="radio"
          size="lg"
          fullWidth
          disabled={!selected}
          onPress={() => selected && open(selected)}
          accessibilityHint="Ekran yataya döner ve yayın stüdyosu açılır"
        />
        <Text style={styles.stageHint}>
          {blocking ? `Ön kontrolde ${blocking} sorun var; stüdyo yine açılır ama yayın başlamayabilir.` : "Telefonu yan çevir; stüdyo yatay ekranda açılır."}
        </Text>
      </View>

      {/* ═════════ ÖN KONTROL ═════════ */}
      <SectionHeader title="Yayın öncesi kontrol" inset="flush" />
      <View style={styles.card}>
        {checks.map((c, i) => (
          <View key={c.key} style={[styles.check, i > 0 && styles.checkBorder]}>
            <View style={[styles.checkIcon, { backgroundColor: c.tone === "ok" ? colors.winDim : c.tone === "bad" ? colors.dangerDim : c.tone === "warn" ? colors.warnDim : colors.surface2 }]}>
              <Ionicons name={c.icon} size={16} color={c.tone === "ok" ? colors.win : c.tone === "bad" ? colors.danger : c.tone === "warn" ? colors.warn : colors.textSecondary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.checkTitle}>{c.title}</Text>
              <Text style={styles.meta}>{c.detail}</Text>
            </View>
            {c.action ? (
              <Button label={c.action.label} size="sm" variant="secondary" onPress={c.action.onPress} />
            ) : (
              <Ionicons
                name={c.tone === "ok" ? "checkmark-circle" : c.tone === "bad" ? "close-circle" : c.tone === "warn" ? "alert-circle" : "ellipse-outline"}
                size={18}
                color={c.tone === "ok" ? colors.win : c.tone === "bad" ? colors.danger : c.tone === "warn" ? colors.warn : colors.textTertiary}
              />
            )}
          </View>
        ))}
      </View>

      {/* ═════════ MAÇLAR ═════════ */}
      <SectionHeader title="Maçlar" meta="Canlı · bugün · yaklaşan" inset="flush" />
      {canCreate ? (
        <Button
          label="Yeni maç oluştur"
          icon="add-circle-outline"
          variant="secondary"
          fullWidth
          onPress={createMatch}
          accessibilityHint="Listede olmayan maçı oluştur; kayıttan sonra stüdyoya dönersin"
        />
      ) : null}
      <Input variant="search" value={query} onChangeText={setQuery} placeholder="Takım, lig ya da saha ara" accessibilityLabel="Maç ara" />

      {matchesQuery.isLoading ? (
        <View style={styles.card}>
          <Text style={[styles.meta, styles.pad]}>Maçlar yükleniyor…</Text>
        </View>
      ) : matchesQuery.isError ? (
        <ErrorState error={matchesQuery.error} variant="inline" onRetry={() => void matchesQuery.refetch()} />
      ) : empty ? (
        <EmptyState
          variant="inline"
          icon="calendar-outline"
          title={query.trim() ? "Aramayla eşleşen maç yok" : "Önümüzdeki 14 günde yayınlanacak maç yok"}
          body={query.trim() ? "Takım ya da lig adını kontrol et." : "Maç zamanlandığında burada görünür."}
          action={
            query.trim()
              ? { label: "Aramayı temizle", onPress: () => setQuery(""), haptic: "light" }
              : canCreate
                ? { label: "Yeni maç oluştur", onPress: createMatch }
                : { label: "Maçlara git", onPress: () => router.push("/yonetim/maclar") }
          }
          secondaryAction={!query.trim() && canCreate ? { label: "Maçlara git", onPress: () => router.push("/yonetim/maclar") } : undefined}
        />
      ) : (
        <>
          {groups.liveNow.length ? (
            <>
              <SectionHeader title="Şu an canlı" meta={`${groups.liveNow.length} maç`} inset="flush" />
              <View style={styles.card}>{groups.liveNow.map((m) => row(m, "pick"))}</View>
            </>
          ) : null}
          {groups.todays.length ? (
            <>
              <SectionHeader title="Bugün" meta={`${groups.todays.length} maç`} inset="flush" />
              <View style={styles.card}>{groups.todays.map((m) => row(m, "pick"))}</View>
            </>
          ) : null}
          {groups.upcoming.length ? (
            <>
              <SectionHeader title="Yaklaşan" meta={`${groups.upcoming.length} maç`} inset="flush" />
              <View style={styles.card}>{groups.upcoming.map((m) => row(m, "pick"))}</View>
            </>
          ) : null}
        </>
      )}

      {groups.recent.length ? (
        <>
          <SectionHeader title="Son yayınlar" meta="Son 30 gün" inset="flush" />
          <View style={styles.card}>{groups.recent.map((m) => row(m, "recent"))}</View>
        </>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.huge, gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  pad: { padding: space.lg },

  stage: { borderRadius: radius.xxl, overflow: "hidden", padding: space.lg, gap: space.sm },
  stageHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stageIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.inkPill },
  stageBrand: { ...type.overline, color: colors.brandOnDark, flex: 1 },
  stageTeams: { ...type.display, color: colors.onDark },
  stageMeta: { ...type.bodySm, color: colors.onDarkMuted, marginBottom: space.xs },
  stageHint: { ...type.caption, color: colors.onDarkMuted, textAlign: "center" },

  card: { borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border, overflow: "hidden" },
  check: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md },
  checkBorder: { borderTopWidth: hairline, borderTopColor: colors.border },
  checkIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  checkTitle: { ...type.h4, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textSecondary },

  match: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingHorizontal: space.md, paddingVertical: space.sm },
  matchOn: { backgroundColor: colors.brandDim },
  quick: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md, backgroundColor: colors.brandDim },
  matchTime: { width: 56 },
  time: { ...type.tableNumStrong, color: colors.textPrimary },
  timeLive: { color: colors.live },
  teams: { ...type.h4, color: colors.textPrimary },
  score: { ...type.scoreXs, color: colors.textPrimary },
});
