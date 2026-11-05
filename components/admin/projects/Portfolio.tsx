/**
 * Portföy: satışı kapanan kişi / kurumlar. Proje içinde (o projenin
 * kayıtları) ve Projeler ana sayfasında (tüm projeler + projeden bağımsız
 * kayıtlar) aynı liste kullanılır. Arama, kategori / durum süzgeci, CSV
 * paylaşımı, ekle / düzenle (alt sayfa) ve onaylı silme.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FormSheet, RecordCard, confirmAction, type FieldDef, type FormValues } from "@/components/admin";
import { Button, Chip, ChipGroup, EmptyState, ErrorState, Input, MetricGrid, MetricTile, SkeletonListRow, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDate, formatMoney } from "@/lib/admin/format";
import {
  PORTFOLIO_EXPORT,
  PORTFOLIO_STATUS_META,
  isoDate,
  matches,
  parseAmount,
  prettyPhone,
  toCsv,
} from "@/lib/admin/projectUtils";
import {
  createPortfolio,
  listPortfolio,
  projectKeys,
  removePortfolio,
  updatePortfolio,
  type PortfolioItem,
  type PortfolioStatus,
  type Project,
} from "@/lib/api/admin/projects";
import { colors, space, textScale, type } from "@/theme";

import { ContactActions, Pill, shareCsv, useChunk } from "./ui";

const STATUS_OPTIONS = (Object.keys(PORTFOLIO_STATUS_META) as PortfolioStatus[]).map((k) => ({ value: k, label: PORTFOLIO_STATUS_META[k].label }));

function portfolioFields(categories: string[], projects?: Project[], isNew?: boolean): FieldDef[] {
  return [
    { key: "name", label: "Ad / kurum", kind: "text", required: true },
    { key: "company", label: "Kurum / takım", kind: "text" },
    { key: "phone", label: "Telefon", kind: "phone" },
    { key: "email", label: "E-posta", kind: "email" },
    { key: "category", label: "Kategori", kind: "text", hint: categories.length ? `Örnek: ${categories.slice(0, 4).join(", ")}` : undefined },
    { key: "value", label: "Tutar (₺)", kind: "money" },
    { key: "status", label: "Durum", kind: "segment", options: STATUS_OPTIONS },
    { key: "start_date", label: "Başlangıç", kind: "date" },
    { key: "city", label: "Şehir", kind: "text" },
    { key: "title", label: "Unvan", kind: "text" },
    ...(projects && isNew
      ? [{
          key: "project_id",
          label: "Proje",
          kind: "select" as const,
          placeholder: "Projeden bağımsız",
          options: projects.filter((p) => p.access?.can_edit).map((p) => ({ value: p.id, label: p.name })),
        }]
      : []),
    { key: "note", label: "Not", kind: "multiline" },
  ];
}

function toBody(v: FormValues, withProject: boolean): Partial<PortfolioItem> {
  const amount = parseAmount(v.value);
  if (Number.isNaN(amount)) throw new Error("Tutar geçersiz.");
  return {
    name: String(v.name ?? "").trim(),
    company: String(v.company ?? ""),
    title: String(v.title ?? ""),
    phone: String(v.phone ?? ""),
    email: String(v.email ?? ""),
    city: String(v.city ?? ""),
    category: String(v.category ?? ""),
    value: amount,
    status: (v.status as PortfolioStatus) || "active",
    start_date: (v.start_date as string) || null,
    note: String(v.note ?? ""),
    ...(withProject ? { project_id: v.project_id ? Number(v.project_id) : null } : {}),
  };
}

export interface PortfolioListProps {
  items: PortfolioItem[];
  categories?: string[];
  canEdit: boolean | ((item: PortfolioItem) => boolean);
  canAdd: boolean;
  onAdd: (body: Partial<PortfolioItem>) => Promise<unknown>;
  onSave: (id: number, body: Partial<PortfolioItem>) => Promise<unknown>;
  onRemove: (id: number) => Promise<unknown>;
  showProject?: boolean;
  projects?: Project[];
  onOpenProject?: (projectId: number) => void;
  title?: string;
}

export function PortfolioList({
  items,
  categories = [],
  canEdit,
  canAdd,
  onAdd,
  onSave,
  onRemove,
  showProject,
  projects,
  onOpenProject,
  title = "portfoy",
}: PortfolioListProps) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"" | PortfolioStatus>("");
  const [editing, setEditing] = useState<PortfolioItem | "new" | null>(null);
  const editable = (item: PortfolioItem) => (typeof canEdit === "function" ? canEdit(item) : canEdit);
  const allCats = useMemo(() => [...new Set([...categories, ...items.map((i) => i.category)].filter(Boolean))], [categories, items]);
  const shown = useMemo(
    () => items.filter((i) => (!category || i.category === category) && (!status || i.status === status) && matches(q, i.name, i.company, i.phone, i.email, i.city, i.tags, i.project_name)),
    [items, category, status, q]
  );
  const chunk = useChunk(shown);
  const total = shown.reduce((s, i) => s + (Number(i.value) || 0), 0);
  const filtered = Boolean(status || category || q);
  const isNew = editing === "new";

  const remove = async (item: PortfolioItem) => {
    const ok = await confirmAction({
      title: "Portföy kaydı silinsin mi?",
      message: `"${item.name}" portföyden kaldırılacak.${item.lead_id ? " Bağlı kişi kaydı projede kalır." : ""}`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) await onRemove(item.id);
  };

  return (
    <View style={styles.wrap}>
      <MetricGrid columns={3}>
        <MetricTile label="Portföy" value={String(shown.length)} hint={filtered ? "kayıt (süzülmüş)" : "kayıt"} tone="brand" />
        <MetricTile label="Toplam değer" value={formatMoney(total, true)} hint="kayıtlı tutarlar" />
        <MetricTile label="Aktif" value={String(shown.filter((i) => i.status === "active").length)} hint={`${shown.filter((i) => i.status === "renewal").length} yenilenecek`} tone="win" />
      </MetricGrid>
      <Input variant="search" value={q} onChangeText={setQ} placeholder="Portföyde ara…" />
      <ChipGroup contentPadding={0}>
        <Chip label="Tüm durumlar" size="sm" selected={!status} onPress={() => setStatus("")} />
        {STATUS_OPTIONS.map((o) => (
          <Chip key={o.value} label={o.label} size="sm" selected={status === o.value} onPress={() => setStatus(status === o.value ? "" : o.value)} />
        ))}
      </ChipGroup>
      {allCats.length ? (
        <ChipGroup contentPadding={0}>
          <Chip label="Tüm kategoriler" size="sm" selected={!category} onPress={() => setCategory("")} />
          {allCats.map((c) => (
            <Chip key={c} label={c} size="sm" selected={category === c} onPress={() => setCategory(category === c ? "" : c)} />
          ))}
        </ChipGroup>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="CSV paylaş"
          icon="share-outline"
          variant="secondary"
          size="sm"
          disabled={!shown.length}
          onPress={() => void shareCsv(title, toCsv(PORTFOLIO_EXPORT, shown))}
        />
        {canAdd ? <Button label="Portföye ekle" icon="add" size="sm" onPress={() => setEditing("new")} /> : null}
      </View>

      {!shown.length ? (
        <EmptyState
          variant="inline"
          icon="briefcase-outline"
          title={items.length ? "Eşleşen kayıt yok" : "Portföy boş"}
          body={items.length ? "Süzgeçleri değiştirin." : "Satışı kapanan kişiler burada toplanır. Kişiler sekmesinde \"Satışı kapat → Portföye ekle\" ile ya da elle ekleyin."}
        />
      ) : (
        chunk.shown.map((item) => {
          const st = PORTFOLIO_STATUS_META[item.status] || PORTFOLIO_STATUS_META.active;
          const can = editable(item);
          return (
            <RecordCard
              key={item.id}
              avatar={{ name: item.name }}
              title={item.name}
              subtitle={[item.company, item.title].filter(Boolean).join(" · ") || item.city || prettyPhone(item.phone) || null}
              meta={[item.category, item.start_date ? formatDate(item.start_date) : null, showProject && item.project_name ? `Proje: ${item.project_name}` : null].filter(Boolean).join(" · ") || null}
              value={item.value != null ? formatMoney(item.value, true) : null}
              onPress={can ? () => setEditing(item) : showProject && item.project_id && onOpenProject ? () => onOpenProject(item.project_id!) : undefined}
              onLongPress={can ? () => void remove(item) : undefined}
            >
              <View style={styles.cardFoot}>
                <Pill label={st.label} color={st.color} />
                <View style={styles.flex} />
                <ContactActions phone={item.phone} email={item.email} name={item.name} />
              </View>
              {item.note ? (
                <Text style={styles.note} numberOfLines={2} {...textScale.dense}>
                  {item.note}
                </Text>
              ) : null}
            </RecordCard>
          );
        })
      )}
      {chunk.more ? <Button label={`${chunk.more} kayıt daha göster`} variant="ghost" onPress={chunk.showMore} /> : null}
      {shown.length && (typeof canEdit === "function" || canEdit) ? (
        <Text style={styles.hint} {...textScale.dense}>
          Düzenlemek için dokunun, silmek için basılı tutun.
        </Text>
      ) : null}

      <FormSheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        title={isNew ? "Portföye ekle" : "Portföy kaydını düzenle"}
        fields={portfolioFields(allCats, projects, isNew)}
        initial={
          editing && editing !== "new"
            ? { ...editing, value: editing.value == null ? "" : String(editing.value).replace(".", ",") }
            : { status: "active", start_date: isoDate(), category: categories[0] || "" }
        }
        onSubmit={async (v) => {
          const body = toBody(v, Boolean(projects && isNew));
          if (editing && editing !== "new") await onSave(editing.id, body);
          else await onAdd(body);
        }}
        secondary={
          editing && editing !== "new" && editable(editing)
            ? { label: "Sil", danger: true, onPress: () => { const it = editing; setEditing(null); setTimeout(() => void remove(it), 300); } }
            : undefined
        }
      />
    </View>
  );
}

/** Projeler ana sayfasındaki genel portföy (GET /portfolio). */
export function GlobalPortfolio({ projects, onOpenProject }: { projects: Project[]; onOpenProject: (id: number) => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: projectKeys.portfolio, queryFn: listPortfolio });
  const categories = useMemo(
    () => [...new Set([...(query.data?.categories || []), ...projects.flatMap((p) => p.settings?.portfolio_categories || [])])],
    [query.data, projects]
  );
  const run = async (fn: () => Promise<unknown>, ok: string, rethrow = false) => {
    try {
      await fn();
      toast.show({ message: ok, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: projectKeys.portfolio });
      void queryClient.invalidateQueries({ queryKey: ["admin", "projects", "list"] });
    } catch (err) {
      if (rethrow) throw err;
      toast.show({ message: errorText(err, "İşlem tamamlanamadı."), tone: "danger" });
    }
  };

  if (query.isLoading) return <View style={styles.wrap}>{[0, 1, 2, 3].map((i) => <SkeletonListRow key={i} />)}</View>;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} variant="inline" />;
  return (
    <PortfolioList
      items={query.data?.items || []}
      categories={categories}
      canEdit={(item) => Boolean(item.can_edit)}
      canAdd
      showProject
      projects={projects}
      onOpenProject={onOpenProject}
      title="elitlig-portfoy"
      onAdd={(body) => run(() => createPortfolio(body), "Portföye eklendi.", true)}
      onSave={(pid, body) => run(() => updatePortfolio(pid, body), "Portföy kaydı güncellendi.", true)}
      onRemove={(pid) => run(() => removePortfolio(pid), "Portföy kaydı silindi.")}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  actions: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end" },
  cardFoot: { flexDirection: "row", alignItems: "center", marginTop: space.s, gap: space.sm },
  note: { ...type.bodySm, color: colors.textSecondary, marginTop: space.xs },
  hint: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
});
