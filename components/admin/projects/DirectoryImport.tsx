/**
 * Rehberden ekle: kişisel Rehber kartları, Elitlig üye rehberi (yetki varsa)
 * ve portföy. Seçilenler projenin arama (ya da tedarik) listesine KOPYALANIR;
 * Rehber'e hiçbir şey yazılmaz. Listede olanlar işaretli ve seçilemez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SelectField } from "@/components/admin";
import { Avatar, Badge, BottomSheet, Button, Chip, ChipGroup, EmptyState, ErrorState, Input, SegmentedControl, SkeletonListRow, Touchable } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { LEAD_KINDS, prettyPhone, stagesOf } from "@/lib/admin/projectUtils";
import { getDirectory, projectKeys, type DirectoryRow, type LeadKind } from "@/lib/api/admin/projects";
import { colors, radius, space, textScale, type } from "@/theme";

import { useProject } from "./ProjectContext";

const SOURCES: { key: "contacts" | "members" | "portfolio"; label: string }[] = [
  { key: "contacts", label: "Rehberim" },
  { key: "members", label: "Üye rehberi" },
  { key: "portfolio", label: "Portföy" },
];
const MEMBER_CATEGORIES: [string, string][] = [["", "Tüm üyeler"], ["uye", "Üye"], ["oyuncu", "Oyuncu"], ["takim_baskani", "Takım başkanı"], ["yonetim", "Yönetim"]];
const keyOf = (r: DirectoryRow) => `${r.source}:${r.ref_id}`;

export function DirectoryImportSheet({ visible, onClose, kind: initialKind, stage: initialStage }: { visible: boolean; onClose: () => void; kind: LeadKind; stage?: string }) {
  const { id, data, settings, ops, notify } = useProject();
  const [source, setSource] = useState<"contacts" | "members" | "portfolio">("contacts");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<DirectoryRow[]>([]);
  const [picked, setPicked] = useState<Map<string, DirectoryRow>>(new Map());
  const [kind, setKind] = useState<LeadKind>(initialKind);
  const [stage, setStage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stages = stagesOf(settings, kind);

  useEffect(() => {
    if (!visible) return;
    setSource("contacts");
    setText("");
    setQ("");
    setCategory("");
    setPage(1);
    setPicked(new Map());
    setKind(initialKind);
    setStage(initialStage && stagesOf(settings, initialKind).some((s) => s.key === initialStage) ? initialStage : null);
    setError(null);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arama 250 ms gecikmeli.
  useEffect(() => {
    const t = setTimeout(() => { setQ(text.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [text]);

  const query = useQuery({
    queryKey: [...projectKeys.directory(id), source, kind, q, category, page],
    queryFn: () => getDirectory(id, { source, kind, q: q || undefined, category: source === "members" && category ? category : undefined, page: source === "members" ? page : undefined }),
    enabled: visible,
  });
  useEffect(() => {
    if (!query.data) return;
    setPages((prev) => (page > 1 ? [...prev, ...query.data.items] : query.data.items));
  }, [query.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const available = useMemo(() => Object.fromEntries((query.data?.sources || []).map((s) => [s.key, s.available !== false])), [query.data]);
  const items = pages;
  const selectable = items.filter((r) => !r.in_project);
  const allOn = selectable.length > 0 && selectable.every((r) => picked.has(keyOf(r)));
  const toggle = (r: DirectoryRow) =>
    setPicked((m) => {
      const n = new Map(m);
      if (n.has(keyOf(r))) n.delete(keyOf(r));
      else n.set(keyOf(r), r);
      return n;
    });
  const toggleAll = () =>
    setPicked((m) => {
      const n = new Map(m);
      selectable.forEach((r) => (allOn ? n.delete(keyOf(r)) : n.set(keyOf(r), r)));
      return n;
    });
  const leadName = (lid: number) => data.leads.find((l) => l.id === lid)?.name;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await ops.importDirectory({ items: [...picked.values()].map((r) => ({ source: r.source, ref_id: r.ref_id })), kind, ...(stage ? { stage } : {}) });
      notify(`${out.created} kişi ${kind === "supplier" ? "tedarik" : "arama"} listesine eklendi${out.skipped ? `, ${out.skipped} kayıt zaten listede` : ""}.`);
      onClose();
    } catch (err) {
      setError(errorText(err, "Kişiler aktarılamadı."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title="Rehberden ekle"
      snap="full"
      footer={
        <View style={styles.footer}>
          <View style={styles.row2}>
            <View style={styles.flex}>
              <SegmentedControl items={LEAD_KINDS.map((k) => ({ key: k.key, label: k.short, icon: k.icon }))} value={kind} onChange={(k) => { setKind(k); setStage(null); setPage(1); }} size="sm" />
            </View>
            <View style={styles.flex}>
              <SelectField<string>
                value={stage}
                onChange={setStage}
                clearable
                placeholder={`İlk aşama (${stages[0]?.label || "—"})`}
                sheetTitle="Aşama"
                options={stages.map((s) => ({ value: s.key, label: s.label }))}
              />
            </View>
          </View>
          <Button label={busy ? "Aktarılıyor…" : `Seçilenleri listeye taşı (${picked.size})`} icon="enter-outline" onPress={() => void submit()} loading={busy} disabled={!picked.size} haptic="success" />
        </View>
      }
    >
      <View style={styles.body}>
        <Text style={styles.note} {...textScale.long}>
          Proje listesi Rehber'e eklenmez: seçtikleriniz yalnız bu projenin {kind === "supplier" ? "tedarik" : "arama"} listesine kopyalanır, Rehber ve üye kayıtları değişmez.
        </Text>
        <ChipGroup contentPadding={0}>
          {SOURCES.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              size="sm"
              selected={source === s.key}
              disabled={available[s.key] === false}
              onPress={() => { setSource(s.key); setPage(1); }}
            />
          ))}
        </ChipGroup>
        {available.members === false && source !== "members" ? (
          <Text style={styles.small} {...textScale.dense}>Üye rehberi için "Üyeleri görüntüleme" yetkisi gerekir.</Text>
        ) : null}
        <Input variant="search" value={text} onChangeText={setText} placeholder="Ad, telefon, kurum, şehir…" />
        {source === "members" ? (
          <ChipGroup contentPadding={0}>
            {MEMBER_CATEGORIES.map(([k, l]) => (
              <Chip key={k || "all"} label={l} size="sm" selected={category === k} onPress={() => { setCategory(k); setPage(1); }} />
            ))}
          </ChipGroup>
        ) : null}
        {selectable.length ? <Button label={allOn ? "Görünenlerin seçimini kaldır" : "Görünenlerin tümünü seç"} variant="ghost" size="sm" onPress={toggleAll} /> : null}
        {error ? <Text style={styles.error} {...textScale.long}>{error}</Text> : null}
        {query.isLoading && page === 1 ? (
          [0, 1, 2, 3].map((i) => <SkeletonListRow key={i} />)
        ) : query.error && !items.length ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} variant="inline" />
        ) : !items.length ? (
          <EmptyState compact variant="inline" icon="people-outline" title="Kişi bulunamadı" body={q ? "Aramayı değiştirin." : `${SOURCES.find((s) => s.key === source)?.label} boş.`} />
        ) : (
          items.map((r) => {
            const on = picked.has(keyOf(r));
            const inList = Boolean(r.in_project);
            return (
              <Touchable
                key={keyOf(r)}
                disabled={inList}
                onPress={() => toggle(r)}
                style={[styles.row, on ? styles.rowOn : null, inList ? styles.rowIn : null]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on || inList, disabled: inList }}
                accessibilityLabel={`${r.name} seç`}
              >
                <Ionicons name={on || inList ? "checkbox" : "square-outline"} size={22} color={inList ? colors.win : on ? colors.brandAccent : colors.textTertiary} />
                <Avatar name={r.name} size={32} />
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1} {...textScale.dense}>{r.name}</Text>
                  <Text style={styles.small} numberOfLines={2} {...textScale.dense}>
                    {[r.company, r.title, prettyPhone(r.phone), r.email, r.city].filter(Boolean).join(" · ") || "—"}
                  </Text>
                </View>
                {inList ? <Badge label={leadName(r.in_project!) && leadName(r.in_project!) !== r.name ? `Listede: ${leadName(r.in_project!)}` : "Listede"} tone="win" icon="checkmark" size="xs" /> : r.category ? <Badge label={r.category} tone="neutral" size="xs" /> : null}
              </Touchable>
            );
          })
        )}
        {query.data?.has_more && source === "members" ? (
          <Button label="Daha fazla yükle" variant="ghost" size="sm" loading={query.isFetching} onPress={() => setPage((p) => p + 1)} />
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  footer: { gap: space.sm },
  row2: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  flex: { flex: 1 },
  note: { ...type.bodySm, color: colors.textSecondary, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  small: { ...type.caption, color: colors.textTertiary },
  error: { ...type.bodySm, color: colors.danger },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.md },
  rowOn: { backgroundColor: colors.brandDim },
  rowIn: { opacity: 0.6 },
  name: { ...type.label, color: colors.textPrimary },
});
