/**
 * YÖNETİM KULLANICILARI — admin, editör, il yöneticisi gibi yönetim rollerine
 * sahip hesaplar (web pages/management/ManagementUsers.js).
 *
 * NE: hesap listesi (arama, rol çipleri, durum süzgeci), sayaç şeridi, yeni
 * hesap açma (rol, il kapsamı, ünvan), düzenleme, askıya alma / etkinleştirme,
 * şifre belirleme ve silme. Karta dokununca eylem sayfası açılır; her eylem
 * ilgili yetki yoksa hiç görünmez (management_users.create / update /
 * password / delete, permissions.view).
 *
 * NEDEN İSTEMCİDE SÜZGEÇ: sunucu en fazla 100 yönetim hesabı döndürür ve web
 * de listeyi tek seferde alıp yerelde süzer; her tuşta istek atılmaz.
 * İl kapsamı rolle belirlenir: Türkiye geneli rollerde il alanı gizlenir,
 * sunucu "Türkiye" yazar.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  ActionSheet,
  AdminList,
  AdminScreen,
  FormSheet,
  RecordCard,
  StatRow,
  confirmAction,
  useAdminMutation,
  type FieldDef,
  type FormValues,
} from "@/components/admin";
import { FAB, SegmentedControl } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDate } from "@/lib/admin/format";
import {
  MANAGEMENT_STATUS_LABELS,
  createManagementUser,
  deleteManagementUser,
  getCities,
  getManagementRoles,
  listManagementUsers,
  setManagementUserPassword,
  systemKeys,
  updateManagementUser,
  type ManagementStatus,
  type ManagementUser,
} from "@/lib/api/admin/system";
import { useAuth } from "@/providers/AuthProvider";
import { space } from "@/theme";

const PERMS = ["management_users.view"];
type StatusFilter = "all" | ManagementStatus;

const STATUS_ITEMS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "active", label: "Aktif" },
  { key: "suspended", label: "Askıda" },
];

const fold = (text: string) => text.toLocaleLowerCase("tr-TR");

export default function ManagementUsersScreen() {
  const auth = useAuth();
  const router = useRouter();
  const user = auth.user;
  const canCreate = hasAnyPermission(user, ["management_users.create"]);
  const canUpdate = hasAnyPermission(user, ["management_users.update"]);
  const canDelete = hasAnyPermission(user, ["management_users.delete"]);
  const canPassword = hasAnyPermission(user, ["management_users.password"]);
  const canAccess = hasAnyPermission(user, ["permissions.view"]);

  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<ManagementUser | "new" | null>(null);
  const [actionFor, setActionFor] = useState<ManagementUser | null>(null);
  const [passwordFor, setPasswordFor] = useState<ManagementUser | null>(null);

  const list = useQuery({ queryKey: systemKeys.managementUsers, queryFn: () => listManagementUsers() });
  const roles = useQuery({ queryKey: systemKeys.managementRoles, queryFn: getManagementRoles, staleTime: 5 * 60_000 });
  // İl listesi alınamazsa form serbest metne düşmez; il alanı boş seçenekle kalır.
  const cities = useQuery({ queryKey: systemKeys.cities, queryFn: getCities, staleTime: 5 * 60_000 });

  const roleList = roles.data?.roles ?? [];
  const roleByKey = useMemo(() => new Map(roleList.map((r) => [r.key, r])), [roleList]);

  const visible = useMemo(() => {
    const needle = fold(q.trim());
    return (list.data?.users ?? []).filter((item) => {
      if (role !== "all" && item.role !== role) return false;
      if (status !== "all" && item.status !== status) return false;
      if (!needle) return true;
      return fold([item.fullName, item.username, item.email, item.phone, item.city, item.title, item.roleLabel].filter(Boolean).join(" ")).includes(
        needle
      );
    });
  }, [list.data, q, role, status]);

  const invalidate = [systemKeys.managementUsers, systemKeys.access];
  const save = useAdminMutation(
    (values: FormValues) => {
      const nationwide = roleByKey.get(String(values.role))?.nationwide;
      const body = {
        fullName: trimOrNull(values.fullName),
        title: trimOrNull(values.title),
        email: trimOrNull(values.email),
        phone: trimOrNull(values.phone),
        role: String(values.role),
        city: nationwide ? "" : String(values.city ?? "").trim(),
        status: (values.status === "suspended" ? "suspended" : "active") as ManagementStatus,
      };
      if (editing === "new" || editing == null) {
        return createManagementUser({ ...body, username: String(values.username ?? "").trim(), password: String(values.password ?? "") });
      }
      // Yalnız değişen alanlar gider: sunucu kişinin KENDİ rolünü/durumunu
      // göndermesini (aynı değer olsa bile) CANNOT_CHANGE_OWN_ROLE ile reddeder.
      const before: Record<string, unknown> = {
        fullName: editing.fullName ?? null,
        title: editing.title ?? null,
        email: editing.email ?? null,
        phone: editing.phone ?? null,
        role: editing.role,
        city: editing.nationwide ? "" : editing.city ?? "",
        status: editing.status === "suspended" ? "suspended" : "active",
      };
      const changes = Object.fromEntries(Object.entries(body).filter(([key, value]) => value !== before[key]));
      if (!Object.keys(changes).length) return Promise.resolve({ message: "Değişiklik yok.", user: editing });
      return updateManagementUser(editing.id, changes);
    },
    { success: (r) => r.message || "Yönetim hesabı kaydedildi.", invalidate, silentError: true }
  );
  const setStatusMutation = useAdminMutation(
    (vars: { item: ManagementUser; status: ManagementStatus }) => updateManagementUser(vars.item.id, { status: vars.status }),
    { success: (_r, v) => (v.status === "active" ? `@${v.item.username} etkinleştirildi.` : `@${v.item.username} askıya alındı.`), invalidate }
  );
  const remove = useAdminMutation((item: ManagementUser) => deleteManagementUser(item.id), {
    success: (r) => r.message || "Yönetim hesabı silindi.",
    invalidate,
  });
  const password = useAdminMutation(
    (vars: { id: number; password: string }) => setManagementUserPassword(vars.id, vars.password),
    { success: (r) => r.message || "Şifre güncellendi.", silentError: true }
  );

  const assignable = roleList.filter((r) => r.assignable);
  const fields: FieldDef[] = useMemo(() => {
    const isNew = editing === "new";
    const cityOptions = (cities.data ?? []).map((c) => ({ value: c.city_name, label: c.city_name, hint: c.plate_code }));
    return [
      {
        key: "username",
        label: "Kullanıcı adı (giriş için)",
        kind: "text",
        required: isNew,
        disabled: !isNew,
        placeholder: "Örn. ankara.temsilci",
        icon: "at-outline",
        hint: isNew ? undefined : "Kullanıcı adı değiştirilemez.",
      },
      ...(isNew
        ? [{ key: "password", label: "Şifre", kind: "password", required: true, placeholder: "En az 8 karakter, harf ve rakam" } as FieldDef]
        : []),
      { key: "fullName", label: "Ad soyad", kind: "text", placeholder: "Örn. Ada Yılmaz" },
      { key: "title", label: "Ünvan", kind: "text", maxLength: 80, placeholder: "Örn. Ankara İl Temsilcisi" },
      {
        key: "role",
        label: "Rol",
        kind: "select",
        required: true,
        options: (assignable.length ? assignable : roleList).map((r) => ({
          value: r.key,
          label: r.label,
          hint: r.nationwide ? "Türkiye geneli" : "İl bazlı",
        })),
        icon: "shield-checkmark-outline",
      },
      {
        key: "city",
        label: "İl",
        kind: "select",
        required: true,
        options: cityOptions,
        icon: "location-outline",
        hint: "Yetkiler yalnız bu ilde geçerli olur.",
        hidden: (v) => Boolean(roleByKey.get(String(v.role))?.nationwide),
      },
      { key: "email", label: "E-posta", kind: "email", placeholder: "ornek@mail.com" },
      { key: "phone", label: "Telefon", kind: "phone", placeholder: "0555..." },
      {
        key: "status",
        label: "Hesap durumu",
        kind: "segment",
        options: [
          { value: "active", label: "Aktif" },
          { value: "suspended", label: "Askıda" },
        ],
      },
    ];
  }, [editing, cities.data, assignable, roleList, roleByKey]);

  const initial: FormValues =
    editing && editing !== "new"
      ? {
          username: editing.username,
          fullName: editing.fullName ?? "",
          title: editing.title ?? "",
          email: editing.email ?? "",
          phone: editing.phone ?? "",
          role: editing.role,
          city: editing.city ?? "",
          status: editing.status === "suspended" ? "suspended" : "active",
        }
      : { role: assignable[0]?.key ?? "editor", status: "active" };

  const counts = list.data?.roleCounts ?? {};
  const roleFilters = [
    { key: "all", label: "Tüm roller", count: list.data?.users.length },
    ...roleList.map((r) => ({ key: r.key, label: r.label, count: counts[r.key] ?? r.userCount })),
  ];

  const askDelete = async (item: ManagementUser) => {
    const ok = await confirmAction({
      title: "Hesap silinsin mi?",
      message: `@${item.username} yönetim hesabı kalıcı olarak silinecek.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate(item);
  };

  const askStatus = async (item: ManagementUser) => {
    const next: ManagementStatus = item.status === "suspended" ? "active" : "suspended";
    const ok = await confirmAction({
      title: next === "suspended" ? "Hesap askıya alınsın mı?" : "Hesap etkinleştirilsin mi?",
      message:
        next === "suspended"
          ? `@${item.username} panele giriş yapamaz; kayıtları ve yetkileri korunur.`
          : `@${item.username} yeniden giriş yapabilir.`,
      confirmLabel: next === "suspended" ? "Askıya al" : "Etkinleştir",
      destructive: next === "suspended",
    });
    if (ok) setStatusMutation.mutate({ item, status: next });
  };

  return (
    <AdminScreen
      title="Yönetim kullanıcıları"
      permission={PERMS}
      scroll={false}
      overlay={
        canCreate ? (
          <FAB icon="person-add-outline" label="Yeni hesap" extended onPress={() => setEditing("new")} accessibilityLabel="Yeni yönetim hesabı" />
        ) : null
      }
    >
      <AdminList
        data={visible}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        refreshing={list.isRefetching}
        onRefresh={() => {
          void list.refetch();
          void roles.refetch();
        }}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Ad, kullanıcı adı, e-posta ara"
        filters={roleFilters}
        filter={role}
        onFilter={setRole}
        extraHeader={
          <View style={styles.header}>
            <SegmentedControl items={STATUS_ITEMS} value={status} onChange={setStatus} size="sm" />
            {list.data ? (
              <StatRow
                items={[
                  { label: "Yönetim hesabı", value: list.data.users.length },
                  { label: "Admin", value: counts.admin ?? 0 },
                  { label: "Editör", value: counts.editor ?? 0 },
                  { label: "İl yöneticisi", value: counts.il_yoneticisi ?? 0 },
                ]}
              />
            ) : null}
          </View>
        }
        summary={list.data ? `${visible.length} hesap` : null}
        keyExtractor={(item) => String(item.id)}
        emptyIcon="id-card-outline"
        emptyTitle={list.data?.users.length ? "Eşleşen hesap yok" : "Henüz yönetim hesabı açılmadı"}
        emptyBody={list.data?.users.length ? "Aramayı ya da süzgeci değiştir." : undefined}
        renderItem={({ item }) => (
          <RecordCard
            title={item.fullName || item.username}
            subtitle={item.title || `@${item.username}`}
            meta={[
              item.title ? `@${item.username}` : null,
              item.nationwide ? "Türkiye geneli" : item.city || "İl yok",
              item.createdAt ? formatDate(item.createdAt) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            avatar={{ name: item.fullName || item.username }}
            muted={item.status === "suspended"}
            badges={[
              { label: item.roleLabel, tone: item.role === "admin" ? "accent" : "brand" },
              {
                label: MANAGEMENT_STATUS_LABELS[item.status as ManagementStatus] ?? String(item.status),
                tone: item.status === "suspended" ? "danger" : "win",
              },
            ]}
            onPress={() => setActionFor(item)}
          />
        )}
      />

      <ActionSheet
        visible={actionFor != null}
        onClose={() => setActionFor(null)}
        title={actionFor ? actionFor.fullName || `@${actionFor.username}` : undefined}
        actions={
          actionFor
            ? [
                { label: "Düzenle", icon: "create-outline", hidden: !canUpdate, onPress: () => setEditing(actionFor) },
                {
                  label: "Yetkiler",
                  hint: "Kişiye özel yetkiler ve ünvan",
                  icon: "key-outline",
                  hidden: !canAccess || actionFor.role === "admin",
                  onPress: () => router.push(`/yonetim/yetki/kisi/${actionFor.id}` as never),
                },
                {
                  label: "Şifre belirle",
                  hint: "Yeni şifreyi hesabın sahibine ilet",
                  icon: "lock-closed-outline",
                  hidden: !canPassword,
                  onPress: () => setPasswordFor(actionFor),
                },
                {
                  label: actionFor.status === "suspended" ? "Etkinleştir" : "Askıya al (pasifleştir)",
                  icon: actionFor.status === "suspended" ? "play-circle-outline" : "pause-circle-outline",
                  hidden: !canUpdate || actionFor.id === user?.id,
                  onPress: () => void askStatus(actionFor),
                },
                {
                  label: "Hesabı sil",
                  icon: "trash-outline",
                  danger: true,
                  hidden: !canDelete || actionFor.id === user?.id,
                  onPress: () => void askDelete(actionFor),
                },
              ]
            : []
        }
      />

      <FormSheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Yeni yönetim hesabı" : editing ? `@${editing.username} düzenle` : ""}
        intro={
          editing === "new"
            ? "Hesap rolünün başlangıç yetkileriyle açılır; sonrası Kullanıcı yetkilendirme ekranından kişi kişi düzenlenir."
            : undefined
        }
        fields={fields}
        initial={initial}
        submitLabel={editing === "new" ? "Hesabı oluştur" : "Kaydet"}
        onSubmit={(values) => save.mutateAsync(values)}
      />

      <FormSheet
        visible={passwordFor != null}
        onClose={() => setPasswordFor(null)}
        title={passwordFor ? `@${passwordFor.username} için yeni şifre` : ""}
        intro="Şifre burada bir kez görünür; kaydettikten sonra hesabın sahibine ilet."
        snap="content"
        fields={[{ key: "password", label: "Yeni şifre", kind: "password", required: true, placeholder: "En az 8 karakter, harf ve rakam" }]}
        initial={{}}
        submitLabel="Şifreyi kaydet"
        onSubmit={(values) => password.mutateAsync({ id: passwordFor!.id, password: String(values.password ?? "") })}
      />
    </AdminScreen>
  );
}

function trimOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
});
