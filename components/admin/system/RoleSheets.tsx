/**
 * Rol pencereleri — web roles/RoleSettingsDialog.js ve DeleteRoleDialog.js.
 *
 *   <RoleSettingsSheet mode="create|copy|edit" />  ad, açıklama, kapsam, renk,
 *       girişten sonra açılan sayfa, (yeni rolde) başlangıç yetkileri
 *   <DeleteRoleSheet />  roldeki kullanıcılar başka role aktarılır; onay için
 *       rol adı yazılır (geri alınamaz işlem).
 *
 * Hata FormSheet'in altında görünür: onSubmit hata fırlatırsa sayfa açık kalır.
 */

import React, { useMemo } from "react";

import { FormSheet, type FieldDef, type FormValues } from "@/components/admin";
import { ROLE_COLORS, type RoleInput, type RoleRecord, type RoleScope } from "@/lib/api/admin/system";

export function RoleSettingsSheet({
  visible,
  onClose,
  mode,
  role,
  roles,
  homePaths,
  canNationwide,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  mode: "create" | "copy" | "edit";
  role?: RoleRecord | null;
  roles: RoleRecord[];
  homePaths: { path: string; label: string }[];
  /** Türkiye geneli kapsamı yalnız admin seçebilir. */
  canNationwide: boolean;
  onSubmit: (payload: RoleInput) => Promise<unknown>;
}) {
  const isCreate = mode !== "edit";
  const scopeLocked = !isCreate && Boolean(role?.scopeLocked);
  const isManagement = isCreate || Boolean(role?.isManagement);

  const fields = useMemo<FieldDef[]>(() => {
    const paths = [
      ...homePaths,
      ...(role?.homePath && !homePaths.some((p) => p.path === role.homePath)
        ? [{ path: role.homePath, label: `Rolün kendi merkezi (${role.homePath})` }]
        : []),
    ];
    const sources = roles.filter((r) => r.isManagement && r.key !== "admin");
    return [
      { key: "label", label: "Rol adı", kind: "text", required: true, maxLength: 80, placeholder: "Örn. Saha Sorumlusu" },
      {
        key: "description",
        label: "Açıklama",
        kind: "multiline",
        maxLength: 500,
        placeholder: "Bu rol ne iş yapar? (Kullanıcı listelerinde görünür)",
      },
      ...(isManagement
        ? [
            {
              key: "scope",
              label: "Kapsam",
              kind: "segment",
              disabled: scopeLocked,
              // Kapsamı kilitli rolde yalnız mevcut kapsam gösterilir (değişmez).
              options: scopeLocked
                ? [{ value: role?.scope ?? "city", label: role?.nationwide ? "Türkiye geneli" : "İl bazlı" }]
                : canNationwide
                ? [
                    { value: "city", label: "İl bazlı" },
                    { value: "nationwide", label: "Türkiye geneli" },
                  ]
                : [{ value: "city", label: "İl bazlı" }],
              hint: scopeLocked
                ? role?.key === "admin"
                  ? "Admin her zaman Türkiye genelidir."
                  : "Bu rolün kapsamı değiştirilemez."
                : canNationwide
                  ? "İl bazlı: kullanıcı yalnız kayıtlı olduğu ilde yetkilerini kullanır."
                  : "Türkiye geneli kapsamı yalnız admin seçebilir.",
            } as FieldDef,
          ]
        : []),
      { key: "color", label: "Renk", kind: "color", palette: ROLE_COLORS },
      ...(isManagement
        ? [
            {
              key: "homePath",
              label: "Girişten sonra açılan sayfa",
              kind: "select",
              options: paths.map((p) => ({ value: p.path, label: p.label, hint: p.path })),
              clearable: false,
            } as FieldDef,
          ]
        : []),
      ...(isCreate
        ? [
            {
              key: "copyFrom",
              label: "Başlangıç yetkileri",
              kind: "select",
              placeholder: "Boş başla (hiçbir yetki açık değil)",
              options: sources.map((r) => ({ value: r.key, label: `${r.label} rolünün yetkileri`, hint: `${r.permissions.length} yetki` })),
              hint: "Rol oluşturulduktan sonra yetkilerini tek tek düzenleyebilirsin.",
            } as FieldDef,
          ]
        : []),
    ];
  }, [homePaths, role, roles, isManagement, scopeLocked, canNationwide, isCreate]);

  const initial: FormValues = {
    label: mode === "copy" && role ? `${role.label} (kopya)` : role && mode === "edit" ? role.label : "",
    description: role?.description ?? "",
    scope: mode === "copy" && !canNationwide ? "city" : role?.scope ?? "city",
    color: role?.color ?? ROLE_COLORS[0],
    homePath: role?.homePath ?? "/editor",
    copyFrom: mode === "copy" && role ? role.key : null,
  };

  const submit = async (values: FormValues) => {
    const label = String(values.label ?? "").trim();
    if (label.length < 2) throw new Error("Rol adı en az 2 karakter olmalıdır.");
    const payload: RoleInput = {
      label,
      description: String(values.description ?? "").trim(),
      color: String(values.color ?? ROLE_COLORS[0]),
    };
    if (isManagement && !scopeLocked) payload.scope = (values.scope === "nationwide" ? "nationwide" : "city") as RoleScope;
    if (isManagement && values.homePath) payload.homePath = String(values.homePath);
    if (isCreate && values.copyFrom) payload.copyFrom = String(values.copyFrom);
    await onSubmit(payload);
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title={mode === "create" ? "Yeni rol" : mode === "copy" ? `${role?.label ?? ""} rolünü kopyala` : `${role?.label ?? ""} rolünü düzenle`}
      fields={fields}
      initial={initial}
      submitLabel={isCreate ? "Rolü oluştur" : "Kaydet"}
      onSubmit={submit}
    />
  );
}

export function DeleteRoleSheet({
  visible,
  onClose,
  role,
  roles,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  role: RoleRecord | null;
  roles: RoleRecord[];
  onConfirm: (reassignTo: string | null) => Promise<unknown>;
}) {
  const needsTarget = (role?.userCount ?? 0) > 0;
  const targets = roles.filter((r) => r.isManagement && r.key !== role?.key);
  const fields: FieldDef[] = [
    ...(needsTarget
      ? [
          {
            key: "reassignTo",
            label: `Bu roldeki ${role?.userCount} kullanıcı hangi role aktarılsın?`,
            kind: "select",
            required: true,
            options: targets.map((r) => ({ value: r.key, label: r.label, hint: r.nationwide ? "Türkiye geneli" : "İl bazlı" })),
          } as FieldDef,
        ]
      : []),
    { key: "typed", label: `Onaylamak için rol adını yaz: ${role?.label ?? ""}`, kind: "text", required: true },
  ];
  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title={`${role?.label ?? ""} rolünü sil`}
      intro="Rol ve tüm yetki ayarları kalıcı olarak silinir. Bu işlem geri alınamaz."
      fields={fields}
      initial={{}}
      submitLabel="Rolü sil"
      snap="content"
      onSubmit={async (values) => {
        const typed = String(values.typed ?? "").trim().toLocaleLowerCase("tr-TR");
        if (!role || typed !== role.label.toLocaleLowerCase("tr-TR")) throw new Error("Yazılan ad rol adıyla eşleşmiyor.");
        await onConfirm(needsTarget ? String(values.reassignTo) : null);
      }}
    />
  );
}
