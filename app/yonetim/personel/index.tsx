/**
 * PERSONEL — maçlarda görev alan spiker, reji, hakem, fotoğrafçı, sağlıkçı.
 *
 * Web: pages/management/StaffManagement.js. Liste tek seferde gelir; arama,
 * görev çipleri, durum / hesap / il / sıralama süzgeçleri istemcide uygulanır
 * (web filterStaff ile aynı kural). Kişiye dokununca ayrıntı ekranı açılır:
 * iletişim, görev geçmişi, aldığı puanlar ve hesap açma.
 *
 * "Yapılacaklar" şeridi web'deki öneri satırlarının karşılığıdır: ili
 * belirtilmemiş personel, personelde karşılığı olmayan yönetim kullanıcıları
 * ve hesabı olmayan aktif personel (toplu hesap açma alt sayfası).
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AdminList,
  AdminScreen,
  FormSheet,
  OptionSheet,
  RecordCard,
  confirmAction,
  useAdminMutation,
  type FieldDef,
} from "@/components/admin";
import { payloadFrom, staffFields } from "@/components/admin/staff/staffForm";
import { StaffAccountsBulkSheet } from "@/components/admin/staff/StaffAccountsBulkSheet";
import { Button, Chip, ChipGroup, FAB, MetricGrid, MetricTile } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import {
  createStaff,
  FALLBACK_DUTIES,
  filterStaff,
  formatMatchWhen,
  getLinkableUsers,
  getManagementRoles,
  getManagementRoster,
  importManagementUsers,
  isNationwideUser,
  listStaff,
  scoreTone,
  STAFF_SORTS,
  type StaffFilters,
  type StaffMember,
  type StaffPayload,
} from "@/lib/api/admin/staff";
import { getCities } from "@/lib/api/meta";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["staff.view"] as const;

const STATUS_FILTERS = [
  { key: "active", label: "Aktif" },
  { key: "passive", label: "Pasif" },
  { key: "all", label: "Tümü" },
];

const ACCOUNT_OPTIONS = [
  { value: "all", label: "Tüm hesap durumları" },
  { value: "with", label: "Hesabı olanlar" },
  { value: "without", label: "Hesabı olmayanlar" },
];

export default function StaffListScreen() {
  const auth = useAuth();
  const router = useRouter();
  const user = auth.user;
  const canCreate = hasAnyPermission(user, ["staff.create"]);
  const canUpdate = hasAnyPermission(user, ["staff.update"]);
  const canAssign = hasAnyPermission(user, ["staff.assign"]);
  const canOpenAccount = canUpdate && hasAnyPermission(user, ["management_users.create"]);
  const nationwide = isNationwideUser(user);

  const [filters, setFilters] = useState<StaffFilters>({ search: "", duty: "", account: "all", status: "active", sort: "name", city: "" });
  const [creating, setCreating] = useState(false);
  const [sheet, setSheet] = useState<null | "sort" | "account" | "city">(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const patch = (next: Partial<StaffFilters>) => setFilters((prev) => ({ ...prev, ...next }));

  const query = useQuery({ queryKey: ["admin", "staff", "list"], queryFn: () => listStaff() });
  const roster = useQuery({ queryKey: ["admin", "staff", "roster"], queryFn: getManagementRoster, enabled: canCreate });
  const linkable = useQuery({ queryKey: ["admin", "staff", "linkable"], queryFn: getLinkableUsers, enabled: canCreate || canUpdate });
  const cities = useQuery({ queryKey: ["admin", "staff", "cities"], queryFn: getCities, enabled: nationwide, staleTime: 300_000 });
  const roles = useQuery({ queryKey: ["admin", "staff", "roles"], queryFn: getManagementRoles, enabled: canOpenAccount, staleTime: 300_000 });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const duties = query.data?.duties?.length ? query.data.duties : FALLBACK_DUTIES;
  const visible = useMemo(() => filterStaff(items, filters), [items, filters]);

  const stats = useMemo(() => {
    const active = items.filter((i) => (i.status || "active") === "active");
    let count = 0;
    let total = 0;
    items.forEach((i) => {
      if (i.average != null && i.ratingCount) {
        count += i.ratingCount;
        total += i.average * i.ratingCount;
      }
    });
    return {
      active: active.length,
      passive: items.length - active.length,
      withAccount: items.filter((i) => i.linkedUser).length,
      upcoming: items.reduce((s, i) => s + (i.upcomingCount || 0), 0),
      totalDuties: items.reduce((s, i) => s + (i.matchCount || 0), 0),
      average: count ? Math.round((total / count) * 10) / 10 : null,
    };
  }, [items]);

  const dutyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((i) => {
      if ((i.status || "active") !== "active" && filters.status !== "all") return;
      (i.duties || []).forEach((k) => (counts[k] = (counts[k] || 0) + 1));
    });
    return counts;
  }, [items, filters.status]);

  const missingStaff = (roster.data ?? []).filter((e) => !e.staff);
  const withoutAccount = items.filter((i) => !i.linkedUser && (i.status || "active") === "active");
  const withoutCity = items.filter((i) => !i.cityId && !i.city && (i.status || "active") === "active");

  const create = useAdminMutation((body: StaffPayload) => createStaff(body), {
    success: (r) => r.message || "Personel eklendi.",
    invalidate: [["admin", "staff"]],
    onSuccess: (r) => r.item?.id && router.push(`/yonetim/personel/${r.item.id}`),
  });
  const importUsers = useAdminMutation(() => importManagementUsers(), {
    success: (r) => r.message,
    invalidate: [["admin", "staff"]],
  });

  const fields: FieldDef[] = useMemo(
    () => staffFields({
      duties,
      linkable: linkable.data ?? [],
      cities: nationwide ? cities.data ?? [] : null,
      editing: false,
    }),
    [duties, linkable.data, cities.data, nationwide]
  );

  const cityLabel = filters.city === "none" ? "İli belirtilmemiş" : cities.data?.find((c) => String(c.id) === filters.city)?.label;

  const header = (
    <View style={styles.headerBlock}>
      <MetricGrid columns={3}>
        <MetricTile label="Aktif personel" value={String(stats.active)} icon="people-outline" />
        <MetricTile label="Hesabı olan" value={String(stats.withAccount)} icon="key-outline" />
        <MetricTile label="Yaklaşan görev" value={String(stats.upcoming)} icon="calendar-outline" tone="accent" />
        <MetricTile label="Toplam görev" value={String(stats.totalDuties)} icon="football-outline" />
        <MetricTile label="Ortalama puan" value={stats.average == null ? "—" : String(stats.average).replace(".", ",")} icon="star-outline" tone="brand" />
        <MetricTile label="Pasif" value={String(stats.passive)} icon="pause-circle-outline" />
      </MetricGrid>

      {nationwide && canUpdate && withoutCity.length > 0 ? (
        <TaskRow
          text={`${withoutCity.length} aktif personelin ili belirtilmemiş. Görevlendirmede yalnız maçın ilinin personeli listelendiği için bu kişiler hiçbir maçta seçilemez.`}
          action="Bu kişileri göster"
          onPress={() => patch({ city: "none", status: "active" })}
        />
      ) : null}
      {canCreate && missingStaff.length > 0 ? (
        <TaskRow
          text={`${missingStaff.length} yönetim kullanıcısı personel listesinde yok${missingStaff.length <= 3 ? `: ${missingStaff.map((e) => e.user.name).join(", ")}` : ""}.`}
          action={`Personele ekle (${missingStaff.length})`}
          busy={importUsers.isPending}
          confirm="Yönetim kullanıcıları personel listesine eklensin mi?"
          onPress={() => importUsers.mutate(undefined)}
        />
      ) : null}
      {canOpenAccount && withoutAccount.length > 0 ? (
        <TaskRow
          text={`${withoutAccount.length} aktif personelin yönetim hesabı yok. Kullanıcı adı, şifre ve rol vererek panele giriş açabilirsin.`}
          action="Hesap oluştur"
          disabled={!roles.data?.length}
          onPress={() => setAccountsOpen(true)}
        />
      ) : null}
      {canAssign ? (
        <Button label="Toplu personel atama" icon="people-outline" variant="secondary" onPress={() => router.push("/yonetim/toplu-atama")} />
      ) : null}

      <ChipGroup scrollable contentPadding={0}>
        <Chip label="Tüm görevler" size="sm" selected={!filters.duty} onPress={() => patch({ duty: "" })} />
        {duties.map((d) => (
          <Chip
            key={d.key}
            size="sm"
            label={d.label}
            count={dutyCounts[d.key] || 0}
            selected={filters.duty === d.key}
            onPress={() => patch({ duty: filters.duty === d.key ? "" : d.key })}
          />
        ))}
      </ChipGroup>
      <ChipGroup scrollable contentPadding={0}>
        <Chip
          size="sm"
          icon="swap-vertical-outline"
          label={STAFF_SORTS.find((s) => s.key === filters.sort)?.label ?? "Sırala"}
          onPress={() => setSheet("sort")}
        />
        <Chip
          size="sm"
          icon="key-outline"
          label={ACCOUNT_OPTIONS.find((a) => a.value === filters.account)?.label ?? "Hesap"}
          selected={filters.account !== "all"}
          onPress={() => setSheet("account")}
        />
        {nationwide ? (
          <Chip
            size="sm"
            icon="location-outline"
            label={cityLabel ?? "Tüm iller"}
            selected={Boolean(filters.city)}
            onPress={() => setSheet("city")}
            onDismiss={filters.city ? () => patch({ city: "" }) : undefined}
          />
        ) : null}
      </ChipGroup>
    </View>
  );

  return (
    <AdminScreen
      title="Personel"
      subtitle="Spiker, reji, hakem, fotoğrafçı, sağlıkçı"
      permission={PERMS}
      scroll={false}
      overlay={canCreate ? <FAB icon="add" label="Yeni personel" extended onPress={() => setCreating(true)} accessibilityLabel="Yeni personel" /> : null}
    >
      <AdminList
        data={visible}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={() => {
          void query.refetch();
          void roster.refetch();
        }}
        search={filters.search}
        onSearch={(search) => patch({ search })}
        searchPlaceholder="Ad, telefon, kullanıcı adı ara"
        filters={STATUS_FILTERS.map((s) => ({ ...s, count: s.key === "passive" ? stats.passive : undefined }))}
        filter={filters.status}
        onFilter={(key) => patch({ status: key as StaffFilters["status"] })}
        extraHeader={header}
        summary={`${visible.length} / ${items.length} personel gösteriliyor`}
        emptyIcon="briefcase-outline"
        emptyTitle={items.length ? "Süzgeçlerle eşleşen personel yok" : "Henüz personel eklenmedi"}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <StaffRow item={item} onPress={() => router.push(`/yonetim/personel/${item.id}`)} />}
      />

      <FormSheet
        visible={creating}
        onClose={() => setCreating(false)}
        title="Yeni personel"
        submitLabel="Personel ekle"
        fields={fields}
        initial={{ duties: [], userId: null, cityId: null }}
        onSubmit={(v) => create.mutateAsync(payloadFrom(v, nationwide))}
      />

      <OptionSheet<string>
        visible={sheet === "sort"}
        onClose={() => setSheet(null)}
        title="Sıralama"
        options={STAFF_SORTS.map((s) => ({ value: s.key, label: s.label }))}
        value={filters.sort}
        onSelect={(v) => {
          patch({ sort: (v as StaffFilters["sort"]) ?? "name" });
          setSheet(null);
        }}
      />
      <OptionSheet<string>
        visible={sheet === "account"}
        onClose={() => setSheet(null)}
        title="Hesap durumu"
        options={ACCOUNT_OPTIONS}
        value={filters.account}
        onSelect={(v) => {
          patch({ account: (v as StaffFilters["account"]) ?? "all" });
          setSheet(null);
        }}
      />
      <OptionSheet<string>
        visible={sheet === "city"}
        onClose={() => setSheet(null)}
        title="İl"
        searchable
        clearable
        options={[{ value: "none", label: "İli belirtilmemiş" }, ...(cities.data ?? []).map((c) => ({ value: String(c.id), label: c.label }))]}
        value={filters.city || null}
        onSelect={(v) => {
          patch({ city: (v as string | null) ?? "" });
          setSheet(null);
        }}
      />

      {accountsOpen && roles.data?.length ? (
        <StaffAccountsBulkSheet
          visible={accountsOpen}
          onClose={() => {
            setAccountsOpen(false);
            void query.refetch();
          }}
          people={withoutAccount}
          roles={roles.data}
          cities={cities.data ?? []}
          nationwide={nationwide}
        />
      ) : null}
    </AdminScreen>
  );
}

function StaffRow({ item, onPress }: { item: StaffMember; onPress: () => void }) {
  const passive = (item.status || "active") !== "active";
  const when = item.nextMatch
    ? `Sıradaki: ${formatMatchWhen(item.nextMatch)} · ${item.nextMatch.label}`
    : item.lastMatch
      ? `Son görev: ${formatMatchWhen(item.lastMatch)}`
      : null;
  return (
    <RecordCard
      title={item.fullName}
      subtitle={item.dutyLabels?.length ? item.dutyLabels.join(", ") : "Görev seçilmedi"}
      meta={when ?? ([item.phone, item.city].filter(Boolean).join(" · ") || "İletişim bilgisi yok")}
      avatar={{ name: item.fullName }}
      muted={passive}
      value={item.average == null ? "—" : String(item.average).replace(".", ",")}
      valueTone={scoreTone(item.average)}
      badges={[
        passive ? { label: "Pasif", tone: "neutral" } : null,
        item.linkedUser
          ? { label: item.linkedUser.username ? `@${item.linkedUser.username}` : item.linkedUser.name, tone: "brand", icon: "key-outline" }
          : { label: "Hesap yok", tone: "neutral" },
        { label: `${item.matchCount || 0} görev`, tone: "info" },
        item.upcomingCount ? { label: `${item.upcomingCount} yaklaşan`, tone: "accent" } : null,
      ]}
      onPress={onPress}
    />
  );
}

function TaskRow({
  text,
  action,
  onPress,
  busy,
  disabled,
  confirm,
}: {
  confirm?: string;
  text: string;
  action: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={styles.task}>
      <Text style={styles.taskText} {...textScale.long}>
        {text}
      </Text>
      <Button
        label={action}
        size="sm"
        variant="secondary"
        loading={busy}
        disabled={disabled}
        onPress={async () => {
          if (confirm && !(await confirmAction({ title: confirm, confirmLabel: "Onayla" }))) return;
          onPress();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: { gap: space.md },
  task: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.warnDim,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  taskText: { ...type.bodySm, color: colors.textPrimary },
});
