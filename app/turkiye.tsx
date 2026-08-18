import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useMemo, useRef, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import ViewShot, { captureRef } from "react-native-view-shot";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { PlayerAvatar } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getPlayerRankings } from "@/lib/api/players";
import { queryKeys } from "@/lib/queryKeys";
import type { PlayerRankRow, PlayerSort } from "@/lib/types";

/**
 * Türkiye Sıralaması — tüm şehirlerin birleşik istatistik liderleri.
 *
 * Sıralama ucu kapsam parametresi verilmeyince ülke genelini döndürür; bu
 * ekran o davranışı kullanır. Altı kategori sekmesi vardır; her kategoride
 * ilk 3 podyumda, kalanlar listede gösterilir. Sistem oyuncuları (HÜKMEN,
 * antpl vb.) sıralamadan ayıklanır. Satıra dokunmak oyuncu profilini açar.
 */

const CATEGORIES: {
  sort: PlayerSort;
  label: string;
  unit: string;
  value: (p: PlayerRankRow) => number;
  display: (p: PlayerRankRow) => string;
}[] = [
  { sort: "mostValuable",  label: "En Değerli",   unit: "PUAN",  value: (p) => Number(p.points) || 0,         display: (p) => String(Number(p.points) || 0) },
  { sort: "topScorers",    label: "Gol Kralı",     unit: "GOL",   value: (p) => Number(p.goals) || 0,          display: (p) => String(Number(p.goals) || 0) },
  { sort: "goalsPerMatch", label: "Gol / Maç",     unit: "ORT",   value: (p) => Number(p.goalsPerMatch) || 0,  display: (p) => Number(p.goalsPerMatch ?? 0).toFixed(2) },
  { sort: "mostMatches",   label: "En Çok Maç",    unit: "MAÇ",   value: (p) => Number(p.matches) || 0,        display: (p) => String(Number(p.matches) || 0) },
  { sort: "pointsPerMatch",label: "Puan / Maç",    unit: "ORT",   value: (p) => Number(p.pointsPerMatch) || 0, display: (p) => Number(p.pointsPerMatch ?? 0).toFixed(2) },
  { sort: "mostCards",     label: "En Çok Kart",   unit: "KART",  value: (p) => Number(p.cards) || 0,          display: (p) => String(Number(p.cards) || 0) },
];

const JUNK = /hükmen|hukmen|antpl/i;

export default function TurkeyRankingsScreen() {
  const router = useRouter();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [period, setPeriod] = useState<"recent" | "alltime">("recent");
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fmt, setFmt] = useState<"story" | "post">("story");
  const shotRef = useRef<View>(null);

  const CARD_W = 272;
  const FORMATS = {
    story: { label: "Hikâye 9:16", height: Math.round((CARD_W * 16) / 9) },
    post:  { label: "Gönderi 3:4", height: Math.round((CARD_W * 4) / 3) },
  } as const;

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      }
    } catch {
      Alert.alert("Bir sorun oldu", "Görsel oluşturulamadı, tekrar dener misin?");
    } finally {
      setBusy(false);
    }
  };

  // "Bu Sezon": filtre yanıtından en yüksek 8 sezon ID'si seçilir → yaklaşık son 6 ay.
  /** Son 6 ay: bugünden 180 gün öncesi (YYYY-MM-DD). */
  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 180);
    return d.toISOString().slice(0, 10);
  }, []);

  const query = useQuery({
    queryKey: ["turkey", period, category.sort, startDate],
    queryFn: () =>
      getPlayerRankings(period === "recent" ? { startDate } : {}, category.sort),
    staleTime: 10 * 60_000,
  });

  const players = useMemo(
    () =>
      (query.data?.players ?? [])
        .filter((p) => p.name && !JUNK.test(p.name))
        .sort((a, b) => category.value(b) - category.value(a))
        .slice(0, 50),
    [query.data, category]
  );
  const podium = players.slice(0, 3);
  const rest = players.slice(3);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="🇹🇷 Türkiye Sıralaması" subtitle="Tüm şehirler · son 6 ay" />

      {/* Kategori sekmeleri */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {CATEGORIES.map((item) => {
            const active = item.sort === category.sort;
            return (
              <Pressable
                key={item.sort}
                onPress={() => setCategory(item)}
                style={({ pressed }) => [
                  styles.tab,
                  active && styles.tabActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Dönem toggle */}
      <View style={styles.periodRow}>
        {([ ["recent", "Bu Sezon"], ["alltime", "Tüm Zamanlar"] ] as const).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setPeriod(key)}
            style={({ pressed }) => [
              styles.periodBtn,
              period === key && styles.periodBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.periodText, period === key && styles.periodTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {players.length > 0 ? (
        <Pressable
          onPress={() => setShareOpen(true)}
          style={({ pressed }) => [styles.shareTrigger, pressed && styles.pressed]}
        >
          <Ionicons name="share-social" size={14} color={colors.turf} />
          <Text style={styles.shareTriggerText}>Sıralamayı Paylaş</Text>
        </Pressable>
      ) : null}

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : players.length === 0 ? (
        <EmptyState icon="trophy-outline" title="Veri yok" body="Sıralama şu an boş görünüyor." />
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.podium}>
              {[podium[1], podium[0], podium[2]].filter(Boolean).map((p) => {
                const rank = podium.indexOf(p) + 1;
                const first = rank === 1;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => router.push(`/oyuncu/${p.id}`)}
                    style={({ pressed }) => [
                      styles.podiumCard,
                      first && styles.podiumFirst,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.podiumRank}>{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</Text>
                    <PlayerAvatar name={p.name} image={p.image} size={first ? 56 : 44} />
                    <Text style={styles.podiumName} numberOfLines={1}>
                      {p.name.toLocaleUpperCase("tr-TR")}
                    </Text>
                    <Text style={styles.podiumTeam} numberOfLines={1}>
                      {[p.teamName, p.city].filter(Boolean).join(" · ")}
                    </Text>
                    <Text style={[styles.podiumValue, first && styles.podiumValueFirst]}>
                      {category.display(p)}
                    </Text>
                    <Text style={styles.podiumUnit}>{category.unit}</Text>
                  </Pressable>
                );
              })}
            </View>
          }
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => router.push(`/oyuncu/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text style={styles.rowRank}>{index + 4}</Text>
              <PlayerAvatar name={item.name} image={item.image} size={34} />
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name.toLocaleUpperCase("tr-TR")}
                </Text>
                <Text style={styles.rowTeam} numberOfLines={1}>
                  {[item.teamName, item.city].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <View style={styles.rowValueBox}>
                <Text style={styles.rowValue}>{category.display(item)}</Text>
                <Text style={styles.rowUnit}>{category.unit}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
      {/* Paylaşım penceresi — İçerik Havuzu dili */}
      <Modal
        visible={shareOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setShareOpen(false)}
      >
        <View style={styles.backdrop}>
          {/* Boy seçici */}
          <View style={styles.fmtRow}>
            {(["story", "post"] as const).map((key) => (
              <Pressable
                key={key}
                onPress={() => setFmt(key)}
                style={({ pressed }) => [
                  styles.fmtPill,
                  fmt === key && styles.fmtPillActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.fmtText}>{FORMATS[key].label}</Text>
              </Pressable>
            ))}
          </View>

          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <View style={[styles.shareFrame, { height: FORMATS[fmt].height }]}>
              <LinearGradient
                colors={["#6D28D9", "#4C1D95"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.shareStrip}
              />
              <LinearGradient
                colors={["#CDBFE8", "#EFEAF7", "#FFFFFF"]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.shareBody}
              >
                <Text style={styles.shareWatermark}>elitlig</Text>
                <View style={styles.shareHeadRow}>
                  <Text style={styles.shareBrand}>elitlig</Text>
                  <Text style={styles.shareCorner}>ELİTLİG MOBİL</Text>
                </View>
                <Text style={styles.shareKicker}>
                  🇹🇷 TÜRKİYE  •  {period === "recent" ? "BU SEZON" : "TÜM ZAMANLAR"}
                </Text>
                <Text style={styles.shareHeadline}>
                  {category.label.toLocaleUpperCase("tr-TR")}
                </Text>

                <View style={styles.shareListCard}>
                  {players.slice(0, 5).map((pl, index) => (
                    <View
                      key={pl.id}
                      style={[styles.shareRow, index > 0 && styles.shareRowBorder]}
                    >
                      <Text style={styles.shareRank}>
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`}
                      </Text>
                      <PlayerAvatar name={pl.name} image={pl.image} size={26} />
                      <View style={styles.shareRowBody}>
                        <Text style={styles.shareName} numberOfLines={1}>
                          {pl.name.toLocaleUpperCase("tr-TR")}
                        </Text>
                        <Text style={styles.shareTeam} numberOfLines={1}>
                          {[pl.teamName, pl.city].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                      <View style={styles.shareValueBox}>
                        <Text style={styles.shareValue}>{category.display(pl)}</Text>
                        <Text style={styles.shareUnit}>{category.unit}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.shareSpacer} />
                <View style={styles.shareFooter}>
                  <Text style={styles.shareSite}>ELİTLİG.COM</Text>
                </View>
              </LinearGradient>
            </View>
          </ViewShot>

          <View style={styles.shareActions}>
            <Pressable
              onPress={() => setShareOpen(false)}
              style={({ pressed }) => [styles.actionBtn, styles.closeBtn, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>Kapat</Text>
            </Pressable>
            <Pressable
              onPress={share}
              style={({ pressed }) => [styles.actionBtn, styles.goBtn, pressed && styles.pressed]}
            >
              <Ionicons name="share-social" size={16} color={colors.surface} />
              <Text style={styles.goText}>{busy ? "Hazırlanıyor…" : "Paylaş"}</Text>
            </Pressable>
          </View>
          <Text style={styles.saveHint}>İndirmek için: Paylaş → "Görüntüyü Kaydet"</Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  periodRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  periodBtn: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    paddingVertical: spacing.sm + 2,
  },
  periodBtnActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  periodText: {
    ...type.caption,
    color: colors.muted,
  },
  periodTextActive: {
    color: colors.surface,
  },
  shareTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: colors.turfDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  shareTriggerText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.turf,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  fmtRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  fmtPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fmtPillActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  fmtText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  shareFrame: {
    width: 272,
    backgroundColor: "#0B0A0E",
    borderRadius: 14,
    padding: 7,
    overflow: "hidden",
  },
  shareStrip: {
    height: 7,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  shareBody: {
    flex: 1,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
    overflow: "hidden",
  },
  shareSpacer: {
    flex: 1,
  },
  shareWatermark: {
    position: "absolute",
    right: -28,
    bottom: 20,
    fontSize: 64,
    fontWeight: "900",
    color: "#6D28D9",
    opacity: 0.06,
    transform: [{ rotate: "-12deg" }],
  },
  shareHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  shareBrand: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.3,
    color: "#6D28D9",
  },
  shareCorner: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#6D28D9",
    opacity: 0.7,
  },
  shareKicker: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#6D28D9",
    opacity: 0.85,
    marginBottom: 2,
  },
  shareHeadline: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    color: "#100D16",
    marginBottom: spacing.sm + 2,
    lineHeight: 26,
  },
  shareListCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2D9F5",
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    shadowColor: "#6D28D9",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
  },
  shareRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "#F2EDFB",
  },
  shareRank: {
    width: 22,
    fontSize: 13,
    textAlign: "center",
  },
  shareRowBody: {
    flex: 1,
    gap: 1,
  },
  shareName: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#100D16",
    letterSpacing: -0.1,
  },
  shareTeam: {
    fontSize: 8,
    fontWeight: "600",
    color: "#9B92AA",
    letterSpacing: 0,
  },
  shareValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#5B21B6",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
  },
  shareFooter: {
    alignItems: "center",
    paddingTop: spacing.sm,
  },
  shareSite: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2.5,
    color: "#9B92AA",
  },
  saveHint: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.65)",
  },
  shareValueBox: {
    alignItems: "flex-end",
    gap: 1,
  },
  shareUnit: {
    fontSize: 6.5,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#9B92AA",
    textTransform: "uppercase",
  },
  shareActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 3,
  },
  closeBtn: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  closeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  goBtn: {
    backgroundColor: colors.turf,
  },
  goText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.surface,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  tabs: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  tab: {
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  tabText: {
    ...type.caption,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.surface,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  podium: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  podiumCard: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: 6,
  },
  podiumFirst: {
    borderColor: colors.yellow,
    backgroundColor: colors.goldDim + "44",
    paddingVertical: spacing.lg,
  },
  podiumRank: {
    fontSize: 18,
  },
  podiumName: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.line,
    textAlign: "center",
  },
  podiumTeam: {
    fontSize: 8,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
  },
  podiumValue: {
    ...type.subtitle,
    color: colors.turf,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  podiumValueFirst: {
    fontSize: 20,
  },
  podiumUnit: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  rowRank: {
    ...type.small,
    color: colors.muted,
    width: 24,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  rowBody: {
    flex: 1,
  },
  rowName: {
    ...type.small,
    fontWeight: "700",
    color: colors.line,
  },
  rowTeam: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  rowValueBox: {
    alignItems: "center",
    minWidth: 48,
  },
  rowValue: {
    ...type.body,
    fontWeight: "800",
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  rowUnit: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.7,
  },
});
