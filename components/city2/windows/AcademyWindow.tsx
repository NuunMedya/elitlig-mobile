/**
 * ALTYAPI AKADEMİSİ PENCERESİ (Kulüp Şehri 2.0 · Faz 3) — şehrin üstünde katman
 * olarak ve /kulup-sehri-akademi rotasında aynı oyun penceresiyle açılır
 * (game/CityWindow, game/CityNav).
 *
 * Akademinin bütün durumu GET /api/puzzle/city2 → `city2.academy` içinden
 * gelir (ayrı istek yok); yazmalar (teklif kabul/ret, serbest bırak, A takım,
 * satış listesi) yeni `city2` döndürür ve önbelleğe yazılır.
 *
 *   · Üst kart: aşama, kadro yuvası, yeni oyuncu sayacı, transfer geliri.
 *   · Teklifler: NPC kulüplerinin (kurmaca) teklifleri, geri sayım; kabul
 *     onay ister, sonra kutlama + EL sayacı. Günlük satış hakkı gösterilir.
 *   · Kadro: oyuncunun adı SUNUCUNUN verdiği gibi (Minik/Genç/Ad Soyad/
 *     Tecrübeli), yaş, mevki, güç/potansiyel, değer, sakatlık, gelişim yönü.
 *   · A takım, bina etkileri (akademi/üniversite/sağlık/scout), geçmiş.
 *   · Bilgi penceresi: kurallar ve "Altyapı oyunlarında adım kullanılmasın".
 *
 * Elit Lira yalnız oyun içi paradır.
 *
 * ESKİ SUNUCU: `academy` alanı yoksa "yakında"; `academy: null` ise akademi
 * kurulmamıştır → ne yapacağı anlatılır ve binaya gidilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  AcademyBuildingSection,
  AcademyHero,
  AcademyInfoSheet,
  EffectsCard,
  HistoryCard,
  OfferCard,
  PlayerCard,
  PlayerSheet,
  TransferCelebration,
  useNow,
} from "@/components/city2/Academy";
import { SectionTitle, cardStyle } from "@/components/city2/shared";
import { CityWindow } from "@/components/city2/game/CityWindow";
import { useCityNav } from "@/components/city2/game/CityNav";
import { refreshControlProps, useRefresh } from "@/components/ui";
import type { City2AcceptResult } from "@/lib/puzzle/city2";
import { useAcademyActions, useCity2, usePrivacyPreferences } from "@/lib/puzzle/useCity2";
import { useAuth } from "@/providers/AuthProvider";
import { layout, space, textScale, type } from "@/theme";
import { CP } from "@/lib/puzzle/cityGamePalette";
import { GameButton, GameEmpty, GameError, GameLoading } from "@/components/city2/game/GamePaper";

type Celebration = City2AcceptResult & { clubName: string | null; playerName: string | null };

export function AcademyWindow() {
  const auth = useAuth();
  const nav = useCityNav();
  const params = nav.params as { oyuncu?: string; bilgi?: string };
  const { query, city2, legacy } = useCity2();
  const academy = city2?.academy ?? null;
  const now = useNow(30_000);
  const scroll = useRef<ScrollView>(null);
  const offersY = useRef(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const privacy = usePrivacyPreferences(info);
  const pendingAccept = useRef<{ clubName: string | null; playerName: string | null }>({ clubName: null, playerName: null });

  useEffect(() => {
    if (typeof params.oyuncu === "string" && params.oyuncu) setOpenId(params.oyuncu);
    if (params.bilgi === "1") setInfo(true);
  }, [params.oyuncu, params.bilgi]);

  const actions = useAcademyActions({
    onAccept: (res) => {
      setOpenId(null);
      setCelebration({ ...res, ...pendingAccept.current });
    },
    onDone: (kind) => {
      if (kind === "release" || kind === "promote") setOpenId(null);
    },
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  if (!auth.user) return <Redirect href="/giris" />;

  const all = academy ? [...academy.squad, ...academy.a_team.players] : [];
  const selected = all.find((p) => p.id === openId) ?? null;
  const unsupported = legacy || (city2 != null && city2.academy === undefined);
  const scrollToOffers = () => scroll.current?.scrollTo({ y: Math.max(0, offersY.current - space.md), animated: true });

  return (
    <CityWindow
        title="Akademi"
        subtitle={academy ? `${academy.stage}. aşama · ${academy.slots.used}/${academy.slots.max} oyuncu` : "Kulüp Şehri"}
        actions={
          academy
            ? [
                { icon: "information-circle-outline", onPress: () => setInfo(true), accessibilityLabel: "Akademi nasıl işler" },
                { icon: "podium-outline", onPress: () => nav.open("siralama", { tab: "transfer" }), accessibilityLabel: "Transfer sıralaması" },
              ]
            : undefined
        }
      >
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
      >
        {query.isLoading ? (
          <GameLoading lines={6} />
        ) : unsupported ? (
          <GameEmpty icon="school-outline" title="Altyapı akademisi yakında" body="Akademi, oyuncu gelişimi ve transferler sunucu güncellemesiyle açılacak." variant="inline" action={{ label: "Şehre dön", onPress: nav.close, haptic: "light" }} />
        ) : query.isError || !city2 ? (
          <GameError error={query.error} onRetry={() => query.refetch()} />
        ) : !academy ? (
          <View style={styles.notBuilt}>
            <GameEmpty icon="school-outline" title="Akademi henüz kurulmadı" body="Akademi binasının ilk aşamasını kurunca altyapın açılır." variant="inline" compact />
            <AcademyBuildingSection academy={null} onOpen={() => undefined} />
            <GameButton label="Akademi binasına git" icon="hammer-outline" onPress={() => nav.building("akademi")} fullWidth />
          </View>
        ) : (
          <>
            <AcademyHero academy={academy} now={now} stageName={city2.buildings.find((b) => b.key === "akademi")?.current?.title} />

            <View onLayout={(e) => (offersY.current = e.nativeEvent.layout.y)}>
              <SectionTitle
                title="Teklifler"
                meta={`bugün ${academy.sales.left_today}/${academy.sales.daily_cap} satış hakkın kaldı`}
              />
            </View>
            {academy.offers.length ? (
              academy.offers.map((o) => {
                const player = all.find((p) => p.id === o.player_id) ?? null;
                return (
                  <OfferCard
                    key={o.id}
                    offer={o}
                    player={player}
                    now={now}
                    salesLeft={academy.sales.left_today}
                    busy={actions.busy}
                    accepting={actions.accept.isPending && actions.accept.variables === o.id}
                    rejecting={actions.reject.isPending && actions.reject.variables === o.id}
                    onAccept={() => {
                      pendingAccept.current = { clubName: o.club.name, playerName: o.player_name ?? player?.name ?? null };
                      actions.accept.mutate(o.id);
                    }}
                    onReject={() => actions.reject.mutate(o.id)}
                    onPlayer={player ? () => setOpenId(player.id) : undefined}
                  />
                );
              })
            ) : (
              <View style={styles.note}>
                <Ionicons name="mail-outline" size={18} color={CP.textTertiary} />
                <Text style={styles.noteText} {...textScale.long}>
                  Şu an bekleyen teklif yok. 14 yaşından büyük oyunculara kulüpler zaman zaman teklif yollar; satış listesine koyduğun oyuncuya daha sık gelir.
                </Text>
              </View>
            )}

            <SectionTitle title="Kadro" meta={`${academy.slots.used}/${academy.slots.max} yuva · en yaşlıdan`} />
            {academy.squad.length ? (
              <View style={styles.grid}>
                {academy.squad.map((p) => (
                  <PlayerCard key={p.id} p={p} now={now} onPress={() => setOpenId(p.id)} />
                ))}
              </View>
            ) : (
              <View style={styles.note}>
                <Ionicons name="person-add-outline" size={18} color={CP.textTertiary} />
                <Text style={styles.noteText} {...textScale.long}>
                  Kadro boş. Sıradaki oyuncu geliş saatinde akademiye katılır.
                </Text>
              </View>
            )}

            <SectionTitle title="A takım" meta={`${academy.a_team.players.length}/${academy.a_team.max} · şeref kadrosu`} />
            {academy.a_team.players.length ? (
              <View style={styles.grid}>
                {academy.a_team.players.map((p) => (
                  <PlayerCard key={p.id} p={p} now={now} onPress={() => setOpenId(p.id)} />
                ))}
              </View>
            ) : (
              <View style={styles.note}>
                <Ionicons name="shield-outline" size={18} color={CP.textTertiary} />
                <Text style={styles.noteText} {...textScale.long}>
                  {academy.a_team.text} 17 yaşından büyük bir oyuncuyu penceresinden A takıma çıkarabilirsin.
                </Text>
              </View>
            )}

            <SectionTitle title="Binaların etkisi" />
            <EffectsCard effects={academy.effects} />

            {academy.history.length ? (
              <>
                <SectionTitle title="Geçmiş" meta={`${academy.totals.sold} satış · ${academy.totals.retired} emekli · en iyi ${academy.totals.best.toLocaleString("tr-TR")} EL`} />
                <HistoryCard items={academy.history} now={now} />
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <PlayerSheet
        p={selected}
        academy={academy}
        now={now}
        busy={actions.busy}
        pending={{
          list: actions.list.isPending,
          promote: actions.promote.isPending,
          release: actions.release.isPending,
        }}
        onClose={() => setOpenId(null)}
        onList={(listed) => selected && actions.list.mutate({ player: selected.id, listed })}
        onPromote={() => selected && actions.promote.mutate(selected.id)}
        onRelease={() => selected && actions.release.mutate(selected.id)}
        onOffers={() => {
          setOpenId(null);
          setTimeout(scrollToOffers, 350);
        }}
      />
      <AcademyInfoSheet visible={info} onClose={() => setInfo(false)} academy={academy} privacy={privacy} />
      <TransferCelebration result={celebration} playerName={celebration?.playerName ?? null} onClose={() => setCelebration(null)} />
    </CityWindow>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant * 2, gap: space.md, paddingTop: space.md },
  notBuilt: { gap: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  note: { ...cardStyle, flexDirection: "row", alignItems: "flex-start", gap: space.sm, padding: space.md },
  noteText: { ...type.bodySm, color: CP.textSecondary, flex: 1 },
});
