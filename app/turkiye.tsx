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
  const shotRef = useRef<View>(null);

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
          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <View style={styles.shareFrame}>
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
                  TÜRKİYE GENELİ  •  {period === "recent" ? "BU SEZON" : "TÜM ZAMANLAR"}
                </Text>
                <Text style={styles.shareHeadline}>
                  {category.label.toLocaleUpperCase("tr-TR")}
                </Text>

                <View style={styles.shareListCard}>
                  {players.slice(0, 5).map((p, index) => (
                    <View
                      key={p.id}
                      style={[styles.shareRow, index > 0 && styles.shareRowBorder]}
                    >
                      <Text style={styles.shareRank}>
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`}
                      </Text>
                      <PlayerAvatar name={p.name} image={p.image} size={24} />
                      <View style={styles.shareRowBody}>
                        <Text style={styles.shareName} numberOfLines={1}>
                          {p.name.toLocaleUpperCase("tr-TR")}
                        </Text>
                        <Text style={styles.shareTeam} numberOfLines={1}>
                          {p.teamName ?? ""}
                        </Text>
                      </View>
                      <Text style={styles.shareValue}>{category.display(p)}</Text>
                    </View>
                  ))}
                </View>

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
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
    overflow: "hidden",
  },
  shareWatermark: {
    position: "absolute",
    right: -30,
    bottom: 14,
    fontSize: 70,
    fontWeight: "900",
    color: "#6D28D9",
    opacity: 0.07,
    transform: [{ rotate: "-14deg" }],
  },
  shareHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareBrand: {
    fontSize: 15,
    fontWeight: "900",
    color: "#6D28D9",
  },
  shareCorner: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#6D28D9",
  },
  shareKicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#6D28D9",
    marginTop: spacing.sm,
  },
  shareHeadline: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
    color: "#100D16",
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  shareListCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9CBF2",
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
  },
  shareRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "#EFE9FA",
  },
  shareRank: {
    width: 24,
    fontSize: 12,
    textAlign: "center",
  },
  shareRowBody: {
    flex: 1,
  },
  shareName: {
    fontSize: 10,
    fontWeight: "800",
    color: "#100D16",
  },
  shareTeam: {
    fontSize: 8,
    fontWeight: "600",
    color: "#8B8797",
  },
  shareValue: {
    fontSize: 13,
    fontWeight: "900",
    color: "#6D28D9",
    fontVariant: ["tabular-nums"],
  },
  shareFooter: {
    alignItems: "center",
    marginTop: spacing.sm + 2,
  },
  shareSite: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#8B8797",
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
