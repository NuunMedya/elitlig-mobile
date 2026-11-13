/**
 * KULÜP ŞEHRİ 2.0 — /kulup-sehri
 *
 * Bütün oyunlardan, gerçek maçlardan, görevlerden ve günlük girişten gelen
 * yıldızlarla kurulan futbol şehri. Mahalle arası toptan Şampiyonlar Ligi
 * şampiyonluğuna 18 basamaklı bir KARİYER MERDİVENİ (16. basamak iki alt
 * adım: 19 kademe).
 *
 * EKRAN:
 *   · Üstte canlı şehir (games/sehir.js, WebView; `type:"city2"` mesajı):
 *     binaya dokununca binanın penceresi açılır; sembol yapı yerleştirirken
 *     sahne boş yuvaları vurgular, dokunulan yuva sunucuya yazılır.
 *   · Merdiven kartı: şu anki basamak, sıradakinin koşulları (gelişim puanı,
 *     bina aşamaları, gerçek hayat kilidi) ve koşullar tamamsa "Basamak atla".
 *   · Binalar: her binanın aşaması ve sıradaki eylemi (iç kilit / aşama).
 *   · Sembol yapılar: güzellik puanı, mağaza, depo ve yerleşim.
 *   · Elit Lira (Faz 2): EL kasası (bakiye, NET gelir, depolar, "Topla"),
 *     gerçek hayat form çarpanı, EL geçmişi. Eski sunucuda (el yok) gizli.
 *   · Günlük ödül ve yıldız cüzdanı (Ekonomi A).
 *   · Faz 5: sezon kartı (puan, kalan süre, tahmini dilim → /kulup-sehri-sezon),
 *     takım tesisi kartı (→ /kulup-sehri-takim; takımı olmayan üyede yok),
 *     "Şehirleri gez" (→ /kulup-sehri-ziyaret), sahnede arma (sezon çerçevesi +
 *     prestij yıldızları) ve sezon sonu kutlaması (bir kez). Eski sunucuda
 *     (alanlar yok) hiçbiri çizilmez.
 *
 * Kurallar, adlar ve maliyetler sunucudadır (elitlig-server services/city2).
 * Sunucu /city2'yi tanımıyorsa (404) eski şehir ekranı (components/city/CityV1)
 * açılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActionSheet, useAdminMutation } from "@/components/admin";
import { CityV1Screen } from "@/components/city/CityV1";
import { DailyRewardEntry } from "@/components/city/DailyReward";
import { MatchStarsSheet } from "@/components/city/MatchStars";
import { HowSheet, StarWallet, type WalletStars } from "@/components/city/StarWallet";
import { XpTransferBanner } from "@/components/city/XpTransferBanner";
import { AcademyCityCard } from "@/components/city2/Academy";
import { BuildingRow, BuildingSheet } from "@/components/city2/Building";
import { ElHistorySheet, ElHowSheet, ElWallet, FormCard } from "@/components/city2/ElitLira";
import { LandmarkSheet, type LandmarkTab, type Placing } from "@/components/city2/Landmarks";
import { MigrationNotice, StepCelebration, type StepResult } from "@/components/city2/Notices";
import { BuildingIcon, LandmarkIcon, SectionTitle, cardStyle, fmt } from "@/components/city2/shared";
import { CrestChip, SeasonCard, SeasonEndSheet } from "@/components/city2/Season";
import { StepCard } from "@/components/city2/StepCard";
import { TeamCityCard } from "@/components/city2/Team";
import { VisitEntryCard } from "@/components/city2/Visit";
import { WebGame, type WebGameHandle } from "@/components/game/WebGame";
import { BottomSheet, Button, ErrorState, ScreenHeader, SkeletonCard, Touchable, refreshControlProps, useRefresh, useToast } from "@/components/ui";
import { collectCityStars } from "@/lib/puzzle/api";
import { buildingMark, incomeOf, rungLabel, type City2CollectResult, type City2OwnedLandmark, type City2State } from "@/lib/puzzle/city2";
import { CITY_KIT_KEY, CITY_SKY, CLUB_KITS, type ClubKit } from "@/lib/puzzle/cityPalette";
import { useCity2, useCity2Actions } from "@/lib/puzzle/useCity2";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

export default function ClubCityScreen() {
  const auth = useAuth();
  const { query, city2, legacy } = useCity2();
  if (!auth.user) return <Redirect href="/giris" />;
  if (legacy) return <CityV1Screen />;
  return <City2Screen query={query} city2={city2} />;
}

function walletStars(c: City2State): WalletStars {
  const s = c.stars.sources;
  return { ...s, available: c.stars.available, total: c.stars.earned, refund: c.stars.refund };
}

function City2Screen({ query, city2 }: { query: ReturnType<typeof useCity2>["query"]; city2: City2State | undefined }) {
  const router = useRouter();
  const toast = useToast();
  const { height } = useWindowDimensions();
  const scene = useRef<WebGameHandle>(null);
  const scroll = useRef<ScrollView>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [kit, setKit] = useState<ClubKit>(CLUB_KITS[0]);
  const [kitSheet, setKitSheet] = useState(false);
  const [howSheet, setHowSheet] = useState(false);
  const [matchSheet, setMatchSheet] = useState(false);
  const [marksSheet, setMarksSheet] = useState(false);
  const [marksTab, setMarksTab] = useState<LandmarkTab>("shop");
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [picked, setPicked] = useState<City2OwnedLandmark | null>(null);
  const [stepResult, setStepResult] = useState<StepResult | null>(null);
  const [elHistory, setElHistory] = useState(false);
  const [elHow, setElHow] = useState(false);
  const [collected, setCollected] = useState<{ res: City2CollectResult; key: number } | null>(null);
  const slotsBefore = useRef(0);
  const params = useLocalSearchParams<{ bina?: string }>();

  /* Merdivenden gelen "bu binayı aç" isteği (?bina=halisaha). */
  useEffect(() => {
    if (typeof params.bina === "string" && params.bina) setOpen(params.bina);
  }, [params.bina]);

  useEffect(() => {
    AsyncStorage.getItem(CITY_KIT_KEY)
      .then((value) => {
        const found = CLUB_KITS.find((k) => k.key === value);
        if (found) setKit(found);
      })
      .catch(() => undefined);
  }, []);

  const actions = useCity2Actions({
    onLock: (key) => scene.current?.send({ type: "focus", key }),
    onStage: (key) => {
      scene.current?.send({ type: "focus", key });
      scene.current?.send({ type: "build", key });
    },
    onStep: (res) => {
      scene.current?.send({ type: "celebrate" });
      setStepResult({ step: res.step, via: res.via, slotsBefore: slotsBefore.current });
    },
    onLandmark: (res) => {
      // Yeni alınan yapı doğrudan yerleştirmeye hazır: depo sekmesine geç.
      setMarksTab("depot");
      void res;
    },
    onPlace: () => {
      setPlacing(null);
    },
    onCollect: (res) => {
      if (res.collected > 0) setCollected((c) => ({ res, key: (c?.key ?? 0) + 1 }));
    },
  });
  const collect = useAdminMutation(() => collectCityStars(), {
    success: (res) => `${fmt(res.stars)} yıldız havuzuna eklendi (${fmt(res.xp)} XP)`,
    onSuccess: () => void query.refetch(),
  });

  /* Sahneye şehrin durumu. */
  const message = useMemo(() => {
    if (!city2) return null;
    const tierOf = new Map(city2.landmarks.catalogue.map((c) => [c.key, c.tier]));
    const marks: Record<string, string> = {};
    for (const b of city2.buildings) {
      const m = buildingMark(b, city2.stars.available);
      if (m) marks[b.key] = m;
    }
    return {
      type: "city2" as const,
      buildings: Object.fromEntries(city2.buildings.map((b) => [b.key, b.stage])),
      rung: city2.ladder.rung,
      kit: { primary: kit.primary, secondary: kit.secondary },
      marks,
      landmarks: city2.landmarks.owned
        .filter((l): l is City2OwnedLandmark & { slot: string } => Boolean(l.slot))
        .map((l) => ({ id: l.id, key: l.key, slot: l.slot, tier: tierOf.get(l.key) ?? "sus" })),
      grid: { cols: city2.landmarks.grid.cols, rows: city2.landmarks.grid.rows, open_rows: city2.landmarks.grid.open_rows },
      place: placing ? { key: placing.key } : null,
    };
  }, [city2, kit, placing]);
  useEffect(() => {
    if (ready && message) scene.current?.send(message);
  }, [ready, message]);

  const placeAt = useCallback(
    (slot: string, id: string | null) => {
      if (!city2) return;
      if (placing) {
        if (id && id !== placing.id) {
          toast.show({ message: "Bu yuva dolu; boş bir yuva seç.", tone: "warn" });
          return;
        }
        if (id && id === placing.id) {
          setPlacing(null);
          return;
        }
        actions.place.mutate(placing.id ? { id: placing.id, slot } : { key: placing.key, slot }, {
          onSuccess: () => setMarksSheet(false),
        });
        return;
      }
      if (id) {
        const l = city2.landmarks.owned.find((x) => x.id === id);
        if (l) setPicked(l);
      }
    },
    [actions.place, city2, placing, toast],
  );

  const onEvent = useCallback(
    (msg: Record<string, unknown>) => {
      if (msg.type === "tap" && typeof msg.key === "string") {
        if (!placing) setOpen(msg.key);
      } else if (msg.type === "slot" && typeof msg.slot === "string") {
        placeAt(msg.slot, typeof msg.id === "string" ? msg.id : null);
      }
    },
    [placeAt, placing],
  );

  const startPlacing = (l: City2OwnedLandmark) => {
    setPlacing({ id: l.id, key: l.key, title: l.title });
    setMarksSheet(false);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const chooseKit = (next: ClubKit) => {
    setKit(next);
    void AsyncStorage.setItem(CITY_KIT_KEY, next.key).catch(() => undefined);
    setKitSheet(false);
  };

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const selected = city2?.buildings.find((b) => b.key === open) ?? null;
  const sceneHeight = Math.max(260, Math.min(440, height * 0.44));
  const ladder = city2?.ladder ?? null;
  const openBuildings = city2?.buildings.filter((b) => b.open) ?? [];
  const closedBuildings = city2?.buildings.filter((b) => !b.open) ?? [];
  const unplaced = city2?.landmarks.owned.filter((l) => !l.slot) ?? [];
  const placedCount = (city2?.landmarks.owned.length ?? 0) - unplaced.length;
  const incomeBonus = useMemo(() => {
    const inc = (city2?.buildings ?? []).map((b) => incomeOf(b)).find(Boolean);
    return inc ? { prestige: inc.prestige_pct ?? 0, team: inc.team_pct ?? 0 } : null;
  }, [city2?.buildings]);
  const titles = useMemo(() => Object.fromEntries((city2?.buildings ?? []).map((b) => [b.key, b.title])), [city2?.buildings]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Kulüp Şehrin"
        subtitle={ladder ? `${ladder.current.label}. basamak · ${ladder.current.title}` : "Yıldızlarınla futbol şehrini kur"}
        back
        actions={[
          { icon: "color-palette-outline", onPress: () => setKitSheet(true), accessibilityLabel: "Kulüp renkleri" },
          { icon: "trending-up-outline", onPress: () => router.push("/kulup-sehri-merdiven"), accessibilityLabel: "Kariyer merdiveni" },
          { icon: "podium-outline", onPress: () => router.push("/kulup-sehri-siralama"), accessibilityLabel: "Şehir sıralaması" },
        ]}
      />
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
      >
        <View style={[styles.scene, { height: sceneHeight }]}>
          <WebGame ref={scene} game="sehir" background={CITY_SKY} accessibilityLabel="Kulüp şehri" onReady={() => setReady(true)} onEvent={onEvent} />
          {city2 ? (
            <View style={styles.sceneBadges} pointerEvents="none">
              {city2.crest && (city2.crest.frame || city2.crest.prestige_stars > 0) ? (
                <CrestChip crest={city2.crest} />
              ) : null}
              <View style={styles.sceneBadge}>
                <Ionicons name="star" size={13} color={colors.yellowCard} />
                <Text style={styles.sceneBadgeText} {...textScale.badge}>
                  {fmt(city2.stars.available)}
                </Text>
              </View>
              <View style={styles.sceneBadge}>
                <Ionicons name="sparkles" size={13} color={colors.onDark} />
                <Text style={styles.sceneBadgeText} {...textScale.badge}>
                  {fmt(city2.beauty)}
                </Text>
              </View>
            </View>
          ) : null}
          {city2?.academy?.offers.length ? (
            <Touchable
              feedback="chip"
              onPress={() => router.push("/kulup-sehri-akademi")}
              style={styles.sceneOffer}
              accessibilityRole="button"
              accessibilityLabel={`${city2.academy.offers.length} bekleyen transfer teklifi`}
            >
              <Ionicons name="mail-unread" size={13} color={colors.textOnBrand} />
              <Text style={styles.sceneBadgeText} {...textScale.badge}>
                {city2.academy.offers.length} teklif
              </Text>
            </Touchable>
          ) : null}
          <Touchable onPress={() => scene.current?.send({ type: "focus", key: null })} style={styles.sceneHome} accessibilityRole="button" accessibilityLabel="Bütün şehri göster">
            <Ionicons name="scan-outline" size={18} color={colors.onDark} />
          </Touchable>
          {placing ? (
            <View style={styles.placeBar}>
              <Ionicons name="location" size={16} color={colors.onDark} />
              <Text style={styles.placeText} numberOfLines={2} {...textScale.dense}>
                {placing.title}: meydanda boş bir yuvaya dokun
              </Text>
              <Touchable
                feedback="chip"
                onPress={() => {
                  setMarksTab("grid");
                  setMarksSheet(true);
                }}
                style={styles.placeBtn}
                accessibilityRole="button"
                accessibilityLabel="Izgaradan yuva seç"
              >
                <Ionicons name="grid-outline" size={14} color={colors.onDark} />
                <Text style={styles.placeBtnText} {...textScale.badge}>
                  Izgara
                </Text>
              </Touchable>
              <Touchable feedback="icon" onPress={() => setPlacing(null)} hitSlop={8} style={styles.placeClose} accessibilityRole="button" accessibilityLabel="Yerleştirmeyi bırak">
                <Ionicons name="close" size={18} color={colors.onDark} />
              </Touchable>
            </View>
          ) : null}
        </View>

        {query.isLoading ? (
          <SkeletonCard lines={5} />
        ) : query.isError || !city2 || !ladder ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <XpTransferBanner transfer={city2.stars.xp.transfer} perStar={city2.stars.xp.per_star} />
            <StepCard
              ladder={ladder}
              buildings={city2.buildings}
              busy={actions.step.isPending}
              onAdvance={(pay) => {
                slotsBefore.current = city2.landmarks.grid.open_slots;
                actions.step.mutate(pay);
              }}
              onLadder={() => router.push("/kulup-sehri-merdiven")}
              onBuilding={(key) => {
                setOpen(key);
                scene.current?.send({ type: "focus", key });
              }}
            />
            {city2.season ? (
              <SeasonCard season={city2.season} crest={city2.crest} onPress={() => router.push("/kulup-sehri-sezon")} />
            ) : null}
            {city2.el ? (
              <>
                <SectionTitle title="Elit Lira" meta="kulübünün işletme geliri" />
                <ElWallet
                  el={city2.el}
                  buildings={city2.buildings}
                  collecting={actions.collect.isPending && actions.collect.variables == null}
                  result={collected?.res ?? null}
                  burstKey={collected?.key ?? 0}
                  onCollect={() => actions.collect.mutate(null)}
                  onHistory={() => setElHistory(true)}
                  onHow={() => setElHow(true)}
                  onBuilding={(key) => {
                    setOpen(key);
                    scene.current?.send({ type: "focus", key });
                  }}
                />
                <FormCard form={city2.el.form} />
              </>
            ) : null}
            {city2.academy ? (
              <>
                <SectionTitle title="Altyapı" meta="oyuncu yetiştir, transferden EL kazan" />
                <AcademyCityCard academy={city2.academy} onPress={() => router.push("/kulup-sehri-akademi")} />
              </>
            ) : null}
            {city2.team?.team || city2.visit ? (
              <>
                <SectionTitle title="Takım ve ziyaret" meta="takımınla tesis kur, şehirleri gez" />
                {city2.team?.team ? <TeamCityCard team={city2.team.team} onPress={() => router.push("/kulup-sehri-takim")} /> : null}
                {city2.visit ? <VisitEntryCard visit={city2.visit} onPress={() => router.push("/kulup-sehri-ziyaret")} /> : null}
              </>
            ) : null}
            <DailyRewardEntry />

            <SectionTitle title="Binalar" meta={`${fmt(city2.stages_built)} aşama · ${fmt(city2.dev)} gelişim puanı`} />
            {openBuildings.map((b) => (
              <BuildingRow
                key={b.key}
                b={b}
                ladder={ladder}
                available={city2.stars.available}
                onPress={() => {
                  setOpen(b.key);
                  scene.current?.send({ type: "focus", key: b.key });
                }}
              />
            ))}
            {closedBuildings.length ? (
              <View style={styles.closed}>
                <Text style={styles.closedTitle} {...textScale.badge}>
                  MERDİVENDE AÇILACAKLAR
                </Text>
                {closedBuildings.map((b) => (
                  <Touchable key={b.key} onPress={() => setOpen(b.key)} feedback="row" style={styles.closedRow} accessibilityRole="button" accessibilityLabel={`${b.title}, ${rungLabel(ladder, b.opens)}. basamakta açılır`}>
                    <BuildingIcon buildingKey={b.key} icon={b.icon} size={30} off />
                    <Text style={styles.closedName} numberOfLines={1} {...textScale.dense}>
                      {b.title}
                    </Text>
                    <Ionicons name="lock-closed" size={12} color={colors.textTertiary} />
                    <Text style={styles.closedRung} {...textScale.badge}>
                      {rungLabel(ladder, b.opens)}. basamak
                    </Text>
                  </Touchable>
                ))}
              </View>
            ) : null}

            <SectionTitle title="Sembol yapılar" meta={`${fmt(city2.beauty)} güzellik puanı`} />
            <View style={styles.marks}>
              <View style={styles.marksRow}>
                {(city2.landmarks.owned.length ? city2.landmarks.owned.slice(0, 5) : city2.landmarks.catalogue.filter((c) => c.buyable).slice(0, 5)).map((l) => (
                  <LandmarkIcon
                    key={"id" in l ? l.id : l.key}
                    landmarkKey={l.key}
                    tier={city2.landmarks.catalogue.find((c) => c.key === l.key)?.tier ?? "sus"}
                    size={36}
                  />
                ))}
                <View style={styles.marksTexts}>
                  <Text style={styles.marksLine} {...textScale.dense}>
                    {placedCount} şehirde · {unplaced.length} depoda
                  </Text>
                  <Text style={styles.marksSub} {...textScale.dense}>
                    {city2.landmarks.grid.open_slots - Object.keys(city2.landmarks.grid.taken).length} boş yuva
                  </Text>
                </View>
              </View>
              <View style={styles.marksButtons}>
                <Button
                  label="Mağaza"
                  icon="storefront-outline"
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setMarksTab("shop");
                    setMarksSheet(true);
                  }}
                  style={styles.flex}
                />
                <Button
                  label={unplaced.length ? `Yerleştir · ${unplaced.length}` : "Yerleşim"}
                  icon="location-outline"
                  variant={unplaced.length ? "primary" : "secondary"}
                  size="sm"
                  onPress={() => {
                    setMarksTab(unplaced.length ? "depot" : "grid");
                    setMarksSheet(true);
                  }}
                  style={styles.flex}
                />
              </View>
            </View>

            <SectionTitle title="Yıldızların" />
            <StarWallet
              stars={walletStars(city2)}
              xp={city2.stars.xp}
              collecting={collect.isPending}
              onCollect={() => collect.mutate(undefined)}
              onHow={() => setHowSheet(true)}
              onMatch={() => setMatchSheet(true)}
            />
          </>
        )}
      </ScrollView>

      <BuildingSheet
        b={selected}
        ladder={ladder}
        available={city2?.stars.available ?? 0}
        busy={actions.busy}
        onClose={() => setOpen(null)}
        onLock={(building, lock) => actions.lock.mutate({ building, lock })}
        onStage={(building) => actions.stage.mutate(building)}
        el={city2?.el ?? null}
        titles={titles}
        collecting={actions.collect.isPending && actions.collect.variables === selected?.key}
        onCollect={(building) => actions.collect.mutate(building)}
        onUpgrade={(building, kind) => actions.upgrade.mutate({ building, kind })}
        academy={city2?.academy}
        onAcademy={() => {
          setOpen(null);
          router.push("/kulup-sehri-akademi");
        }}
      />
      <ElHistorySheet visible={elHistory} onClose={() => setElHistory(false)} el={city2?.el ?? null} />
      <ElHowSheet visible={elHow} onClose={() => setElHow(false)} el={city2?.el ?? null} bonus={incomeBonus} />
      <LandmarkSheet
        visible={marksSheet}
        onClose={() => setMarksSheet(false)}
        tab={marksTab}
        onTab={setMarksTab}
        landmarks={city2?.landmarks ?? null}
        ladder={ladder}
        beauty={city2?.beauty ?? 0}
        available={city2?.stars.available ?? 0}
        busy={actions.busy}
        placing={placing}
        onBuy={(key) => actions.landmark.mutate(key)}
        onPlace={startPlacing}
        onStore={(l) => actions.place.mutate({ id: l.id, slot: null })}
        onSlot={placeAt}
        onCancelPlacing={() => setPlacing(null)}
      />
      <ActionSheet
        visible={Boolean(picked)}
        onClose={() => setPicked(null)}
        title={picked?.title}
        actions={
          picked
            ? [
                { label: "Taşı", hint: "Başka bir boş yuvaya koy", icon: "move", onPress: () => startPlacing(picked) },
                { label: "Depoya kaldır", hint: "Güzellik puanından düşer; istediğinde yeniden yerleştir", icon: "archive-outline", onPress: () => actions.place.mutate({ id: picked.id, slot: null }) },
              ]
            : []
        }
      />
      <MigrationNotice city2={city2} />
      <SeasonEndSheet
        city2={city2}
        onPlace={() => {
          setMarksTab("depot");
          setMarksSheet(true);
        }}
      />
      <StepCelebration result={stepResult} city2={city2} onClose={() => setStepResult(null)} />
      <BottomSheet visible={kitSheet} onClose={() => setKitSheet(false)} title="Kulüp renkleri" snap="half">
        <Text style={styles.sheetLead} {...textScale.long}>
          Formalar, çatılar, bayraklar ve tabelalar bu renklerle boyanır.
        </Text>
        <View style={styles.kits}>
          {CLUB_KITS.map((k) => (
            <Touchable key={k.key} onPress={() => chooseKit(k)} style={[styles.kit, k.key === kit.key ? styles.kitOn : null]} accessibilityRole="button" accessibilityLabel={k.name}>
              <View style={styles.kitSwatch}>
                <View style={[styles.kitHalf, { backgroundColor: k.primary }]} />
                <View style={[styles.kitHalf, { backgroundColor: k.secondary }]} />
              </View>
              <Text style={styles.kitName} numberOfLines={1} {...textScale.dense}>
                {k.name}
              </Text>
            </Touchable>
          ))}
        </View>
      </BottomSheet>
      <MatchStarsSheet visible={matchSheet} onClose={() => setMatchSheet(false)} detail={city2?.stars.sources.match_detail} total={city2?.stars.sources.match ?? 0} />
      <HowSheet
        visible={howSheet}
        onClose={() => setHowSheet(false)}
        stars={city2 ? walletStars(city2) : undefined}
        xp={city2?.stars.xp}
        onGames={() => router.push("/(tabs)/oyunlar")}
        onQuests={() => router.push("/gorevler")}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant * 2, gap: space.md, paddingTop: space.xs },
  flex: { flex: 1 },
  scene: { borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.inkBlock, borderWidth: hairline, borderColor: colors.inkTileBorder },
  sceneBadges: { position: "absolute", top: space.sm, left: space.sm, flexDirection: "row", gap: space.xs },
  sceneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    backgroundColor: colors.overlay,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
  },
  sceneBadgeText: { ...type.label, fontFamily: fonts.bold, color: colors.onDark },
  sceneOffer: {
    position: "absolute",
    top: space.sm + 34,
    left: space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    backgroundColor: colors.brandAccent,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
  },
  sceneHome: {
    position: "absolute",
    top: space.sm,
    right: space.sm,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay,
  },
  placeBar: {
    position: "absolute",
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingLeft: space.md,
    paddingRight: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.overlay,
  },
  placeText: { ...type.labelSm, color: colors.onDark, flex: 1 },
  placeBtn: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.sm, height: 30, borderRadius: radius.pill, borderWidth: hairline, borderColor: colors.borderOnDark },
  placeBtnText: { ...type.labelXs, color: colors.onDark },
  placeClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },

  closed: { ...cardStyle, padding: space.md, gap: space.xs },
  closedTitle: { ...type.overline, color: colors.textTertiary, marginBottom: space.xxs },
  closedRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 38, borderRadius: radius.md },
  closedName: { ...type.bodySm, fontFamily: fonts.semibold, color: colors.textSecondary, flex: 1 },
  closedRung: { ...type.caption, color: colors.textTertiary },

  marks: { ...cardStyle, padding: space.md, gap: space.md },
  marksRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  marksTexts: { flex: 1, marginLeft: space.xs, gap: 2 },
  marksLine: { ...type.labelSm, color: colors.textPrimary },
  marksSub: { ...type.caption, color: colors.textTertiary },
  marksButtons: { flexDirection: "row", gap: space.sm },

  sheetLead: { ...type.body, color: colors.textSecondary },
  kits: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  kit: { width: "47%", flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.lg, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1 },
  kitOn: { borderColor: colors.brandAccent, backgroundColor: colors.brandDim },
  kitSwatch: { width: 30, height: 30, borderRadius: radius.pill, overflow: "hidden", flexDirection: "row", borderWidth: hairline, borderColor: colors.border },
  kitHalf: { flex: 1 },
  kitName: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
});
