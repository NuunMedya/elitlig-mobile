/**
 * ŞEHİR ZİYARETİ — /kulup-sehri-ziyaret-sehir?id=…&ids=… (TAM EKRAN OYUN)
 *
 * Başka bir üyenin şehri, SALT OKUNUR (GET /api/puzzle/city2/visit/:userId),
 * kendi şehrin gibi kenardan kenara oyun sahnesi:
 *   · Sahne (games/sehir.js, `type:"city2"`): onun binaları, yerleşik sembol
 *     yapıları ve ızgarası. Yerleştirme ve yükseltme yok.
 *   · Üstte ziyaret HUD'u (game/CityHudKit · VisitTopBar): geri, sahibin
 *     arması + adı + il/takım (dokununca şehir bilgisi), bütün şehri göster;
 *     altında lig şeridi ve güzellik / gelişim / alkış hapları.
 *   · Binaya dokununca kamera binaya uçar ve alttan salt okunur oyun paneli
 *     açılır (aşama, ilerleme). Boş zemine dokunmak paneli kapatır.
 *   · Altta tahta raf: önceki şehir · büyük ALKIŞLA düğmesi · sonraki şehir.
 *     Alkış (günde şehir başına 1, günlük tavanlı) → +yıldız (ikisine de);
 *     başarıda sahne havai fişek oynatır.
 *   · Şehir bilgisi penceresi: istatistikler, sezon rozetleri, binalar.
 * Ziyarete kapalı (403) ya da bulunamayan (404) şehirde sahnenin ortasında
 * dostça bir oyun penceresi.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CrestBadge, PrestigeStars, TierMedal } from "@/components/city2/Season";
import { BuildingIcon, fmt } from "@/components/city2/shared";
import { BOTTOM, GameBar, GlossyButton, PaperHead, PaperRow, PaperText, TOP, WoodFrame } from "@/components/city2/game/CityGameKit";
import { CityDock, VisitTopBar, type DockTile } from "@/components/city2/game/CityHudKit";
import { GameModal } from "@/components/city2/game/GameModal";
import { GameEmpty, GameError, GameStatBar } from "@/components/city2/game/GamePaper";
import { WebGame, type WebGameHandle } from "@/components/game/WebGame";
import { Touchable } from "@/components/ui";
import type { City2PublicCity } from "@/lib/puzzle/city2";
import { CG, CP } from "@/lib/puzzle/cityGamePalette";
import { CITY_SKY, CLUB_KITS } from "@/lib/puzzle/cityPalette";
import { useCity2Applause, useCity2Visit } from "@/lib/puzzle/useCity2";
import { useAuth } from "@/providers/AuthProvider";
import { fonts, layout, radius, space, textScale, type } from "@/theme";

const BLOCKED_TEXT: Record<string, string> = {
  ALREADY_APPLAUDED: "BUGÜN ALKIŞLADIN",
  DAILY_APPLAUSE_CAP: "ALKIŞ HAKKIN DOLDU",
  SELF_APPLAUSE: "KENDİ ŞEHRİN",
  NOT_ALLOWED: "ŞU AN ALKIŞLANAMAZ",
};

type PublicBuilding = City2PublicCity["buildings"][number];

export default function VisitCityScreen() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; ids?: string }>();
  const ids = useMemo(() => String(params.ids ?? "").split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0), [params.ids]);
  const [id, setId] = useState<number | null>(() => (params.id ? Number(params.id) : null));
  useEffect(() => {
    if (params.id) setId(Number(params.id));
  }, [params.id]);
  const { query, view, closed, missing } = useCity2Visit(id);
  const scene = useRef<WebGameHandle>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [hudH, setHudH] = useState(0);
  const [dockH, setDockH] = useState(0);
  const [panelH, setPanelH] = useState(0);
  const send = useCallback((cmd: Parameters<WebGameHandle["send"]>[0]) => scene.current?.send(cmd), []);
  const applaud = useCity2Applause({ onDone: () => send({ type: "celebrate" }) });

  const city = view?.city ?? null;
  const message = useMemo(() => {
    if (!city) return null;
    const kit = CLUB_KITS[0];
    return {
      type: "city2" as const,
      buildings: Object.fromEntries(city.buildings.map((b) => [b.key, b.stage])),
      rung: city.ladder.rung,
      kit: { primary: kit.primary, secondary: kit.secondary },
      marks: {},
      landmarks: city.landmarks.map((l) => ({ id: l.id, key: l.key, slot: l.slot, tier: l.tier })),
      grid: city.grid,
      place: null,
      focus: null,
    };
  }, [city]);
  useEffect(() => {
    if (ready && message) send(message);
  }, [ready, message, send]);

  /* Sahnenin görünür alanı: üst HUD + (açık panel | alt raf). */
  const viewBottom = open ? panelH : dockH;
  useEffect(() => {
    if (ready) send({ type: "view", top: hudH, bottom: viewBottom });
  }, [ready, hudH, viewBottom, send]);

  const openBuilding = useCallback(
    (key: string) => {
      setOpen(key);
      send({ type: "focus", key });
    },
    [send],
  );
  const closeBuilding = useCallback(() => {
    setOpen(null);
    setPanelH(0);
    send({ type: "focus", key: null });
  }, [send]);

  const onEvent = useCallback(
    (msg: Record<string, unknown>) => {
      if ((msg.type === "tap" || msg.type === "tapBuilding") && typeof msg.key === "string") {
        if (city?.buildings.some((b) => b.key === msg.key && b.stage > 0)) openBuilding(msg.key);
      } else if (msg.type === "tapEmpty") {
        if (open) closeBuilding();
      }
    },
    [city?.buildings, closeBuilding, open, openBuilding],
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (open) {
        closeBuilding();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [closeBuilding, open]);

  if (!auth.user) return <Redirect href="/giris" />;

  const at = id != null ? ids.indexOf(id) : -1;
  const prev = at > 0 ? ids[at - 1] : null;
  const next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : null;
  const go = (to: number | null) => {
    if (to == null) return;
    setOpen(null);
    setPanelH(0);
    setInfo(false);
    setId(to);
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace("/kulup-sehri-ziyaret"));
  const ap = view?.applause ?? null;
  const built = city?.buildings.filter((b) => b.stage > 0) ?? [];
  const selected = built.find((b) => b.key === open) ?? null;
  const place = at >= 0 && ids.length > 1 ? ` · ${at + 1}/${ids.length}` : "";

  const main = !city || !ap
    ? { label: "ZİYARET", icon: "airplane" as const, tone: "grey" as const, onPress: () => undefined, disabled: true }
    : city.mine
      ? { label: "SENİN ŞEHRİN", sub: "Başkaları onu böyle görür", icon: "person-circle" as const, tone: "grey" as const, onPress: () => undefined, disabled: true }
      : city.applauded_today || !ap.can
        ? { label: city.applauded_today ? "BUGÜN ALKIŞLADIN" : BLOCKED_TEXT[ap.blocked ?? ""] ?? "ŞU AN ALKIŞLANAMAZ", sub: `Bugün ${fmt(ap.left_today)} alkış hakkın kaldı`, icon: "checkmark-circle" as const, tone: "grey" as const, onPress: () => undefined, disabled: true }
        : {
            label: "ALKIŞLA",
            sub: `+${fmt(ap.rewards.visitor)} yıldız sana · +${fmt(ap.rewards.target)} ona`,
            icon: "hand-left" as const,
            tone: "gold" as const,
            onPress: () => applaud.mutate(city.user_id),
            busy: applaud.isPending,
            accessibilityLabel: `${city.name} adlı üyenin şehrini alkışla, ${ap.rewards.visitor} yıldız kazan`,
          };
  const dockLeft: DockTile[] = prev != null ? [{ key: "onceki", icon: "chevron-back", label: "Önceki", tone: "blue", onPress: () => go(prev) }] : [];
  const dockRight: DockTile[] = [
    { key: "bilgi", icon: "information", label: "Bilgi", tone: "purple", onPress: () => setInfo(true) },
    ...(next != null ? [{ key: "sonraki", icon: "chevron-forward" as const, label: "Sonraki", tone: "blue" as const, onPress: () => go(next) }] : []),
  ];

  return (
    <View style={styles.screen}>
      <View style={StyleSheet.absoluteFill}>
        <WebGame ref={scene} game="sehir" background={CITY_SKY} accessibilityLabel={city ? `${city.name} adlı üyenin şehri` : "Ziyaret edilen şehir"} onReady={() => setReady(true)} onEvent={onEvent} />
      </View>

      {/* Üst HUD */}
      <View style={styles.top} pointerEvents="box-none" onLayout={(e) => setHudH(e.nativeEvent.layout.height)}>
        <LinearGradient colors={CG.scrimTop} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[styles.topInner, { paddingTop: insets.top + space.xs }]} pointerEvents="box-none">
          {city ? (
            <VisitTopBar
              onBack={back}
              onHome={() => (open ? closeBuilding() : send({ type: "focus", key: null }))}
              onInfo={() => setInfo(true)}
              name={city.name}
              sub={([city.city, city.team_name].filter(Boolean).join(" · ") || "Kulüp Şehri") + place}
              crest={<CrestBadge crest={city.crest} size={36} onDark />}
              prestige={city.prestige.level > 0 ? <PrestigeStars count={city.prestige.level} size={11} /> : null}
              league={{ label: city.ladder.label, title: city.ladder.title, no: city.ladder.no }}
              stats={[
                { key: "beauty", icon: "sparkles", tint: CG.side.marks[0], value: fmt(city.beauty), label: "güzellik" },
                { key: "dev", icon: "trending-up", tint: CG.btn.green.fill[0], value: fmt(city.dev), label: "gelişim" },
                { key: "applause", icon: "hand-left", tint: CG.star, value: fmt(city.applause.total), label: "alkış" },
              ]}
            />
          ) : (
            <Touchable onPress={back} haptic="light" accessibilityRole="button" accessibilityLabel="Ziyaretten çık" style={styles.backOnly}>
              <Ionicons name="chevron-back" size={22} color={CG.white} />
            </Touchable>
          )}
        </View>
      </View>

      {/* Yükleniyor / kapalı / hata: sahnenin ortasında oyun penceresi */}
      {closed || missing ? (
        <View style={styles.center}>
          <WoodFrame ribbon={closed ? "Kapalı şehir" : "Bulunamadı"} style={styles.centerFrame}>
            <GameEmpty
              icon={closed ? "eye-off-outline" : "help-circle-outline"}
              title={closed ? "Bu şehir ziyarete kapalı" : "Şehir bulunamadı"}
              body={closed ? "Şehrin sahibi şehrini ziyarete kapatmış. Başka bir şehri gezebilirsin." : "Bu şehir artık görüntülenemiyor. Başka bir şehri gezebilirsin."}
              action={next != null ? { label: "Sonraki şehir", onPress: () => go(next) } : { label: "Listeye dön", onPress: back }}
            />
          </WoodFrame>
        </View>
      ) : query.isLoading ? (
        <View style={styles.center} pointerEvents="none">
          <View style={styles.loading}>
            <Text style={styles.loadingText} {...textScale.badge}>
              ŞEHRE UÇULUYOR…
            </Text>
          </View>
        </View>
      ) : query.isError || !city || !ap ? (
        <View style={styles.center}>
          <WoodFrame ribbon="Ziyaret" style={styles.centerFrame}>
            <GameError error={query.error} onRetry={() => query.refetch()} />
          </WoodFrame>
        </View>
      ) : null}

      {/* Alt raf */}
      {!open ? (
        <View style={styles.bottom} pointerEvents="box-none" onLayout={(e) => setDockH(e.nativeEvent.layout.height)}>
          <CityDock left={dockLeft} right={dockRight} main={main} bottomInset={insets.bottom} />
        </View>
      ) : null}

      {/* Salt okunur bina paneli */}
      {selected && city ? <VisitBuildingPanel b={selected} owner={city.name} bottomInset={insets.bottom} onClose={closeBuilding} onHeight={setPanelH} /> : null}

      {/* Şehir bilgisi */}
      <GameModal visible={info && Boolean(city)} onClose={() => setInfo(false)} title={city?.name ?? "Şehir"}>
        {city ? (
          <>
            <View style={styles.infoHead}>
              <CrestBadge crest={city.crest} size={52} />
              <View style={styles.flex}>
                <Text style={styles.infoTitle} numberOfLines={1} {...textScale.dense}>
                  {city.ladder.title}
                </Text>
                <Text style={styles.infoSub} numberOfLines={2} {...textScale.dense}>
                  {[`Lig ${city.ladder.no}`, city.prestige.level > 0 ? `${city.prestige.level}. prestij` : null, city.city, city.team_name].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </View>
            <GameStatBar
              items={[
                { key: "beauty", icon: "sparkles", tint: CG.side.marks[0], value: fmt(city.beauty), label: "güzellik" },
                { key: "dev", icon: "trending-up", tint: CG.btn.green.fill[0], value: fmt(city.dev), label: "gelişim" },
                { key: "applause", icon: "hand-left", tint: CG.star, value: fmt(city.applause.total), label: "alkış" },
              ]}
            />
            {city.mine ? <PaperRow icon="person-circle" tint={CP.textSecondary} title="Bu senin şehrin" sub="Başkaları onu böyle görür." /> : null}
            {ap && !city.mine ? <PaperText center>{`Bugün ${fmt(ap.left_today)} alkış hakkın kaldı · şehrin sahibi alkış başına ${fmt(ap.rewards.target)} yıldız alır.`}</PaperText> : null}
            {city.crest.badges.length ? (
              <>
                <PaperHead title="Sezon rozetleri" meta={`${city.crest.badges.length} sezon`} />
                <View style={styles.badges}>
                  {city.crest.badges.map((b) => (
                    <View key={b.key} style={styles.badge}>
                      <TierMedal tier={b.tier} size={40} icon="ribbon" />
                      <Text style={styles.badgeText} numberOfLines={2} {...textScale.dense}>
                        {b.title}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            {built.length ? (
              <>
                <PaperHead title="Binalar" meta={`${built.length} bina · ${city.landmarks.length} sembol yapı`} />
                {built.map((b) => (
                  <Touchable
                    key={b.key}
                    onPress={() => {
                      setInfo(false);
                      openBuilding(b.key);
                    }}
                    haptic="selection"
                    accessibilityRole="button"
                    accessibilityLabel={`${b.title}, ${b.stage}. aşama. Şehirde göster`}
                  >
                    <View style={styles.bRow}>
                      <BuildingIcon buildingKey={b.key} icon={b.icon} size={38} stage={b.stage} />
                      <View style={styles.flex}>
                        <Text style={styles.bTitle} numberOfLines={1} {...textScale.dense}>
                          {b.title}
                        </Text>
                        <Text style={styles.bSub} numberOfLines={1} {...textScale.dense}>
                          {b.current?.title ?? `${b.stage}. aşama`}
                        </Text>
                      </View>
                      <Ionicons name="locate" size={18} color={CP.textTertiary} />
                    </View>
                  </Touchable>
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </GameModal>
    </View>
  );
}

/** Ziyarette binaya dokununca alttan açılan salt okunur oyun paneli. */
function VisitBuildingPanel({ b, owner, bottomInset, onClose, onHeight }: { b: PublicBuilding; owner: string; bottomInset: number; onClose: () => void; onHeight: (h: number) => void }) {
  const max = Math.max(1, b.max);
  return (
    <View style={[styles.panel, { paddingBottom: bottomInset + space.sm }]} onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
      <WoodFrame ribbon={b.title} onClose={onClose} innerStyle={styles.panelInner}>
        <View style={styles.panelHead}>
          <BuildingIcon buildingKey={b.key} icon={b.icon} size={56} stage={b.stage} />
          <View style={styles.flex}>
            <Text style={styles.panelTitle} numberOfLines={2} {...textScale.dense}>
              {b.current?.title ?? `${b.stage}. aşama`}
            </Text>
            <Text style={styles.panelSub} numberOfLines={1} {...textScale.dense}>
              {`${b.stage}/${max}. aşama · ${owner}`}
            </Text>
          </View>
        </View>
        <GameBar value={b.stage / max} tone={b.stage >= max ? "gold" : "green"} label={b.stage >= max ? "EN ÜST AŞAMA" : `${b.stage} / ${max} AŞAMA`} />
        <View style={styles.panelNote}>
          <Ionicons name="eye" size={14} color={CP.textTertiary} />
          <Text style={styles.panelNoteText} {...textScale.long}>
            Ziyaretteki şehir salt okunurdur; kendi binalarını şehrinde yükseltirsin.
          </Text>
        </View>
        <GlossyButton label="KAPAT" icon="close" tone="blue" small onPress={onClose} />
      </WoodFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CITY_SKY },
  flex: { flex: 1 },
  top: { position: "absolute", top: 0, left: 0, right: 0 },
  topInner: { paddingHorizontal: layout.screenPadding, paddingBottom: space.md },
  backOnly: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: CG.inkShadow, borderWidth: 2, borderColor: CG.white },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: space.xl },
  centerFrame: { alignSelf: "stretch", flexShrink: 0 },
  loading: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill, backgroundColor: CG.dim, borderWidth: 2, borderColor: CG.white },
  loadingText: { ...type.label, fontFamily: fonts.bold, color: CG.white, letterSpacing: 1 },

  panel: { position: "absolute", left: space.sm, right: space.sm, bottom: 0 },
  panelInner: { paddingTop: space.xl, paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm },
  panelHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  panelTitle: { ...type.h3, fontFamily: fonts.bold, color: CP.textPrimary },
  panelSub: { ...type.caption, fontFamily: fonts.semibold, color: CP.textTertiary },
  panelNote: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
  panelNoteText: { ...type.caption, color: CP.textTertiary, flex: 1 },

  infoHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  infoTitle: { ...type.h3, fontFamily: fonts.bold, color: CP.textPrimary },
  infoSub: { ...type.caption, color: CP.textTertiary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  badge: { width: "30%", flexGrow: 1, alignItems: "center", gap: 4, padding: space.sm, borderRadius: radius.lg, backgroundColor: CP.surface2 },
  badgeText: { ...type.caption, fontFamily: fonts.bold, color: CP.textPrimary, textAlign: "center" },
  bRow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, borderRadius: radius.lg, backgroundColor: CG.paperRow },
  bTitle: { ...type.labelSm, fontFamily: fonts.bold, color: CP.textPrimary },
  bSub: { ...type.caption, color: CP.textTertiary },
});
