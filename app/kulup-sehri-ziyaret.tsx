/**
 * ŞEHİRLERİ GEZ — /kulup-sehri-ziyaret (Kulüp Şehri 2.0 · Faz 5)
 *
 * Başka başkanların şehirleri (GET /api/puzzle/city2/visit?kind=…), dört sekme:
 *   En güzel (güzelliğe göre) · Takımım (takım arkadaşların) · İlim (aynı il,
 *   her gün değişir) · Rastgele (her gün değişir).
 * Şehre dokununca salt okunur ziyaret ekranı açılır; listenin sırası "sonraki /
 * önceki şehir" için ziyaret ekranına geçer.
 * Üstte "Şehrimi ziyarete kapat" anahtarı (Ayarlar → Gizlilik ile aynı tercih).
 * Ziyarete kapalı ve askıdaki şehirler listelerde hiç çıkmaz. Eski sunucu (404): "yakında".
 */

import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { VisitCityRow, VisitPrivacyRow } from "@/components/city2/Visit";
import { EmptyState, ErrorState, ScreenHeader, SegmentedControl, SkeletonListRow, refreshControlProps, useRefresh, type SegmentedItem } from "@/components/ui";
import type { City2VisitCard, City2VisitKind } from "@/lib/puzzle/city2";
import { useCity2, useCity2VisitList, usePrivacyPreferences } from "@/lib/puzzle/useCity2";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space, textScale, type } from "@/theme";

const TABS: SegmentedItem<City2VisitKind>[] = [
  { key: "featured", label: "En güzel" },
  { key: "team", label: "Takımım" },
  { key: "city", label: "İlim" },
  { key: "random", label: "Rastgele" },
];

const EMPTY: Record<City2VisitKind, { title: string; body: string }> = {
  featured: { title: "Henüz gezilecek şehir yok", body: "Sembol yapı yerleştiren şehirler burada çıkar." },
  team: { title: "Takımından şehir yok", body: "Takım arkadaşların şehir kurunca burada görünür." },
  city: { title: "İlinden şehir yok", body: "İlindeki başkanlar şehir kurunca burada görünür." },
  random: { title: "Şimdilik şehir yok", body: "Yarın yeni şehirler karşına çıkar." },
};

export default function VisitListScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { legacy } = useCity2();
  const [tab, setTab] = useState<City2VisitKind>("featured");
  const { query, lists, supported } = useCity2VisitList(tab);
  const privacy = usePrivacyPreferences(true);
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  if (!auth.user) return <Redirect href="/giris" />;

  const rows: City2VisitCard[] = (lists?.[tab] as City2VisitCard[] | undefined) ?? [];
  const unsupported = legacy || !supported;
  const open = (c: City2VisitCard) =>
    router.push({ pathname: "/kulup-sehri-ziyaret-sehir", params: { id: String(c.user_id), ids: rows.map((r) => r.user_id).join(",") } });
  const teamName = tab === "team" ? lists?.team_info?.name ?? null : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Şehirleri gez"
        subtitle="Başka başkanların şehirleri"
        back
        bottom={unsupported ? undefined : <View style={styles.tabs}><SegmentedControl items={TABS} value={tab} onChange={setTab} stretch size="sm" /></View>}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}>
        {unsupported ? (
          <EmptyState icon="compass-outline" title="Şehir ziyareti yakında" body="Başka şehirleri gezmek ve alkışlamak sunucu güncellemesiyle açılacak." variant="inline" action={{ label: "Şehre dön", onPress: () => router.back(), haptic: "light" }} />
        ) : (
          <>
            {lists?.intro ? (
              <Text style={styles.intro} {...textScale.long}>
                {lists.intro} Her alkış sana ve şehrin sahibine yıldız getirir.
              </Text>
            ) : null}
            {privacy.visit.supported ? (
              <VisitPrivacyRow label={privacy.visit.label} help={privacy.visit.help} value={privacy.visit.value} disabled={privacy.visit.saving} onChange={privacy.visit.set} />
            ) : null}
            {teamName ? (
              <Text style={styles.meta} {...textScale.dense}>
                {teamName} · takım arkadaşların
              </Text>
            ) : null}
            {query.isLoading ? (
              <SkeletonListRow count={6} avatar />
            ) : query.isError ? (
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon="compass-outline"
                title={tab === "team" && lists && lists.team_info === null ? "Takımın yok" : EMPTY[tab].title}
                body={tab === "team" && lists && lists.team_info === null ? "Oyuncu kartın bir takıma bağlı olduğunda takım arkadaşlarının şehirleri burada çıkar." : EMPTY[tab].body}
                variant="inline"
                compact
              />
            ) : (
              <View style={styles.list}>
                {rows.map((c) => (
                  <VisitCityRow key={c.user_id} c={c} onPress={() => open(c)} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  tabs: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant * 2, gap: space.md },
  intro: { ...type.bodySm, color: colors.textSecondary },
  meta: { ...type.caption, color: colors.textTertiary },
  list: { gap: space.sm },
});
