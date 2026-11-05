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
import { StyleSheet, Text } from "react-native";

import { AdminScreen, RecordCard } from "@/components/admin";
import { EmptyState } from "@/components/ui";
import { hasAnyPermission, hasPermission } from "@/lib/admin/access";
import { listRuleBooks } from "@/lib/api/admin/leagues";
import { useAuth } from "@/providers/AuthProvider";
import { colors, textScale, type } from "@/theme";

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

  return (
    <AdminScreen title="Lig ayarları ve kurallar" permission={PERMS} onRefresh={books.refetch} refreshing={books.isRefetching}>
      <Text style={styles.intro} {...textScale.long}>
        Kuralları, puanlama sistemini ve kadro kurallarını kural kitapçığında belirle. Kitapçığın hangi sezonda geçerli olacağını Sezonlar ekranından seç.
      </Text>
      {showBooks ? (
        <RecordCard
          title="Kural kitapçıkları"
          subtitle="Kuralları, puanlama sistemini ve kadro kurallarını yaz"
          meta={bookCount == null ? (books.isLoading ? "Yükleniyor…" : null) : bookCount ? `${bookCount} kitapçık` : "Kitapçık yok"}
          icon="book-outline"
          iconTone="brand"
          onPress={() => router.push("/yonetim/lig-ayarlari/kural-kitapciklari")}
        />
      ) : null}
      {showStructure ? (
        <RecordCard
          title="Lig statüsü"
          subtitle="Sezonun grupları, eleme turları ve kimin hangi etaba kalacağı"
          meta="Puan tablosu ve ağaç şeması buna göre çalışır"
          icon="git-network-outline"
          iconTone="accent"
          onPress={() => router.push("/yonetim/lig-ayarlari/statu")}
        />
      ) : null}
      {showSeasons ? (
        <RecordCard
          title="Sezonlar"
          subtitle="Her sezonun kural kitapçığını seç"
          icon="calendar-outline"
          onPress={() => router.push("/yonetim/sezonlar")}
        />
      ) : null}
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
  intro: { ...type.bodySm, color: colors.textSecondary },
});
