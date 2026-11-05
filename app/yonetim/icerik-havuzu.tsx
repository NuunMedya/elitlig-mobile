/**
 * İÇERİK HAVUZU — sosyal medya şablonları ve yöneticilerin ortak klasörleri
 * (web /icerik-havuzu, ContentPoolHubPage.js + library/LibrarySection.jsx).
 *
 * İKİ SEKME:
 *   TÜRLER    şablon kataloğu: kategori çipleri, arama, boyutlar. Bir türe
 *             dokununca: web oluşturucusunu aç, bağlantıyı paylaş / kopyala,
 *             klasöre hazır içerik olarak ekle.
 *   KLASÖRLER ortak klasörler ve içlerindeki hazır içerikler (sunucu verisi).
 *             Klasör oluştur / yeniden adlandır / sil; hazır içeriği aç,
 *             paylaş, yeniden adlandır, taşı, kopyala, sil. Klasörü yalnız
 *             sahibi (ya da admin) değiştirir — sunucu `canEdit` ile söyler.
 *
 * GÖRSEL ÜRETİMİ: tasarımlar web'de tarayıcıda çizilip PNG olarak indirilir
 * (Template Registry + ContentComposer); sunucuda görsel üreten bir uç yoktur.
 * Bu yüzden mobil görseli kendisi üretmez; oluşturucuyu sistem tarayıcısında
 * açar ya da bağlantısını paylaşır.
 */

import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";

import {
  ActionSheet,
  AdminList,
  AdminScreen,
  confirmAction,
  FormSheet,
  RecordCard,
  useAdminMutation,
  type FieldDef,
  type FilterOption,
  type SheetAction,
} from "@/components/admin";
import { Button, FAB, SegmentedControl, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDate } from "@/lib/admin/format";
import {
  CONTENT_TEMPLATES,
  copyContentPreset,
  createContentFolder,
  createContentPreset,
  deleteContentFolder,
  deleteContentPreset,
  getContentLibrary,
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_SIZE_LABELS,
  templateById,
  templateWebUrl,
  updateContentFolder,
  updateContentPreset,
  type ContentFolder,
  type ContentPreset,
  type ContentTemplate,
  type TemplateCategory,
} from "@/lib/api/admin/contentPool";
import { openLink } from "@/lib/links";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

type Tab = "turler" | "klasorler";

type Form =
  | { kind: "folder"; folder?: ContentFolder }
  | { kind: "add"; folderId?: number; templateId?: string }
  | { kind: "rename"; preset: ContentPreset }
  | { kind: "move" | "copy"; preset: ContentPreset };

const fold = (text: string) => text.toLocaleLowerCase("tr-TR");

export default function ContentPoolScreen() {
  const auth = useAuth();
  const toast = useToast();
  const canSeeLibrary = hasAnyPermission(auth.user, ["content.library.view", "content.library.manage"]);
  const canManage = hasAnyPermission(auth.user, ["content.library.manage"]);

  const [tab, setTab] = useState<Tab>("turler");
  const [category, setCategory] = useState<TemplateCategory | "">("");
  const [q, setQ] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  const library = useQuery({ queryKey: ["admin", "contentPool", "library"], queryFn: getContentLibrary, enabled: canSeeLibrary });
  const folders = useMemo(() => library.data ?? [], [library.data]);
  const folder = folders.find((f) => f.id === folderId) ?? null;
  const editableFolders = folders.filter((f) => f.canEdit);

  /* ───────────── paylaşım ───────────── */

  const share = (title: string, url: string) => void Share.share({ message: `${title}\n${url}`, url });
  const copy = async (url: string) => {
    await Clipboard.setStringAsync(url);
    toast.show({ message: "Bağlantı kopyalandı.", tone: "success" });
  };

  /* ───────────── mutasyonlar ───────────── */

  const inv = { invalidate: [["admin", "contentPool"]] as unknown[][] };
  const saveFolder = useAdminMutation(
    (v: { id?: number; name: string; description: string }) =>
      v.id ? updateContentFolder(v.id, { name: v.name, description: v.description }) : createContentFolder({ name: v.name, description: v.description }),
    { ...inv, success: (_r, v) => (v.id ? "Klasör güncellendi." : "Klasör oluşturuldu."), silentError: true }
  );
  const removeFolder = useAdminMutation((f: ContentFolder) => deleteContentFolder(f.id), {
    ...inv,
    success: "Klasör silindi.",
    onSuccess: () => setFolderId(null),
  });
  const addPreset = useAdminMutation(
    (v: { folderId: number; templateId: string; title: string }) => createContentPreset(v.folderId, { templateId: v.templateId, title: v.title, settings: {} }),
    { ...inv, success: "İçerik klasöre eklendi.", silentError: true }
  );
  const renamePreset = useAdminMutation((v: { id: number; title: string }) => updateContentPreset(v.id, { title: v.title }), {
    ...inv,
    success: "İçerik adı güncellendi.",
    silentError: true,
  });
  const movePreset = useAdminMutation((v: { preset: ContentPreset; target: number }) => updateContentPreset(v.preset.id, { folderId: v.target }), {
    ...inv,
    success: (_r, v) => `“${v.preset.title}” ${folders.find((f) => f.id === v.target)?.name ?? "klasöre"} klasörüne taşındı.`,
    silentError: true,
  });
  const copyPreset = useAdminMutation((v: { preset: ContentPreset; target: number }) => copyContentPreset(v.preset, v.target), {
    ...inv,
    success: (_r, v) => `“${v.preset.title}” ${folders.find((f) => f.id === v.target)?.name ?? "klasöre"} klasörüne kopyalandı.`,
    silentError: true,
  });
  const removePreset = useAdminMutation((p: ContentPreset) => deleteContentPreset(p.id), { ...inv, success: "İçerik silindi." });

  /* ───────────── menüler ───────────── */

  const templateMenu = (t: ContentTemplate) =>
    setMenu({
      title: t.name,
      actions: [
        { label: "Web'de oluştur", hint: "Önizle ve PNG olarak indir", icon: "open-outline", onPress: () => void openLink(templateWebUrl(t.id)) },
        { label: "Bağlantıyı paylaş", icon: "share-social-outline", onPress: () => share(t.name, templateWebUrl(t.id)) },
        { label: "Bağlantıyı kopyala", icon: "copy-outline", onPress: () => void copy(templateWebUrl(t.id)) },
        { label: "Klasöre ekle", icon: "folder-outline", hidden: !canManage || !editableFolders.length, onPress: () => setForm({ kind: "add", templateId: t.id }) },
      ],
    });

  const presetMenu = (p: ContentPreset, owner: ContentFolder) => {
    const name = templateById(p.templateId)?.name ?? p.templateId;
    const url = templateWebUrl(p.templateId, p.id);
    setMenu({
      title: p.title,
      actions: [
        { label: "Web'de aç", hint: name, icon: "open-outline", onPress: () => void openLink(url) },
        { label: "Bağlantıyı paylaş", icon: "share-social-outline", onPress: () => share(p.title, url) },
        { label: "Bağlantıyı kopyala", icon: "copy-outline", onPress: () => void copy(url) },
        { label: "Yeniden adlandır", icon: "create-outline", hidden: !canManage || !owner.canEdit, onPress: () => setForm({ kind: "rename", preset: p }) },
        {
          label: "Başka klasöre taşı",
          icon: "swap-horizontal-outline",
          hidden: !canManage || !owner.canEdit || !editableFolders.some((f) => f.id !== p.folderId),
          onPress: () => setForm({ kind: "move", preset: p }),
        },
        { label: "Klasöre kopyala", icon: "copy-outline", hidden: !canManage || !editableFolders.length, onPress: () => setForm({ kind: "copy", preset: p }) },
        {
          label: "Sil",
          icon: "trash-outline",
          danger: true,
          hidden: !canManage || !owner.canEdit,
          onPress: async () => {
            if (await confirmAction({ title: "İçerik silinsin mi?", message: `“${p.title}” silinecek.`, confirmLabel: "Sil", destructive: true })) removePreset.mutate(p);
          },
        },
      ],
    });
  };

  const folderMenu = (f: ContentFolder) =>
    setMenu({
      title: f.name,
      actions: [
        { label: "İçerik ekle", icon: "add-circle-outline", hidden: !canManage || !f.canEdit, onPress: () => setForm({ kind: "add", folderId: f.id }) },
        { label: "Yeniden adlandır", icon: "create-outline", hidden: !canManage || !f.canEdit, onPress: () => setForm({ kind: "folder", folder: f }) },
        {
          label: "Klasörü sil",
          icon: "trash-outline",
          danger: true,
          hidden: !canManage || !f.canEdit,
          onPress: async () => {
            const count = f.presets.length;
            const ok = await confirmAction({
              title: "Klasör silinsin mi?",
              message: count ? `“${f.name}” klasörü ve içindeki ${count} içerik silinecek. Bu işlem geri alınamaz.` : `“${f.name}” klasörü silinecek.`,
              confirmLabel: "Sil",
              destructive: true,
            });
            if (ok) removeFolder.mutate(f);
          },
        },
      ],
    });

  /* ───────────── listeler ───────────── */

  const templates = useMemo(() => {
    const needle = fold(q);
    return CONTENT_TEMPLATES.filter(
      (t) => (!category || t.category === category) && (!needle || fold(`${t.name} ${t.description}`).includes(needle))
    );
  }, [category, q]);

  const categoryFilters: FilterOption[] = [
    { key: "", label: "Tümü", count: CONTENT_TEMPLATES.length },
    ...(Object.keys(TEMPLATE_CATEGORY_LABELS) as TemplateCategory[]).map((key) => ({
      key,
      label: TEMPLATE_CATEGORY_LABELS[key],
      count: CONTENT_TEMPLATES.filter((t) => t.category === key).length,
    })),
  ];

  const tabs = canSeeLibrary ? (
    <View style={styles.tabs}>
      <SegmentedControl<Tab>
        items={[
          { key: "turler", label: "İçerik türleri" },
          { key: "klasorler", label: "Klasörler" },
        ]}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setFolderId(null);
        }}
        size="sm"
      />
    </View>
  ) : null;

  /* ───────────── formlar ───────────── */

  const folderOptions = (exclude?: number) => editableFolders.filter((f) => f.id !== exclude).map((f) => ({ value: f.id, label: f.name }));
  const formFields: FieldDef[] =
    form?.kind === "folder"
      ? [
          { key: "name", label: "Klasör adı", kind: "text", required: true, maxLength: 120 },
          { key: "description", label: "Açıklama", kind: "multiline", maxLength: 500 },
        ]
      : form?.kind === "add"
        ? [
            { key: "folderId", label: "Klasör", kind: "select", required: true, options: folderOptions(), hidden: () => Boolean(form.folderId) },
            {
              key: "templateId",
              label: "İçerik türü",
              kind: "select",
              required: true,
              options: CONTENT_TEMPLATES.map((t) => ({ value: t.id, label: t.name, hint: TEMPLATE_CATEGORY_LABELS[t.category] })),
              onChange: (value, values) => (values.title ? undefined : { title: templateById(String(value))?.name ?? "" }),
            },
            { key: "title", label: "Başlık", kind: "text", required: true, maxLength: 160, placeholder: "Örn. Hafta sonu sonuçları" },
          ]
        : form?.kind === "rename"
          ? [{ key: "title", label: "Başlık", kind: "text", required: true, maxLength: 160 }]
          : form?.kind === "move" || form?.kind === "copy"
            ? [{ key: "target", label: form.kind === "move" ? "Taşınacak klasör" : "Kopyalanacak klasör", kind: "select", required: true, options: folderOptions(form.kind === "move" ? form.preset.folderId : undefined) }]
            : [];

  const formInitial =
    form?.kind === "folder"
      ? { name: form.folder?.name ?? "", description: form.folder?.description ?? "" }
      : form?.kind === "add"
        ? { folderId: form.folderId ?? (editableFolders.length === 1 ? editableFolders[0].id : null), templateId: form.templateId ?? null, title: form.templateId ? templateById(form.templateId)?.name ?? "" : "" }
        : form?.kind === "rename"
          ? { title: form.preset.title }
          : {};

  const formTitle =
    form?.kind === "folder" ? (form.folder ? "Klasörü düzenle" : "Yeni klasör") : form?.kind === "add" ? "Klasöre içerik ekle" : form?.kind === "rename" ? "Yeniden adlandır" : form?.kind === "move" ? "Başka klasöre taşı" : "Klasöre kopyala";

  const submitForm = async (v: Record<string, unknown>) => {
    if (!form) return;
    if (form.kind === "folder") return saveFolder.mutateAsync({ id: form.folder?.id, name: String(v.name).trim(), description: String(v.description ?? "").trim() });
    if (form.kind === "add") return addPreset.mutateAsync({ folderId: Number(form.folderId ?? v.folderId), templateId: String(v.templateId), title: String(v.title).trim() });
    if (form.kind === "rename") return renamePreset.mutateAsync({ id: form.preset.id, title: String(v.title).trim() });
    const payload = { preset: form.preset, target: Number(v.target) };
    return form.kind === "move" ? movePreset.mutateAsync(payload) : copyPreset.mutateAsync(payload);
  };

  /* ───────────── çizim ───────────── */

  const showingLibrary = canSeeLibrary && tab === "klasorler";

  return (
    <AdminScreen
      title="İçerik havuzu"
      subtitle="Sosyal medya görselleri ve şablonlar"
      permission={["content.pool"]}
      scroll={false}
      bottom={tabs}
      overlay={
        showingLibrary && canManage ? (
          folder ? (
            folder.canEdit ? <FAB icon="add" label="İçerik ekle" extended onPress={() => setForm({ kind: "add", folderId: folder.id })} accessibilityLabel="Klasöre içerik ekle" /> : null
          ) : (
            <FAB icon="folder-outline" label="Yeni klasör" extended onPress={() => setForm({ kind: "folder" })} accessibilityLabel="Yeni klasör" />
          )
        ) : null
      }
    >
      {!showingLibrary ? (
        <AdminList<ContentTemplate>
          data={templates}
          search={q}
          onSearch={setQ}
          searchPlaceholder="İçerik türü ara"
          filters={categoryFilters}
          filter={category}
          onFilter={(key) => setCategory(key as TemplateCategory | "")}
          summary={`${templates.length} hazır içerik türü · tasarımlar seçtiğin il, lig ve sezonun verisiyle dolar`}
          keyExtractor={(t) => t.id}
          emptyIcon="images-outline"
          emptyTitle="Sonuç bulunamadı"
          emptyBody={q ? `“${q}” için eşleşen içerik türü yok.` : undefined}
          renderItem={({ item }) => (
            <RecordCard
              title={item.name}
              subtitle={item.description}
              meta={TEMPLATE_CATEGORY_LABELS[item.category]}
              icon="image-outline"
              iconTone={item.featured ? "brand" : "neutral"}
              badges={[item.featured ? { label: "Öne çıkan", tone: "brand" } : null, ...item.sizes.map((s) => ({ label: TEMPLATE_SIZE_LABELS[s] }))]}
              onPress={() => templateMenu(item)}
            />
          )}
        />
      ) : folder ? (
        <AdminList<ContentPreset>
          data={folder.presets}
          loading={library.isLoading}
          error={library.error}
          onRetry={library.refetch}
          refreshing={library.isRefetching}
          onRefresh={library.refetch}
          extraHeader={
            <View style={styles.folderHead}>
              <Button label="Klasörler" icon="chevron-back" variant="ghost" size="sm" onPress={() => setFolderId(null)} />
              <View style={styles.folderTitle}>
                <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
                  {folder.name}
                </Text>
                <Text style={styles.meta} numberOfLines={2} {...textScale.dense}>
                  {[folder.description, folder.canEdit ? "Düzenleyebilirsin" : `Sahibi: ${folder.ownerName || "başka bir yönetici"}`].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {canManage && folder.canEdit ? <Button label="İşlemler" icon="ellipsis-horizontal" variant="secondary" size="sm" onPress={() => folderMenu(folder)} /> : null}
            </View>
          }
          summary={`${folder.presets.length} içerik`}
          keyExtractor={(p) => String(p.id)}
          emptyIcon="albums-outline"
          emptyTitle="Klasör boş"
          emptyBody={folder.canEdit ? "“İçerik ekle” ile bu klasöre hazır içerik ekle." : undefined}
          renderItem={({ item }) => (
            <RecordCard
              title={item.title}
              subtitle={templateById(item.templateId)?.name ?? item.templateId}
              meta={[item.updatedAt ? formatDate(item.updatedAt) : null, item.updatedByName].filter(Boolean).join(" · ") || null}
              icon="image-outline"
              iconTone="brand"
              onPress={() => presetMenu(item, folder)}
            />
          )}
        />
      ) : (
        <AdminList<ContentFolder>
          data={folders}
          loading={library.isLoading}
          error={library.error}
          onRetry={library.refetch}
          refreshing={library.isRefetching}
          onRefresh={library.refetch}
          summary={library.data ? `${folders.length} klasör` : null}
          keyExtractor={(f) => String(f.id)}
          emptyIcon="folder-open-outline"
          emptyTitle="Henüz klasör yok"
          emptyBody={canManage ? "Hazır içerik ayarlarını ekiple paylaşmak için klasör aç." : undefined}
          renderItem={({ item }) => (
            <RecordCard
              title={item.name}
              subtitle={item.description || null}
              meta={[`${item.presets.length} içerik`, item.updatedAt ? `Son güncelleme ${formatDate(item.updatedAt)}` : null].filter(Boolean).join(" · ")}
              icon="folder-outline"
              iconTone={item.canEdit ? "brand" : "neutral"}
              badges={[item.canEdit ? { label: "Düzenleyebilirsin", tone: "brand" } : { label: `Sahibi: ${item.ownerName || "başka bir yönetici"}` }]}
              onPress={() => setFolderId(item.id)}
              onLongPress={canManage && item.canEdit ? () => folderMenu(item) : undefined}
            />
          )}
        />
      )}

      <ActionSheet visible={menu != null} onClose={() => setMenu(null)} title={menu?.title} actions={menu?.actions ?? []} />

      <FormSheet
        visible={form != null}
        onClose={() => setForm(null)}
        title={formTitle}
        fields={formFields}
        initial={formInitial}
        snap={form?.kind === "add" || form?.kind === "folder" ? "half" : "content"}
        onSubmit={submitForm}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  folderHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  folderTitle: { flex: 1, gap: 2 },
  title: { ...type.h3, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
});
