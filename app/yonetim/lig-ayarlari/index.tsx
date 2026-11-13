/**
 * LİG AYARLARI — web features/leagueSettings/LeagueSettings.js.
 *
 * Lig opsiyonlarının ve kuralların tanımlandığı yer. Bölümler yetkiye göre
 * görünür (features/leagueSettings/permissions.js ile aynı):
 *   Kural kitapçıkları — kurallar, puanlama sistemi, kadro kuralları
 *   Lig statüsü        — sezonun grupları, eleme turları, kim nereye kalır
 * Kitapçığın hangi sezonda geçerli olacağı Sezonlar ekranından seçilir.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen } from "@/components/admin";
import { OpsRecord, OpsStage, StageTile } from "@/components/admin/matches/opsKit";
import { EmptyState, IconTile } from "@/components/ui";
import { hasAnyPermission, hasPermission } from "@/lib/admin/access";
import { listRuleBooks } from "@/lib/api/admin/leagues";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const PERMS = [
  "groups.view",
  "groups.create",
  "groups.update",
  "groups.delete",
  "rule_books.create",
  "rule_books.update",
  "roster_rules.view",
  "roster_rules.update",
  "seasons.rule_set",
  "leagues.update",
];

const SECTION_PERMS = {
  books: ["rule_books.create", "rule_books.update"],
  structure: ["groups.view", "groups.create", "groups.update", "groups.delete"],
};

export default function LeagueSettingsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const user = auth.user;
  const showBooks = hasAnyPermission(user, SECTION_PERMS.books);
  const showStructure = hasAnyPermission(user, SECTION_PERMS.structure);
  const showSeasons = hasAnyPermission(user, ["seasons.update", "seasons.rule_set"]);

  const books = useQuery({
    queryKey: ["admin", "rule-books", ""],
    queryFn: () => listRuleBooks(),
    enabled: hasPermission(user, "rule_books.update"),
  });
  const bookCount = books.data?.length;

  const published = (books.data ?? []).filter((b) => b.status === "published").length;
  const inUse = (books.data ?? []).reduce((n, b) => n + (b.seasons ?? []).filter((x) => !x.archived).length, 0);

  return (
    <AdminScreen title="Lig ayarları ve kurallar" permission={PERMS} onRefresh={books.refetch} refreshing={books.isRefetching}>
      {/* Kural motoru sahnesi: kitapçık → sezon → puan tablosu akışı ve sayaçlar. */}
      <OpsStage height={190}>
        <View style={styles.stageHead}>
          <IconTile icon="library" tone="signature" size={44} />
          <View style={styles.flex}>
            <Text style={styles.stageTitle} {...textScale.dense}>
              Kural motoru
            </Text>
            <Text style={styles.stageBody} {...textScale.long}>
              Kitapçık yazılır → sezona atanır → puan tablosu ve kadro buna göre çalışır.
            </Text>
          </View>
        </View>
        <View style={styles.stageTiles}>
          <StageTile icon="book-outline" label="Kitapçık" value={bookCount ?? "—"} />
          <StageTile icon="checkmark-circle-outline" label="Yayında" value={books.data ? published : "—"} tone="win" />
          <StageTile icon="calendar-outline" label="Sezonda" value={books.data ? inUse : "—"} tone="info" />
        </View>
      </OpsStage>

      <View style={styles.list}>
        {showBooks ? (
          <OpsRecord
            title="Kural kitapçıkları"
            subtitle="Kurallar, puanlama sistemi ve kadro kuralları"
            icon="book"
            tone="violet"
            rail="brand"
            value={bookCount ?? null}
            valueLabel={bookCount != null ? "kitapçık" : undefined}
            specs={[
              { icon: "calculator-outline", label: "Puanlama" },
              { icon: "people-outline", label: "Kadro kuralı" },
              { icon: "document-text-outline", label: "Serbest metin" },
            ]}
            onPress={() => router.push("/yonetim/lig-ayarlari/kural-kitapciklari")}
          />
        ) : null}
        {showStructure ? (
          <OpsRecord
            title="Lig statüsü"
            subtitle="Gruplar, eleme turları, kim hangi etaba kalır"
            icon="git-network"
            tone="cyan"
            rail="info"
            specs={[
              { icon: "grid-outline", label: "Gruplar" },
              { icon: "git-merge-outline", label: "Eleme ağacı" },
              { icon: "podium-outline", label: "Bölge renkleri" },
            ]}
            onPress={() => router.push("/yonetim/lig-ayarlari/statu")}
          />
        ) : null}
        {showSeasons ? (
          <OpsRecord
            title="Sezonlar"
            subtitle="Her sezonun kural kitapçığını seç"
            icon="calendar"
            tone="gold"
            rail="warn"
            onPress={() => router.push("/yonetim/sezonlar")}
          />
        ) : null}
      </View>
      {!showBooks && !showStructure ? (
        <EmptyState
          icon="lock-closed-outline"
          variant="inline"
          title="Bu sayfadaki ayarlar için yetkin yok"
          body="Yetki için yöneticinle iletişime geç."
        />
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { gap: space.sm },
  stageHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  stageTitle: { ...type.h2, color: colors.onDark },
  stageBody: { ...type.caption, color: colors.onDarkMuted, marginTop: space.xxs },
  stageTiles: { flexDirection: "row", gap: space.sm },
});
