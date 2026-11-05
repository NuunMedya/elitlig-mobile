/**
 * KULLANICI YETKİLENDİRME — kişi bazlı yetkiler ve roller/şablonlar
 * (web pages/management/UserPermissions.js + RolePermissions.js).
 *
 * İKİ SEKME:
 *   KİŞİLER  yönetim kullanıcıları (arama, rol çipleri). Kişiye dokununca
 *            yetki düzenleyici açılır (/yonetim/yetki/kisi/:id). "Seç" ile
 *            birden çok kişi işaretlenir ve toplu yetkilendirmeye geçilir
 *            (/yonetim/yetki/toplu?ids=...).
 *   ROLLER   yönetim ve üye rolleri; role dokununca şablon düzenleyici
 *            (/yonetim/yetki/rol/:key). "Karşılaştır" rollerin modül modül
 *            açık yetki sayısını yan yana gösterir. Yeni rol: permissions.roles.
 *
 * permissions.manage yoksa ekran salt okunurdur: kişi ve rol açılır ama
 * anahtarlar kilitli ve kaydet çubuğu çıkmaz (asıl denetim sunucuda).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, Panel, RecordCard, StatRow } from "@/components/admin";
import { RoleSettingsSheet } from "@/components/admin/system/RoleSheets";
import { BottomSheet, Button, FAB, Tabs, useToast, withAlpha } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import {
  ACCESS_SOURCE_LABELS,
  ROLE_FALLBACK_COLOR,
  createRole,
  getAccessPayload,
  getRoleMatrix,
  systemKeys,
  type AccessUser,
  type RoleRecord,
} from "@/lib/api/admin/system";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["permissions.view", "permissions.manage"];
type Tab = "people" | "roles";

const fold = (text: string) => text.toLocaleLowerCase("tr-TR");

export default function PermissionsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ sekme?: string }>();
  const user = auth.user;
  const canSeeRoles = hasAnyPermission(user, ["permissions.view", "permissions.roles"]);
  const canShape = hasAnyPermission(user, ["permissions.roles"]);
  const canManage = hasAnyPermission(user, ["permissions.manage"]);

  const [tab, setTab] = useState<Tab>(params.sekme === "roller" && canSeeRoles ? "roles" : "people");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [roleQ, setRoleQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [comparing, setComparing] = useState(false);

  const access = useQuery({ queryKey: systemKeys.access, queryFn: getAccessPayload, enabled: tab === "people" });
  const matrix = useQuery({ queryKey: systemKeys.roles, queryFn: getRoleMatrix, enabled: tab === "roles" && canSeeRoles });

  const total = useMemo(() => (access.data?.groups ?? []).reduce((s, g) => s + g.permissions.length, 0), [access.data]);
  const people = useMemo(() => {
    const needle = fold(q.trim());
    return (access.data?.users ?? []).filter(
      (p) =>
        (role === "all" || p.role === role) &&
        (!needle || fold([p.name, p.username, p.title, p.roleLabel, p.city, p.email].filter(Boolean).join(" ")).includes(needle))
    );
  }, [access.data, q, role]);

  const roleTotal = useMemo(() => (matrix.data?.groups ?? []).reduce((s, g) => s + g.permissions.length, 0), [matrix.data]);
  const roleRows = useMemo(() => {
    const needle = fold(roleQ.trim());
    const list = (matrix.data?.roles ?? []).filter((r) => !needle || fold(`${r.label} ${r.key}`).includes(needle));
    // Yönetim rolleri önce; üye rolleri ayrı başlık altında (web ile aynı).
    return [...list.filter((r) => r.isManagement), ...list.filter((r) => !r.isManagement)];
  }, [matrix.data, roleQ]);

  const toggle = (person: AccessUser) => {
    if (!person.editable) {
      toast.show({ message: person.lockReason || "Bu kişinin yetkileri değiştirilemez.", tone: "warn" });
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(person.id)) next.delete(person.id);
      else if (next.size < (access.data?.maxBatch ?? 200)) next.add(person.id);
      return next;
    });
  };

  const openPerson = (person: AccessUser) => {
    if (selecting) toggle(person);
    else router.push(`/yonetim/yetki/kisi/${person.id}` as never);
  };

  const selectableVisible = people.filter((p) => p.editable);
  const allChecked = selectableVisible.length > 0 && selectableVisible.every((p) => picked.has(p.id));

  const personal = (access.data?.users ?? []).filter((u) => u.source === "personal").length;
  const titled = (access.data?.users ?? []).filter((u) => u.title).length;

  const tabs = [
    { key: "people" as Tab, label: "Kişiler" },
    ...(canSeeRoles ? [{ key: "roles" as Tab, label: "Roller ve şablonlar" }] : []),
  ];

  const overlay =
    tab === "people" ? (
      selecting && picked.size ? (
        <FAB
          icon="people-outline"
          label={`${picked.size} kişiyi yetkilendir`}
          extended
          onPress={() => router.push(`/yonetim/yetki/toplu?ids=${[...picked].join(",")}` as never)}
          accessibilityLabel="Seçili kişileri toplu yetkilendir"
        />
      ) : null
    ) : canShape ? (
      <FAB icon="add" label="Yeni rol" extended onPress={() => setCreating(true)} accessibilityLabel="Yeni rol" />
    ) : null;

  return (
    <AdminScreen
      title="Kullanıcı yetkilendirme"
      permission={PERMS}
      scroll={false}
      bottom={tabs.length > 1 ? <Tabs items={tabs} value={tab} onChange={setTab} distribute="equal" /> : undefined}
      actions={
        tab === "people" && canManage
          ? [
              {
                icon: selecting ? "close" : "checkbox-outline",
                accessibilityLabel: selecting ? "Seçimi bitir" : "Toplu seçim",
                onPress: () => {
                  setSelecting((v) => !v);
                  setPicked(new Set());
                },
              },
            ]
          : tab === "roles"
            ? [{ icon: "git-compare-outline", accessibilityLabel: "Rolleri karşılaştır", onPress: () => setComparing(true) }]
            : undefined
      }
      overlay={overlay}
    >
      {tab === "people" ? (
        <AdminList
          data={people}
          loading={access.isLoading}
          error={access.error}
          onRetry={access.refetch}
          refreshing={access.isRefetching}
          onRefresh={access.refetch}
          search={q}
          onSearch={setQ}
          searchPlaceholder="Ad, ünvan, rol, il ara"
          filters={[{ key: "all", label: "Tüm roller" }, ...(access.data?.roles ?? []).map((r) => ({ key: r.key, label: r.label }))]}
          filter={role}
          onFilter={setRole}
          extraHeader={
            <View style={styles.gap}>
              {access.data ? (
                <StatRow
                  items={[
                    { label: "Yönetim kullanıcısı", value: access.data.users.length },
                    { label: "Kişiye özel", value: personal },
                    { label: "Ünvanlı", value: titled },
                    { label: "Yetki", value: total },
                  ]}
                />
              ) : null}
              {access.data && !access.data.canManage ? (
                <Notice text="Yetkileri yalnız görüntüleyebilirsin; değiştirmek için “Kişilere yetki ve ünvan verme” yetkisi gerekir." />
              ) : null}
              {selecting ? (
                <View style={styles.selectBar}>
                  <Text style={styles.selectText} {...textScale.dense}>
                    {picked.size ? `${picked.size} kişi seçili` : "Toplu yetkilendirme için kişileri işaretle"}
                  </Text>
                  <Button
                    label={allChecked ? "Seçimi kaldır" : "Görünenleri seç"}
                    size="sm"
                    variant="ghost"
                    disabled={!selectableVisible.length}
                    onPress={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (allChecked) selectableVisible.forEach((p) => next.delete(p.id));
                        else selectableVisible.slice(0, access.data?.maxBatch ?? 200).forEach((p) => next.add(p.id));
                        return next;
                      })
                    }
                  />
                </View>
              ) : null}
            </View>
          }
          summary={access.data ? `${people.length} kişi` : null}
          keyExtractor={(item) => String(item.id)}
          emptyIcon="people-outline"
          emptyTitle={access.data?.users.length ? "Eşleşen kişi yok" : "Henüz yönetim kullanıcısı yok"}
          renderItem={({ item }) => {
            const checked = picked.has(item.id);
            return (
              <RecordCard
                title={item.name}
                subtitle={item.title || item.roleLabel}
                meta={[item.title ? item.roleLabel : null, item.nationwide ? "Türkiye geneli" : item.city || "İl yok"].filter(Boolean).join(" · ")}
                avatar={{ name: item.name }}
                value={item.source === "full" ? "Tümü" : `${item.permissions.length}/${total}`}
                badges={[
                  { label: ACCESS_SOURCE_LABELS[item.source] ?? item.source, tone: item.source === "personal" ? "accent" : "neutral" },
                  item.status === "suspended" ? { label: "Askıda", tone: "warn" } : null,
                  !item.editable ? { label: "Kilitli", tone: "neutral", icon: "lock-closed-outline" } : null,
                ]}
                onPress={() => openPerson(item)}
                onLongPress={canManage ? () => (setSelecting(true), toggle(item)) : undefined}
                trailing={
                  selecting ? (
                    <Ionicons
                      name={checked ? "checkbox" : "square-outline"}
                      size={22}
                      color={checked ? colors.brandAccent : item.editable ? colors.textTertiary : colors.textDisabled}
                    />
                  ) : undefined
                }
              />
            );
          }}
        />
      ) : (
        <AdminList
          data={roleRows}
          loading={matrix.isLoading}
          error={matrix.error}
          onRetry={matrix.refetch}
          refreshing={matrix.isRefetching}
          onRefresh={matrix.refetch}
          search={roleQ}
          onSearch={setRoleQ}
          searchPlaceholder="Rol ara"
          extraHeader={
            <View style={styles.gap}>
              {matrix.data ? (
                <StatRow
                  items={[
                    { label: "Yönetim rolü", value: matrix.data.roles.filter((r) => r.isManagement).length },
                    { label: "Özel rol", value: matrix.data.roles.filter((r) => r.custom).length },
                    { label: "Yetki", value: roleTotal },
                    {
                      label: "Yönetim hesabı",
                      value: matrix.data.roles.filter((r) => r.isManagement).reduce((s, r) => s + (r.userCount || 0), 0),
                    },
                  ]}
                />
              ) : null}
              <Notice text="Rol şablonu yalnız yeni açılan hesaplara başlangıç yetkisi olarak kopyalanır; şablonu değiştirmek mevcut kişilerin yetkilerini değiştirmez. Rolün kapsamı (il / Türkiye geneli) o roldeki herkes için geçerlidir." />
            </View>
          }
          keyExtractor={(item) => item.key}
          emptyIcon="layers-outline"
          emptyTitle="Eşleşen rol yok"
          renderItem={({ item, index }) => (
            <View style={styles.gap}>
              {index === 0 || item.isManagement !== roleRows[index - 1]?.isManagement ? (
                <Text style={styles.section} {...textScale.dense}>
                  {item.isManagement ? "YÖNETİM ROLLERİ" : "ÜYE ROLLERİ"}
                </Text>
              ) : null}
              <RecordCard
                title={item.label}
                subtitle={item.description || (item.custom ? "Panelden eklenen rol" : "Yerleşik rol")}
                meta={`${item.userCount} kişi${item.isManagement ? ` · ${item.nationwide ? "Türkiye geneli" : "İl bazlı"}` : ""}`}
                accentColor={item.color || ROLE_FALLBACK_COLOR}
                value={item.editable ? `${item.permissions.length}/${roleTotal}` : "Tümü"}
                badges={[
                  item.custom ? { label: "Özel", tone: "accent" } : null,
                  !item.custom && item.customized ? { label: "Düzenlendi", tone: "info" } : null,
                  item.editable && !item.isDefault && item.isSystem ? { label: "Özelleştirilmiş yetkiler", tone: "warn" } : null,
                ]}
                onPress={() => router.push(`/yonetim/yetki/rol/${encodeURIComponent(item.key)}` as never)}
              />
            </View>
          )}
        />
      )}

      {matrix.data ? (
        <RoleSettingsSheet
          visible={creating}
          onClose={() => setCreating(false)}
          mode="create"
          roles={matrix.data.roles}
          homePaths={matrix.data.homePaths}
          canNationwide={user?.role === "admin"}
          onSubmit={async (payload) => {
            const result = await createRole(payload).catch((e) => {
              throw new Error(errorText(e));
            });
            await queryClient.invalidateQueries({ queryKey: systemKeys.roles });
            toast.show({ message: result.message || "Rol oluşturuldu.", tone: "success" });
            if (result.role?.key) router.push(`/yonetim/yetki/rol/${encodeURIComponent(result.role.key)}` as never);
          }}
        />
      ) : null}

      <CompareSheet visible={comparing} onClose={() => setComparing(false)} roles={matrix.data?.roles ?? []} groups={matrix.data?.groups ?? []} />
    </AdminScreen>
  );
}

/** Rolleri karşılaştır — web RoleCompare tablosunun mobil hâli: modül başına her rolün açık/toplam sayısı. */
function CompareSheet({
  visible,
  onClose,
  roles,
  groups,
}: {
  visible: boolean;
  onClose: () => void;
  roles: RoleRecord[];
  groups: { key: string; label: string; permissions: { key: string }[] }[];
}) {
  const management = roles.filter((r) => r.isManagement);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Rolleri karşılaştır" snap="full">
      <View style={styles.gap}>
        {groups.map((group) => (
          <Panel key={group.key} title={group.label}>
            {management.map((r) => {
              const keys = group.permissions.map((p) => p.key);
              const on = r.editable ? keys.filter((k) => r.permissions.includes(k)).length : keys.length;
              return (
                <View key={r.key} style={styles.compareRow}>
                  <View style={[styles.dot, { backgroundColor: r.color || ROLE_FALLBACK_COLOR }]} />
                  <Text style={styles.compareLabel} numberOfLines={1} {...textScale.dense}>
                    {r.label}
                  </Text>
                  <View style={styles.compareTrack}>
                    <View
                      style={[
                        styles.compareFill,
                        { width: `${keys.length ? (on / keys.length) * 100 : 0}%`, backgroundColor: withAlpha(r.color || ROLE_FALLBACK_COLOR, 0.85) },
                      ]}
                    />
                  </View>
                  <Text style={styles.compareValue} {...textScale.badge}>
                    {on}/{keys.length}
                  </Text>
                </View>
              );
            })}
          </Panel>
        ))}
      </View>
    </BottomSheet>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Ionicons name="information-circle-outline" size={16} color={colors.info} />
      <Text style={styles.noticeText} {...textScale.long}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.sm },
  selectBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  selectText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  notice: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.infoDim,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  noticeText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  compareRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xxs },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  compareLabel: { ...type.bodySm, color: colors.textPrimary, width: 110 },
  compareTrack: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  compareFill: { height: 6, borderRadius: radius.pill },
  compareValue: { ...type.numSmStrong, color: colors.textSecondary, minWidth: 40, textAlign: "right" },
});
