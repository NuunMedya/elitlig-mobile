/**
 * Yetki düzenleme görünümleri — /yonetim/yetki/... rotalarının gövdesi.
 *
 *   PersonAccessView  tek kişinin yetkileri ve ünvanı (web access/PersonAccessPanel.js)
 *   RoleTemplateView  bir rolün ayarları ve yetki şablonu (web RolePermissions.js)
 *   BulkAccessView    işaretlenen kişilere toplu yetki/ünvan (web access/BulkAccessPanel.js)
 *
 * Hepsi taslak tutar; değişiklik varsa altta SaveBar çıkar. Yetki yoksa
 * (permissions.manage) ya da kayıt kilitliyse anahtarlar salt okunurdur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { InfoLine, OptionSheet, Panel, confirmAction, useAdminMutation } from "@/components/admin";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  ListRow,
  SegmentedControl,
  SkeletonCard,
  Toggle,
  Touchable,
  refreshControlProps,
  useToast,
} from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import {
  ACCESS_SOURCE_LABELS,
  BULK_MODES,
  ROLE_FALLBACK_COLOR,
  bulkAccess,
  createRole,
  deleteRole,
  diffPermissions,
  getAccessPayload,
  getRoleMatrix,
  getRoleUsers,
  previewBulk,
  resetRoleDetails,
  resetRolePermissions,
  sameSet,
  saveRolePermissions,
  saveUserAccess,
  systemKeys,
  updateRole,
  type AccessSaveBody,
  type AccessUser,
  type BulkMode,
  type PermissionGroup,
} from "@/lib/api/admin/system";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

import { PermissionEditor } from "./PermissionEditor";
import { DeleteRoleSheet, RoleSettingsSheet } from "./RoleSheets";
import { SaveBar } from "./SaveBar";

/** Ekranın altındaki kaydet çubuğu içeriği örtmesin. */
export const SAVEBAR_SPACE = 120;

const labelMap = (groups: PermissionGroup[]) => new Map(groups.flatMap((g) => g.permissions.map((p) => [p.key, p.label] as const)));

const changeList = (diff: { added: string[]; removed: string[] }, labels: Map<string, string>) => [
  ...diff.added.map((k) => `+ ${labels.get(k) ?? k}`),
  ...diff.removed.map((k) => `− ${labels.get(k) ?? k}`),
];

function Notice({ icon = "information-circle-outline", text, tone = "info" }: { icon?: keyof typeof Ionicons.glyphMap; text: string; tone?: "info" | "warn" }) {
  return (
    <View style={[styles.notice, tone === "warn" ? styles.noticeWarn : null]}>
      <Ionicons name={icon} size={16} color={tone === "warn" ? colors.warn : colors.info} />
      <Text style={styles.noticeText} {...textScale.long}>
        {text}
      </Text>
    </View>
  );
}

/** Kaydırılan gövde + altta sabit kaydet çubuğu (AdminScreen scroll={false} içinde). */
function Body({
  children,
  bar,
  refreshing = false,
  onRefresh,
}: {
  children: React.ReactNode;
  bar?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => unknown;
}) {
  return (
    <View style={styles.fill}>
      <ScrollView
        contentContainerStyle={[styles.content, bar ? { paddingBottom: SAVEBAR_SPACE + space.xl } : null]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl {...refreshControlProps(refreshing, () => void onRefresh())} /> : undefined}
      >
        <View style={styles.gap}>{children}</View>
      </ScrollView>
      {bar}
    </View>
  );
}

function Loading({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  if (error) return <ErrorState error={error} onRetry={onRetry} variant="inline" />;
  return (
    <View style={styles.gap}>
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

/* ═══════════════════════════ KİŞİ ═══════════════════════════ */

export function usePersonAccess(id: number) {
  const query = useQuery({ queryKey: systemKeys.access, queryFn: getAccessPayload });
  const person = query.data?.users.find((u) => u.id === id) ?? null;
  return { query, person };
}

export function PersonAccessView({ id }: { id: number }) {
  const auth = useAuth();
  const { query, person } = usePersonAccess(id);
  const data = query.data;
  const canManage = Boolean(data?.canManage) && hasAnyPermission(auth.user, ["permissions.manage"]);

  const [perms, setPerms] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [copySource, setCopySource] = useState<AccessUser | null>(null);
  const [picker, setPicker] = useState<"user" | "role" | null>(null);

  // Kişi değişince ya da kayıt sunucudan güncel hâliyle dönünce taslak sıfırlanır.
  // Bağımlılık içerik imzasıdır: arka plan tazelemesi aynı veriyi getirirse taslak silinmez.
  const personSig = person ? `${person.id}|${[...person.permissions].sort().join(",")}|${person.title ?? ""}` : "";
  useEffect(() => {
    setPerms([...(person?.permissions ?? [])]);
    setTitle(person?.title ?? "");
    setCopySource(null);
  }, [personSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAdminMutation((body: AccessSaveBody) => saveUserAccess(id, body), {
    success: (r) => r.message || "Kaydedildi.",
    invalidate: [systemKeys.access, systemKeys.managementUsers],
  });

  const groups = data?.groups ?? [];
  const labels = useMemo(() => labelMap(groups), [groups]);
  const template = data?.roles.find((r) => r.key === person?.role) ?? null;
  const readOnly = !canManage || !person?.editable;
  const permsDirty = !readOnly && Boolean(person) && !sameSet(perms, person!.permissions);
  const titleDirty = canManage && Boolean(person?.titleEditable) && title.trim() !== (person?.title ?? "");
  const diff = useMemo(() => diffPermissions(perms, person?.permissions ?? []), [perms, person]);

  const setDraft = (next: string[]) => {
    setPerms(next);
    // Elle değiştirilen liste artık birebir kopya değildir.
    if (copySource && !sameSet(next, copySource.permissions)) setCopySource(null);
  };

  const submit = () => {
    const body: AccessSaveBody = {};
    if (titleDirty) body.title = title.trim() || null;
    if (permsDirty) {
      if (copySource && sameSet(perms, copySource.permissions)) body.copyFromUserId = copySource.id;
      else body.permissions = perms;
    }
    if (Object.keys(body).length) save.mutate(body);
  };

  const bar =
    person && (permsDirty || titleDirty) ? (
      <SaveBar
        title={person.name}
        added={diff.added.length}
        removed={diff.removed.length}
        extra={titleDirty ? `Ünvan: ${title.trim() || "kaldırılacak"}` : null}
        changes={changeList(diff, labels)}
        saving={save.isPending}
        onCancel={() => {
          setPerms([...person.permissions]);
          setTitle(person.title ?? "");
          setCopySource(null);
        }}
        onSave={submit}
      />
    ) : null;


  if (!data || (!person && query.isLoading)) return <Body><Loading error={query.error} onRetry={query.refetch} /></Body>;
  if (!person) return <Body><EmptyState icon="person-outline" title="Kişi bulunamadı" body="Bu yönetim kullanıcısı silinmiş ya da kapsamın dışında." variant="inline" /></Body>;

  const titleSuggestions = data.titles.filter((t) => t !== title && (!title.trim() || t.toLocaleLowerCase("tr-TR").includes(title.trim().toLocaleLowerCase("tr-TR")))).slice(0, 8);

  return (
    <Body bar={bar} refreshing={query.isRefetching} onRefresh={query.refetch}>
      <Panel>
        <View style={styles.head}>
          <Avatar name={person.name} size={48} />
          <View style={styles.headText}>
            <Text style={styles.name} {...textScale.dense}>
              {person.name}
            </Text>
            {person.title ? (
              <Text style={styles.sub} {...textScale.dense}>
                {person.title}
              </Text>
            ) : null}
            <View style={styles.badges}>
              <Badge label={`@${person.username}`} size="xs" />
              <Badge label={person.roleLabel} tone="brand" size="xs" />
              <Badge label={person.nationwide ? "Türkiye geneli" : person.city || "İl yok"} icon={person.nationwide ? "earth-outline" : "location-outline"} size="xs" />
              <Badge label={ACCESS_SOURCE_LABELS[person.source] ?? person.source} tone={person.source === "personal" ? "accent" : "neutral"} size="xs" />
              {person.status === "suspended" ? <Badge label="Askıda" tone="warn" size="xs" /> : null}
            </View>
            {person.copiedFrom ? (
              <Text style={styles.meta} {...textScale.dense}>
                Kopyalandı: {person.copiedFrom.name || `#${person.copiedFrom.id}`}
              </Text>
            ) : null}
          </View>
        </View>
      </Panel>

      {person.lockReason ? <Notice icon="lock-closed-outline" text={person.lockReason} tone="warn" /> : null}
      {!canManage ? <Notice text="Yetkileri yalnız görüntüleyebilirsin; değiştirmek için “Kişilere yetki ve ünvan verme” yetkisi gerekir." /> : null}

      <Panel title="Ünvan">
        <Input
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          editable={canManage && person.titleEditable}
          placeholder="Örn. Ankara İl Temsilcisi, Basın Sorumlusu"
          hint="Ünvan panelde kişinin adının yanında görünür; yetkileri değiştirmez."
        />
        {canManage && person.titleEditable && titleSuggestions.length ? (
          <ChipGroup scrollable contentPadding={0}>
            {titleSuggestions.map((t) => (
              <Chip key={t} label={t} size="sm" onPress={() => setTitle(t)} />
            ))}
          </ChipGroup>
        ) : null}
      </Panel>

      {!readOnly ? (
        <Panel title="Şu kullanıcıyla aynı yetkiler">
          {copySource ? (
            <View style={styles.copied}>
              <Ionicons name="copy-outline" size={16} color={colors.brandAccent} />
              <Text style={styles.copiedText} {...textScale.long}>
                <Text style={styles.bold}>{copySource.name}</Text> kullanıcısının {copySource.permissions.length} yetkisi uygulandı. Kaydedince geçerli olur.
              </Text>
              <Button
                label="Geri al"
                size="sm"
                variant="ghost"
                onPress={() => {
                  setPerms([...person.permissions]);
                  setCopySource(null);
                }}
              />
            </View>
          ) : (
            <Text style={styles.hint} {...textScale.long}>
              Bir kişi seç; o kişinin bugünkü yetkileri buraya kopyalanır. Kopya bağ değildir, sonradan ayrı ayrı değişebilir.
            </Text>
          )}
          <Button label="Kullanıcı seç" icon="people-outline" variant="secondary" size="sm" onPress={() => setPicker("user")} />
        </Panel>
      ) : null}

      <PermissionEditor
        groups={groups}
        draft={readOnly ? person.permissions : perms}
        onChange={setDraft}
        readOnly={readOnly}
        baseline={template ? { permissions: template.templatePermissions, label: "Şablondan farklı" } : null}
        extraActions={[
          { label: "Rol şablonunu uygula", icon: "layers-outline", onPress: () => setPicker("role") },
          ...(template ? [{ label: "Rol şablonuna döndür", icon: "refresh-outline" as const, onPress: () => setDraft([...template.templatePermissions]) }] : []),
        ]}
      />

      <OptionSheet<number>
        visible={picker === "user"}
        onClose={() => setPicker(null)}
        title="Yetkileri kopyalanacak kullanıcı"
        searchable
        options={data.users
          .filter((u) => u.id !== person.id)
          .map((u) => ({
            value: u.id,
            label: u.name,
            hint: [u.title, u.roleLabel, u.source === "full" ? "Tüm yetkiler" : `${u.permissions.length} yetki`].filter(Boolean).join(" · "),
          }))}
        onSelect={(value) => {
          const source = data.users.find((u) => u.id === value);
          if (source) {
            setPerms([...source.permissions]);
            setCopySource(source);
          }
        }}
      />
      <OptionSheet<string>
        visible={picker === "role"}
        onClose={() => setPicker(null)}
        title="Rol şablonunu uygula"
        options={data.roles
          .filter((r) => r.key !== "admin")
          .map((r) => ({ value: r.key, label: r.label, hint: `${r.templatePermissions.length} yetki` }))}
        onSelect={(value) => {
          const role = data.roles.find((r) => r.key === value);
          if (role) setDraft([...role.templatePermissions]);
        }}
      />
    </Body>
  );
}

/* ═══════════════════════════ ROL ═══════════════════════════ */

export function RoleTemplateView({ roleKey }: { roleKey: string }) {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: systemKeys.roles, queryFn: getRoleMatrix });
  const data = query.data;
  const role = data?.roles.find((r) => r.key === roleKey) ?? null;
  const canManage = hasAnyPermission(auth.user, ["permissions.manage"]);
  const canShape = hasAnyPermission(auth.user, ["permissions.roles"]);
  const isAdmin = auth.user?.role === "admin";

  const [draft, setDraft] = useState<string[]>([]);
  const [dialog, setDialog] = useState<"edit" | "copy" | "delete" | "users" | "copyFrom" | null>(null);

  const roleSig = role ? `${role.key}|${[...role.permissions].sort().join(",")}` : "";
  useEffect(() => {
    setDraft([...(role?.permissions ?? [])]);
  }, [roleSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const users = useQuery({
    queryKey: systemKeys.roleUsers(roleKey),
    queryFn: () => getRoleUsers(roleKey),
    enabled: dialog === "users",
  });

  const invalidate = [systemKeys.roles, systemKeys.access];
  const save = useAdminMutation((perms: string[]) => saveRolePermissions(roleKey, perms), {
    success: (r) => r.message || "Yetkiler kaydedildi.",
    invalidate,
  });
  const reset = useAdminMutation((_: void) => resetRolePermissions(roleKey), {
    success: (r) => r.message || "Varsayılan yetkilere döndürüldü.",
    invalidate,
  });
  const resetDetails = useAdminMutation((_: void) => resetRoleDetails(roleKey), {
    success: (r) => r.message || "Rol varsayılana döndürüldü.",
    invalidate,
  });

  const groups = data?.groups ?? [];
  const labels = useMemo(() => labelMap(groups), [groups]);
  const readOnly = !canManage || !role?.editable;
  const dirty = !readOnly && Boolean(role) && !sameSet(draft, role!.permissions);
  const diff = useMemo(() => diffPermissions(draft, role?.permissions ?? []), [draft, role]);

  const bar =
    role && dirty ? (
      <SaveBar
        title={`${diff.added.length + diff.removed.length} değişiklik`}
        added={diff.added.length}
        removed={diff.removed.length}
        changes={changeList(diff, labels)}
        saving={save.isPending}
        onCancel={() => setDraft([...role.permissions])}
        onSave={() => save.mutate(draft)}
        saveLabel="Yetkileri kaydet"
      />
    ) : null;


  if (!data) return <Body><Loading error={query.error} onRetry={query.refetch} /></Body>;
  if (!role) return <Body><EmptyState icon="layers-outline" title="Rol bulunamadı" body="Bu rol silinmiş olabilir." variant="inline" /></Body>;

  const homeLabel = data.homePaths.find((p) => p.path === role.homePath)?.label ?? role.homePath;

  const askReset = async () => {
    const ok = await confirmAction({
      title: "Varsayılana döndürülsün mü?",
      message: `${role.label} rolünün yetkileri varsayılan demetine döner.`,
      confirmLabel: "Döndür",
      destructive: true,
    });
    if (ok) reset.mutate();
  };
  const askResetDetails = async () => {
    const ok = await confirmAction({
      title: "Rol ayarları sıfırlansın mı?",
      message: `${role.label} rolünün adı, açıklaması, kapsamı ve giriş sayfası varsayılana döner.`,
      confirmLabel: "Sıfırla",
    });
    if (ok) resetDetails.mutate();
  };

  const asSheetError = (e: unknown): never => {
    throw new Error(errorText(e));
  };

  return (
    <Body bar={bar} refreshing={query.isRefetching} onRefresh={query.refetch}>
      <Panel>
        <View style={styles.head}>
          <View style={[styles.roleColor, { backgroundColor: role.color || ROLE_FALLBACK_COLOR }]} />
          <View style={styles.headText}>
            <Text style={styles.name} {...textScale.dense}>
              {role.label}
            </Text>
            <Text style={styles.sub} {...textScale.long}>
              {role.description || (role.custom ? "Panelden eklenen rol." : "Yerleşik rol.")}
            </Text>
            <View style={styles.badges}>
              <Badge label={role.key} size="xs" />
              <Badge
                label={role.isManagement ? (role.nationwide ? "Türkiye geneli" : "İl bazlı") : "Üye rolü"}
                icon={role.nationwide ? "earth-outline" : "location-outline"}
                size="xs"
              />
              <Badge label={role.custom ? "Özel rol" : "Yerleşik"} tone={role.custom ? "accent" : "neutral"} size="xs" />
              {role.editable ? <Badge label={role.isDefault ? "Varsayılan yetkiler" : "Özelleştirilmiş yetkiler"} tone="info" size="xs" /> : null}
            </View>
          </View>
        </View>
        {role.isManagement && role.homePath ? <InfoLine label="Giriş sayfası" value={homeLabel ?? "—"} /> : null}
        <Touchable onPress={() => setDialog("users")} style={styles.usersLink} accessibilityRole="button">
          <Ionicons name="people-outline" size={16} color={colors.brandAccent} />
          <Text style={styles.link} {...textScale.dense}>
            {role.userCount} kullanıcı
          </Text>
        </Touchable>
        {canShape ? (
          <ChipGroup scrollable contentPadding={0}>
            <Chip label="Düzenle" icon="create-outline" size="sm" onPress={() => setDialog("edit")} />
            {role.isManagement && role.key !== "admin" ? <Chip label="Kopyala" icon="copy-outline" size="sm" onPress={() => setDialog("copy")} /> : null}
            {role.customized && !role.custom ? <Chip label="Adı / kapsamı sıfırla" icon="refresh-outline" size="sm" onPress={() => void askResetDetails()} /> : null}
            {role.deletable ? <Chip label="Sil" icon="trash-outline" tone="danger" size="sm" onPress={() => setDialog("delete")} /> : null}
          </ChipGroup>
        ) : null}
      </Panel>

      {!role.editable ? (
        <Notice icon="lock-closed-outline" text={`${role.label} tüm yetkilere sahiptir ve kısıtlanamaz.`} />
      ) : !canManage ? (
        <Notice text="Şablonu yalnız görüntüleyebilirsin; değiştirmek için “Kişilere yetki ve ünvan verme” yetkisi gerekir." />
      ) : null}
      {!role.isManagement && role.editable ? (
        <Notice text="Üye rolleri yönetim paneline giremez; buradan verilen yetkiler yalnız panel dışındaki özel uçlarda anlam taşır." />
      ) : null}

      <PermissionEditor
        groups={groups}
        draft={role.editable ? draft : groups.flatMap((g) => g.permissions.map((p) => p.key))}
        onChange={setDraft}
        readOnly={readOnly}
        baseline={role.isSystem ? { permissions: role.defaultPermissions, label: "Varsayılandan farklı" } : null}
        extraActions={[
          { label: "Başka rolden kopyala", icon: "copy-outline", onPress: () => setDialog("copyFrom") },
          ...(role.isSystem ? [{ label: "Varsayılana döndür", icon: "refresh-outline" as const, onPress: () => void askReset() }] : []),
        ]}
      />

      <OptionSheet<string>
        visible={dialog === "copyFrom"}
        onClose={() => setDialog(null)}
        title="Başka rolden kopyala"
        options={data.roles
          .filter((r) => r.key !== role.key && r.isManagement)
          .map((r) => ({ value: r.key, label: r.label, hint: `${r.permissions.length} yetki` }))}
        onSelect={(value) => {
          const source = data.roles.find((r) => r.key === value);
          if (source) setDraft([...source.permissions]);
        }}
      />

      <BottomSheet visible={dialog === "users"} onClose={() => setDialog(null)} title={`${role.label} kullanıcıları`} snap="half">
        {users.isLoading ? (
          <SkeletonCard />
        ) : users.error ? (
          <ErrorState error={users.error} onRetry={users.refetch} variant="inline" />
        ) : !users.data?.items.length ? (
          <EmptyState icon="people-outline" title="Bu rolde kullanıcı yok" body="Yönetim kullanıcıları ekranından bu role hesap açabilirsin." variant="inline" compact />
        ) : (
          users.data.items.map((u, i) => (
            <ListRow
              key={u.id}
              title={u.name}
              subtitle={`@${u.username}${u.city ? ` · ${u.city}` : ""}`}
              position={users.data!.items.length === 1 ? "single" : i === 0 ? "first" : i === users.data!.items.length - 1 ? "last" : "middle"}
            />
          ))
        )}
      </BottomSheet>

      <RoleSettingsSheet
        visible={dialog === "edit" || dialog === "copy"}
        onClose={() => setDialog(null)}
        mode={dialog === "copy" ? "copy" : "edit"}
        role={role}
        roles={data.roles}
        homePaths={data.homePaths}
        canNationwide={isAdmin}
        onSubmit={async (payload) => {
          if (dialog === "copy") {
            const result = await createRole(payload).catch(asSheetError);
            await queryClient.invalidateQueries({ queryKey: systemKeys.roles });
            toast.show({ message: result.message || "Rol oluşturuldu.", tone: "success" });
            if (result.role?.key) router.replace(`/yonetim/yetki/rol/${encodeURIComponent(result.role.key)}` as never);
          } else {
            const result = await updateRole(role.key, payload).catch(asSheetError);
            await queryClient.invalidateQueries({ queryKey: systemKeys.roles });
            toast.show({ message: result.message || "Rol güncellendi.", tone: "success" });
          }
        }}
      />
      <DeleteRoleSheet
        visible={dialog === "delete"}
        onClose={() => setDialog(null)}
        role={role}
        roles={data.roles}
        onConfirm={async (reassignTo) => {
          const result = await deleteRole(role.key, reassignTo).catch(asSheetError);
          await queryClient.invalidateQueries({ queryKey: systemKeys.roles });
          void queryClient.invalidateQueries({ queryKey: systemKeys.access });
          toast.show({ message: result.message || "Rol silindi.", tone: "success" });
          router.back();
        }}
      />
    </Body>
  );
}

/* ═══════════════════════════ TOPLU ═══════════════════════════ */

type BulkSource = "pick" | "user" | "role";

const intersection = (users: AccessUser[]) => {
  if (!users.length) return [];
  const [first, ...rest] = users;
  return first.permissions.filter((key) => rest.every((u) => u.permissions.includes(key)));
};

export function BulkAccessView({ ids, onIdsChange }: { ids: number[]; onIdsChange: (ids: number[]) => void }) {
  const router = useRouter();
  const query = useQuery({ queryKey: systemKeys.access, queryFn: getAccessPayload });
  const data = query.data;
  const selected = useMemo(() => (data?.users ?? []).filter((u) => ids.includes(u.id) && u.editable), [data, ids]);

  const [mode, setMode] = useState<BulkMode>("replace");
  const [source, setSource] = useState<BulkSource>("pick");
  const [draft, setDraft] = useState<string[] | null>(null);
  const [sourceUser, setSourceUser] = useState<AccessUser | null>(null);
  const [roleKey, setRoleKey] = useState<string | null>(null);
  const [withTitle, setWithTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [picker, setPicker] = useState<"user" | "role" | null>(null);

  // Başlangıç: seçili herkesin ortak yetkileri (yalnız "bu liste olsun" için anlamlı).
  const pickDraft = draft ?? (mode === "replace" ? intersection(selected) : []);

  const incoming = useMemo(() => {
    if (source === "user") return sourceUser?.permissions ?? null;
    if (source === "role") return data?.roles.find((r) => r.key === roleKey)?.templatePermissions ?? null;
    return pickDraft;
  }, [source, sourceUser, data, roleKey, pickDraft]);

  const permissionChange = Boolean(incoming) && (mode === "replace" || (incoming?.length ?? 0) > 0);
  const canApply = selected.length > 0 && (permissionChange || withTitle);

  const apply = useAdminMutation(
    (body: AccessSaveBody & { userIds: number[]; mode: BulkMode }) => bulkAccess(body),
    {
      success: (r) => r.message || "Toplu yetkilendirme uygulandı.",
      invalidate: [systemKeys.access, systemKeys.managementUsers],
      onSuccess: () => router.back(),
    }
  );

  const submit = async () => {
    if (!canApply) return;
    const body: AccessSaveBody & { userIds: number[]; mode: BulkMode } = { userIds: selected.map((u) => u.id), mode };
    if (permissionChange) {
      if (source === "user" && sourceUser) body.copyFromUserId = sourceUser.id;
      else if (source === "role" && roleKey) body.roleTemplate = roleKey;
      else body.permissions = pickDraft;
    }
    if (withTitle) body.title = title.trim() || null;
    const what = [
      permissionChange && (mode === "replace" ? "yetkileri değiştirilecek" : mode === "add" ? "yetki eklenecek" : "yetki kaldırılacak"),
      withTitle && (title.trim() ? `ünvanı “${title.trim()}” olacak` : "ünvanı kaldırılacak"),
    ].filter(Boolean);
    const ok = await confirmAction({
      title: "Toplu yetkilendirme",
      message: `${selected.length} kişinin ${what.join(" ve ")}. Devam edilsin mi?`,
      confirmLabel: "Uygula",
    });
    if (ok) apply.mutate(body);
  };

  const bar = canApply ? (
    <SaveBar
      title={`${selected.length} kişi · ${BULK_MODES.find((m) => m.key === mode)?.label}`}
      extra={[incoming && permissionChange ? `${incoming.length} yetki` : null, withTitle ? `Ünvan: ${title.trim() || "kaldırılacak"}` : null].filter(Boolean).join(" · ")}
      saving={apply.isPending}
      onSave={() => void submit()}
      saveLabel={`${selected.length} kişiye uygula`}
    />
  ) : null;


  if (!data) return <Body><Loading error={query.error} onRetry={query.refetch} /></Body>;
  if (!selected.length) {
    return (
      <Body>
        <EmptyState
          icon="people-outline"
          title="Seçili kişi yok"
          body="Kişiler listesinde toplu seçimle kişileri işaretle."
          action={{ label: "Listeye dön", onPress: () => router.back() }}
          variant="inline"
        />
      </Body>
    );
  }

  return (
    <Body bar={bar} refreshing={query.isRefetching} onRefresh={query.refetch}>
      <Panel title={`${selected.length} kişi seçili`}>
        {selected.map((u) => {
          const next = incoming && permissionChange ? previewBulk(mode, u.permissions, incoming) : null;
          const before = new Set(u.permissions);
          const after = new Set(next ?? []);
          const added = next ? next.filter((k) => !before.has(k)).length : 0;
          const removed = next ? u.permissions.filter((k) => !after.has(k)).length : 0;
          return (
            <View key={u.id} style={styles.personRow}>
              <View style={styles.headText}>
                <Text style={styles.personName} numberOfLines={1} {...textScale.dense}>
                  {u.name}
                </Text>
                <Text style={styles.meta} {...textScale.dense}>
                  {next ? `${next.length} yetki` : `${u.permissions.length} yetki`}
                  {added ? <Text style={styles.plus}>  +{added}</Text> : null}
                  {removed ? <Text style={styles.minus}>  −{removed}</Text> : null}
                </Text>
              </View>
              <Touchable onPress={() => onIdsChange(ids.filter((id) => id !== u.id))} accessibilityLabel={`${u.name} seçimden çıkar`} accessibilityRole="button">
                <Ionicons name="close-circle-outline" size={22} color={colors.textTertiary} />
              </Touchable>
            </View>
          );
        })}
      </Panel>

      <Panel title="Güncelleme türü">
        <SegmentedControl
          items={BULK_MODES.map((m) => ({ key: m.key, label: m.label }))}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setDraft(next === "replace" ? intersection(selected) : []);
          }}
          stretch
        />
        <Text style={styles.hint} {...textScale.long}>
          {BULK_MODES.find((m) => m.key === mode)?.hint}
        </Text>
      </Panel>

      <Panel title="Ünvan">
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel} {...textScale.dense}>
            Seçilen kişilerin ünvanını da güncelle
          </Text>
          <Toggle value={withTitle} onValueChange={setWithTitle} accessibilityLabel="Ünvanı da güncelle" />
        </View>
        {withTitle ? (
          <>
            <Input value={title} onChangeText={setTitle} maxLength={80} placeholder="Boş bırakılırsa ünvan kaldırılır" />
            {data.titles.length ? (
              <ChipGroup scrollable contentPadding={0}>
                {data.titles.slice(0, 12).map((t) => (
                  <Chip key={t} label={t} size="sm" selected={title === t} onPress={() => setTitle(t)} />
                ))}
              </ChipGroup>
            ) : null}
          </>
        ) : null}
      </Panel>

      <Panel title="Yetki kaynağı">
        <SegmentedControl<BulkSource>
          items={[
            { key: "pick", label: "Seç" },
            { key: "user", label: "Kullanıcıyla aynı" },
            { key: "role", label: "Rol şablonu" },
          ]}
          value={source}
          onChange={setSource}
          stretch
        />
        {source === "user" ? (
          <>
            <Text style={styles.hint} {...textScale.long}>
              {sourceUser
                ? `Kaynak: ${sourceUser.name}${sourceUser.title ? ` (${sourceUser.title})` : ""} · ${sourceUser.permissions.length} yetki`
                : "Bir kişi seç; seçili herkese o kişinin bugünkü yetkileri uygulanır."}
            </Text>
            <Button label={sourceUser ? "Kaynağı değiştir" : "Kullanıcı seç"} icon="people-outline" variant="secondary" size="sm" onPress={() => setPicker("user")} />
          </>
        ) : null}
        {source === "role" ? (
          <>
            <Text style={styles.hint} {...textScale.long}>
              {roleKey ? `Şablon: ${data.roles.find((r) => r.key === roleKey)?.label}` : "Bir rol şablonu seç."}
            </Text>
            <Button label={roleKey ? "Şablonu değiştir" : "Rol şablonu seç"} icon="layers-outline" variant="secondary" size="sm" onPress={() => setPicker("role")} />
          </>
        ) : null}
      </Panel>

      {source === "pick" ? <PermissionEditor groups={data.groups} draft={pickDraft} onChange={setDraft} /> : null}

      <OptionSheet<number>
        visible={picker === "user"}
        onClose={() => setPicker(null)}
        title="Yetkileri kopyalanacak kullanıcı"
        searchable
        options={data.users
          .filter((u) => !ids.includes(u.id))
          .map((u) => ({ value: u.id, label: u.name, hint: [u.title, u.roleLabel, `${u.permissions.length} yetki`].filter(Boolean).join(" · ") }))}
        onSelect={(value) => setSourceUser(data.users.find((u) => u.id === value) ?? null)}
      />
      <OptionSheet<string>
        visible={picker === "role"}
        onClose={() => setPicker(null)}
        title="Rol şablonu"
        options={data.roles.filter((r) => r.key !== "admin").map((r) => ({ value: r.key, label: r.label, hint: `${r.templatePermissions.length} yetki` }))}
        onSelect={(value) => setRoleKey((value as string) ?? null)}
      />
    </Body>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm, paddingBottom: space.giant * 2 },
  gap: { gap: space.md },
  head: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  headText: { flex: 1, gap: space.xxs },
  name: { ...type.h3, color: colors.textPrimary },
  sub: { ...type.bodySm, color: colors.textSecondary },
  meta: { ...type.caption, color: colors.textTertiary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xs },
  roleColor: { width: 8, alignSelf: "stretch", borderRadius: radius.pill },
  usersLink: { flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start", paddingVertical: space.xs },
  link: { ...type.label, color: colors.brandAccent },
  hint: { ...type.caption, color: colors.textTertiary },
  bold: { color: colors.textPrimary },
  copied: { flexDirection: "row", alignItems: "center", gap: space.sm },
  copiedText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  notice: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.infoDim,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  noticeWarn: { backgroundColor: colors.warnDim },
  noticeText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  personRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  personName: { ...type.body, color: colors.textPrimary },
  plus: { color: colors.win },
  minus: { color: colors.danger },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  toggleLabel: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
});
