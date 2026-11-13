/**
 * ÜYE YÖNETİMİ — site üyeleri, yetki talepleri ve içerik güncelleme talepleri
 * (web /yonetim/admin/kullanicilar, AdminUsers.js + requests/*).
 *
 * ÜÇ BÖLÜM (?bolum=users|requests|changes):
 *   ÜYELER     sayaç şeridi, arama (ad, e-posta, telefon, takım, oyuncu),
 *              filtre sayfası (rol, durum, hesap tipi, üye profili, il),
 *              sonsuz liste. Karta dokununca üye ayrıntısı; uzun basınca hızlı
 *              işlemler (onayla / reddet / askıya al / etkinleştir).
 *   YETKİ      takım yönetimi, profil sahiplenme, yeni kayıt talepleri
 *   İÇERİK     profil, logo, sponsor, kadrodan çıkarma talepleri
 *
 * Yönetim hesapları (admin, editör…) bu listede yer almaz; sunucu da onlara
 * dokunmayı reddeder (MANAGEMENT_ACCOUNT).
 */

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";

import { ActionSheet, AdminList, AdminScreen, confirmAction, SelectField, useAdminMutation } from "@/components/admin";
import { CountStrip } from "@/components/admin/team/ManageKit";
import { MemberCard } from "@/components/admin/members/MemberCard";
import { AccountRequestsBoard, ChangeRequestsBoard } from "@/components/admin/members/RequestBoards";
import { BottomSheet, Button, Chip, ChipGroup, GradientBar, SegmentedControl } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import {
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_TYPE_LABELS,
  getMemberCities,
  getMembersOverview,
  listMembers,
  MEMBER_ROLE_LABELS,
  PROFILE_TYPE_LABELS,
  reviewMember,
  updateMember,
  type AdminMember,
  type MemberListParams,
} from "@/lib/api/admin/users";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

type Section = "users" | "requests" | "changes";
type Filters = Omit<MemberListParams, "q" | "page" | "limit">;

const LIST_STATUSES = ["active", "inactive", "suspended", "pending", "approved", "rejected"];
const APPROVED = new Set(["active", "approved"]);

export default function MembersScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ bolum?: string; q?: string }>();
  const canRequests = hasAnyPermission(auth.user, ["users.requests"]);
  const canReview = hasAnyPermission(auth.user, ["users.review"]);
  const canUpdate = hasAnyPermission(auth.user, ["users.update"]);

  const initialSection: Section = canRequests && (params.bolum === "requests" || params.bolum === "changes") ? params.bolum : "users";
  const [section, setSection] = useState<Section>(initialSection);
  const [q, setQ] = useState(params.q ? String(params.q) : "");
  const [filters, setFilters] = useState<Filters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menu, setMenu] = useState<AdminMember | null>(null);

  const overview = useQuery({ queryKey: ["admin", "members", "overview"], queryFn: getMembersOverview });
  const cities = useQuery({ queryKey: ["admin", "members", "cities"], queryFn: getMemberCities, staleTime: 10 * 60_000 });
  const t = overview.data?.totals;

  const query = useInfiniteQuery({
    queryKey: ["admin", "members", "list", q, filters],
    queryFn: ({ pageParam }) => listMembers({ ...filters, q: q || undefined, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
    enabled: section === "users",
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.users) ?? [], [query.data]);
  const total = query.data?.pages[0]?.pagination.total;

  const review = useAdminMutation((v: { member: AdminMember; decision: "approved" | "rejected" }) => reviewMember(v.member.id, v.decision), {
    success: (r, v) => r?.message || (v.decision === "approved" ? "Üyelik onaylandı." : "Üyelik reddedildi."),
    invalidate: [["admin", "members"]],
  });
  const setStatus = useAdminMutation((v: { member: AdminMember; status: string }) => updateMember(v.member.id, { status: v.status }), {
    success: (_r, v) => (v.status === "suspended" ? "Hesap askıya alındı." : "Hesap etkinleştirildi."),
    invalidate: [["admin", "members"]],
  });

  const askReview = async (member: AdminMember, decision: "approved" | "rejected") => {
    const label = member.fullName || member.username;
    const ok = await confirmAction({
      title: decision === "approved" ? "Üyelik onaylansın mı?" : "Üyelik reddedilsin mi?",
      message:
        decision === "approved"
          ? `${label} onaylandığında panele giriş yapabilecek.`
          : `${label} panele giriş yapamayacak.`,
      confirmLabel: decision === "approved" ? "Onayla" : "Reddet",
      destructive: decision === "rejected",
    });
    if (ok) review.mutate({ member, decision });
  };
  const askStatus = async (member: AdminMember, status: "suspended" | "active") => {
    const ok = await confirmAction({
      title: status === "suspended" ? "Hesap askıya alınsın mı?" : "Hesap etkinleştirilsin mi?",
      message: status === "suspended" ? "Üye askıdayken panele giriş yapamaz." : "Üye yeniden giriş yapabilir.",
      confirmLabel: status === "suspended" ? "Askıya al" : "Etkinleştir",
      destructive: status === "suspended",
    });
    if (ok) setStatus.mutate({ member, status });
  };

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const segments = [
    { key: "users" as const, label: "Üyeler" },
    ...(canRequests
      ? [
          { key: "requests" as const, label: t?.pendingAccountRequests ? `Yetki (${t.pendingAccountRequests})` : "Yetki talepleri" },
          { key: "changes" as const, label: t?.pendingChangeRequests ? `İçerik (${t.pendingChangeRequests})` : "İçerik talepleri" },
        ]
      : []),
  ];

  const headerActions = [
    ...(section === "users" ? [{ icon: "options-outline" as const, onPress: () => setFiltersOpen(true), badge: activeFilters || undefined, accessibilityLabel: "Filtreler" }] : []),
    ...(hasAnyPermission(auth.user, ["users.membership"])
      ? [{ icon: "diamond-outline" as const, onPress: () => router.push("/yonetim/premium" as Href), badge: t?.pendingPremiumOrders || undefined, accessibilityLabel: "Premium onayları" }]
      : []),
    ...(hasAnyPermission(auth.user, ["users.password_reset"])
      ? [{ icon: "lock-open-outline" as const, onPress: () => router.push("/yonetim/sifre-talepleri" as Href), accessibilityLabel: "Şifre sıfırlama talepleri" }]
      : []),
  ];

  const setFilter = (key: keyof Filters, value: string | null) => setFilters((f) => ({ ...f, [key]: value || undefined }));

  return (
    <AdminScreen
      title="Üye yönetimi"
      subtitle={t ? `${t.users} üye · ${t.pendingMembers} onay bekliyor` : "Site üyeleri ve talepleri"}
      permission={["users.view"]}
      scroll={false}
      actions={headerActions}
      bottom={
        segments.length > 1 ? (
          <View style={styles.segment}>
            <SegmentedControl<Section> items={segments} value={section} onChange={setSection} size="sm" />
          </View>
        ) : undefined
      }
    >
      {section === "requests" ? (
        <AccountRequestsBoard canDecide={canRequests} />
      ) : section === "changes" ? (
        <ChangeRequestsBoard canDecide={canRequests} />
      ) : (
        <AdminList<AdminMember>
          data={items}
          loading={query.isLoading}
          error={query.error}
          onRetry={query.refetch}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => {
            void query.refetch();
            void overview.refetch();
          }}
          onEndReached={() => void query.fetchNextPage()}
          hasMore={query.hasNextPage}
          loadingMore={query.isFetchingNextPage}
          search={q}
          onSearch={setQ}
          searchPlaceholder="Ad, e-posta, telefon ya da takım ara"
          extraHeader={
            <View style={styles.head}>
              {t ? (
                <CountStrip
                  items={[
                    { key: "active", label: "Aktif", value: t.activeUsers, tone: "win", selected: filters.status === "active", onPress: () => setFilter("status", filters.status === "active" ? null : "active") },
                    { key: "pending", label: "Onay", value: t.pendingMembers, tone: "warn", icon: "hourglass", selected: filters.status === "pending", onPress: () => setFilter("status", filters.status === "pending" ? null : "pending") },
                    { key: "premium", label: "Premium", value: t.activePremiumPlans, tone: "brand", icon: "diamond" },
                  ]}
                />
              ) : null}
              {t ? (
                <View style={styles.roles}>
                  <RoleShare icon="football" label="Oyuncu" value={t.players} total={t.users} color={colors.accent} />
                  <RoleShare icon="shield-half" label="Başkan" value={t.teamManagers} total={t.users} color={colors.brandAccent} />
                  <RoleShare icon="star" label="Double" value={t.doubleProfiles} total={t.users} color={colors.adminAccent} />
                </View>
              ) : null}
              <ChipGroup scrollable contentPadding={0}>
                {[
                  { key: "", label: "Tümü" },
                  { key: "pending", label: "Onay bekleyen", count: t?.pendingMembers || undefined },
                  { key: "active", label: "Aktif" },
                  { key: "suspended", label: "Askıda" },
                ].map((f) => (
                  <Chip key={f.key || "all"} label={f.label} count={f.count} size="sm" selected={(filters.status ?? "") === f.key} onPress={() => setFilter("status", f.key)} />
                ))}
                <Chip
                  label={activeFilters ? `Süzgeç · ${activeFilters}` : "Süzgeç"}
                  icon="options-outline"
                  size="sm"
                  selected={activeFilters > (filters.status ? 1 : 0)}
                  onPress={() => setFiltersOpen(true)}
                />
              </ChipGroup>
            </View>
          }
          summary={total != null ? `${total} üye` : null}
          keyExtractor={(m) => String(m.id)}
          emptyIcon="people-outline"
          emptyTitle="Üye bulunamadı"
          emptyBody={q || activeFilters ? "Filtrelerle eşleşen üye yok." : undefined}
          renderItem={({ item }) => (
            <MemberCard
              member={item}
              onPress={() => router.push(`/yonetim/uyeler/${item.id}` as Href)}
              onLongPress={canReview || canUpdate ? () => setMenu(item) : undefined}
            />
          )}
        />
      )}

      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu ? menu.fullName || menu.username : undefined}
        actions={
          menu
            ? [
                { label: "Ayrıntıyı aç", icon: "person-outline", onPress: () => router.push(`/yonetim/uyeler/${menu.id}` as Href) },
                { label: "Üyeliği onayla", icon: "checkmark-circle-outline", hidden: !canReview || APPROVED.has(String(menu.status)), onPress: () => void askReview(menu, "approved") },
                { label: "Üyeliği reddet", icon: "close-circle-outline", danger: true, hidden: !canReview || menu.status === "rejected", onPress: () => void askReview(menu, "rejected") },
                { label: "Askıya al", icon: "ban-outline", danger: true, hidden: !canUpdate || menu.status === "suspended", onPress: () => void askStatus(menu, "suspended") },
                { label: "Etkinleştir", icon: "play-circle-outline", hidden: !canUpdate || menu.status !== "suspended", onPress: () => void askStatus(menu, "active") },
              ]
            : []
        }
      />

      <BottomSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtreler"
        snap="half"
        footer={
          <View style={styles.footer}>
            <Button label="Temizle" variant="secondary" onPress={() => setFilters({})} />
            <Button label="Uygula" onPress={() => setFiltersOpen(false)} style={styles.grow} />
          </View>
        }
      >
        <View style={styles.sheet}>
          <SelectField<string>
            label="Rol"
            value={filters.role ?? null}
            options={Object.entries(MEMBER_ROLE_LABELS).map(([value, label]) => ({ value, label }))}
            placeholder="Tüm roller"
            clearable
            onChange={(v) => setFilter("role", v)}
          />
          <SelectField<string>
            label="Durum"
            value={filters.status ?? null}
            options={LIST_STATUSES.map((value) => ({ value, label: ACCOUNT_STATUS_LABELS[value] }))}
            placeholder="Tüm durumlar"
            clearable
            onChange={(v) => setFilter("status", v)}
          />
          <SelectField<string>
            label="Hesap tipi"
            value={filters.accountType ?? null}
            options={Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            placeholder="Tüm hesap tipleri"
            clearable
            onChange={(v) => setFilter("accountType", v)}
          />
          <SelectField<string>
            label="Üye profili"
            value={filters.profileType ?? null}
            options={Object.entries(PROFILE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            placeholder="Tüm üye profilleri"
            clearable
            onChange={(v) => setFilter("profileType", v)}
          />
          {cities.data?.length ? (
            <SelectField<string>
              label="İl"
              value={filters.city ?? null}
              options={cities.data.map((c) => ({ value: c, label: c }))}
              placeholder="Tüm iller"
              clearable
              icon="location-outline"
              onChange={(v) => setFilter("city", v)}
            />
          ) : null}
        </View>
      </BottomSheet>
    </AdminScreen>
  );
}

/** Rol dağılımı hücresi: ikon + sayı + oran çubuğu (rol rengiyle). */
function RoleShare({ icon, label, value, total, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; total: number; color: string }) {
  return (
    <View style={styles.role} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.roleHead}>
        <Ionicons name={icon} size={12} color={color} />
        <Text style={styles.roleLabel} numberOfLines={1} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
      <Text style={styles.roleValue} {...textScale.badge}>
        {value.toLocaleString("tr-TR")}
      </Text>
      <GradientBar value={total ? value / total : 0} height={4} gradient={[color, color]} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.md },
  roles: {
    flexDirection: "row",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  role: { flex: 1, gap: space.xs },
  roleHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  roleLabel: { ...type.micro, color: colors.textTertiary },
  roleValue: { ...type.scoreSm, color: colors.textPrimary },
  segment: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  sheet: { gap: space.md },
  footer: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
});
