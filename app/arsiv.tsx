import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useScope } from "@/providers/ScopeProvider";

/**
 * Arşiv — sitedeki "Tamamlanan lig ve sezonlar" bölümünün doğal (native) hali.
 *
 * Yeni veri katmanı gerektirmez: kapsam sağlayıcısının zaten yüklediği
 * lig/sezon listesi kullanılır. Bir sezona dokunmak kapsamı o sezona çevirir
 * ve puan durumuna götürür — kullanıcı geçmiş sezonu uygulama içinde gezer.
 * Güncel kapsama dönmek için üstteki seçiciler her ekranda hazırdır.
 */
export default function ArchiveScreen() {
  const scope = useScope();
  const router = useRouter();

  const openSeason = (leagueId: number, seasonId: number) => {
    scope.selectLeague(leagueId);
    scope.selectSeason(seasonId);
    router.push("/standings");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Arşiv" subtitle={`${scope.cityLabel} · geçmiş sezonlar`} />

      {scope.loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>
            Bir sezona dokununca uygulama o sezona geçer; puan durumu, maçlar ve
            oyuncular o sezonun verileriyle gezilir. Üstteki seçicilerden istediğin
            an güncel sezona dönebilirsin.
          </Text>

          {scope.leagues.length === 0 ? (
            <EmptyState
              icon="archive-outline"
              title="Arşiv boş"
              body="Bu şehirde listelenecek lig bulunmuyor."
            />
          ) : (
            scope.leagues.map((league) => (
              <LeagueBlock
                key={league.id}
                leagueId={league.id}
                label={league.label}
                activeLeague={scope.leagueId === league.id}
                seasons={scope.leagueId === league.id ? scope.seasons : []}
                currentSeasonId={scope.seasonId}
                onSelectLeague={() => scope.selectLeague(league.id)}
                onOpenSeason={(seasonId) => openSeason(league.id, seasonId)}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function LeagueBlock({
  label,
  activeLeague,
  seasons,
  currentSeasonId,
  onSelectLeague,
  onOpenSeason,
}: {
  leagueId: number;
  label: string;
  activeLeague: boolean;
  seasons: { id: number; label: string; is_archived?: boolean }[];
  currentSeasonId: number | null;
  onSelectLeague: () => void;
  onOpenSeason: (seasonId: number) => void;
}) {
  return (
    <View style={styles.leagueCard}>
      <Pressable
        onPress={onSelectLeague}
        style={({ pressed }) => [styles.leagueHead, pressed && styles.pressed]}
      >
        <Ionicons name="trophy-outline" size={18} color={colors.turf} />
        <Text style={styles.leagueName}>{label.toLocaleUpperCase("tr-TR")}</Text>
        <Ionicons
          name={activeLeague ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.muted}
        />
      </Pressable>

      {activeLeague &&
        (seasons.length === 0 ? (
          <Text style={styles.emptyLine}>Sezon listesi yükleniyor…</Text>
        ) : (
          seasons.map((season, index) => (
            <Pressable
              key={season.id}
              onPress={() => onOpenSeason(season.id)}
              style={({ pressed }) => [
                styles.seasonRow,
                index % 2 === 1 && styles.seasonRowAlt,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.seasonName}>{season.label}</Text>
              {season.id === currentSeasonId ? (
                <View style={styles.nowPill}>
                  <Text style={styles.nowPillText}>ŞU AN</Text>
                </View>
              ) : season.is_archived ? (
                <View style={styles.donePill}>
                  <Text style={styles.donePillText}>TAMAMLANDI</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={15} color={colors.muted} />
            </Pressable>
          ))
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  hint: {
    ...type.small,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  leagueCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  leagueHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  leagueName: {
    ...type.small,
    color: colors.line,
    fontWeight: "800",
    flex: 1,
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  seasonRowAlt: {
    backgroundColor: colors.surfaceRaised,
  },
  seasonName: {
    ...type.small,
    color: colors.line,
    fontWeight: "600",
    flex: 1,
  },
  nowPill: {
    backgroundColor: colors.turfDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  nowPillText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.turf,
  },
  donePill: {
    backgroundColor: colors.goldDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  donePillText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.yellow,
  },
  emptyLine: {
    ...type.small,
    color: colors.muted,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
});
