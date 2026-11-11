/**
 * NOT DEFTERİ — kişisel renkli notlar (web: /yonetim/araclar/not-defteri).
 *
 * NE: serbest metin ya da işaretlenebilir liste notları. Sabitlenenler üstte
 * ayrı bölümde durur; arama, etiketle süzme, sıralama ve arşiv vardır. Karta
 * dokununca alt sayfada düzenleyici açılır (yazarken kaydedilir); basılı
 * tutunca ya da "…" ile seçenekler: kopyala, çoğalt, paylaş, arşivle, sil.
 * Listedeki maddeler kartın üstünden de işaretlenebilir.
 *
 * DIŞA AKTARIM: web Markdown dosyası indirir; mobilde aynı Markdown metni
 * paylaşım sayfasıyla (Share) gönderilir.
 *
 * UÇLAR: GET/POST/PATCH/DELETE /api/tools/notes (lib/api/admin/tools.ts).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, Share, StyleSheet, Text, View } from "react-native";

import { ActionSheet, AdminScreen, confirmAction, useAdminMutation, type SheetAction } from "@/components/admin";
import { ToolFab } from "@/components/admin/tools/ToolApp";
import { NoteCard } from "@/components/admin/tools/NoteParts";
import { NoteEditorSheet, draftFromNote, emptyDraft, type NoteDraft } from "@/components/admin/tools/NoteEditorSheet";
import {
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  SectionHeader,
  SegmentedControl,
  SkeletonCard,
  Touchable,
  refreshControlProps,
  useRefresh,
  useToast,
} from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import {
  createNote,
  deleteNote,
  listNotes,
  noteText,
  notesToMarkdown,
  toolKeys,
  updateNote,
  type NoteInput,
  type ToolNote,
} from "@/lib/api/admin/tools";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";

type Sort = "updated" | "created" | "title";
const SORTS: { key: Sort; label: string }[] = [
  { key: "updated", label: "Son düzenlenen" },
  { key: "created", label: "Oluşturulma" },
  { key: "title", label: "Başlık (A-Z)" },
];

type Row = { type: "header"; key: string; title: string; meta?: string } | { type: "note"; key: string; note: ToolNote };

const matchesQuery = (note: ToolNote, query: string) => {
  const q = query.trim().toLocaleLowerCase("tr-TR");
  if (!q) return true;
  return `${noteText(note)} ${(note.tags || []).join(" ")}`.toLocaleLowerCase("tr-TR").includes(q);
};

export default function NotebookScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [editor, setEditor] = useState<NoteDraft | null>(null);
  const [menu, setMenu] = useState<ToolNote | null>(null);

  const key = toolKeys.notes(archived);
  const notesQuery = useQuery({ queryKey: key, queryFn: () => listNotes(archived ? "1" : "0") });
  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);

  const refresh = useRefresh(() => void notesQuery.refetch(), { refreshing: notesQuery.isRefetching });

  /** Önbellekteki notu yerinde değiştirir (anlık geri bildirim). */
  const replaceLocal = useCallback(
    (item: ToolNote) => queryClient.setQueryData<ToolNote[]>(key, (list) => list?.map((n) => (n.id === item.id ? item : n))),
    [queryClient, key]
  );
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: toolKeys.notesAll() });
    void queryClient.invalidateQueries({ queryKey: toolKeys.overview() });
  }, [queryClient]);

  const create = useAdminMutation((input: NoteInput) => createNote(input), {
    success: "Not kaydedildi.",
    invalidate: [toolKeys.notesAll(), toolKeys.overview()],
  });
  const remove = useAdminMutation((id: number) => deleteNote(id), {
    success: "Not silindi.",
    invalidate: [toolKeys.notesAll(), toolKeys.overview()],
  });
  const archiveMut = useAdminMutation((note: ToolNote) => updateNote(note.id, { archived: !note.archived }), {
    success: (_r, note) => (note.archived ? "Not arşivden çıkarıldı." : "Not arşivlendi."),
    invalidate: [toolKeys.notesAll(), toolKeys.overview()],
  });

  /** Kart üstü küçük değişiklik: önce ekranda, hata olursa geri al. */
  const patchNote = useCallback(
    async (note: ToolNote, values: NoteInput) => {
      replaceLocal({ ...note, ...values } as ToolNote);
      try {
        const saved = await updateNote(note.id, values);
        replaceLocal(saved);
        void queryClient.invalidateQueries({ queryKey: toolKeys.overview() });
      } catch (error) {
        replaceLocal(note);
        toast.show({ message: errorText(error, "Not güncellenemedi."), tone: "danger" });
      }
    },
    [replaceLocal, queryClient, toast]
  );

  const update = useCallback(
    async (id: number, input: NoteInput) => {
      const saved = await updateNote(id, input);
      replaceLocal(saved);
      void queryClient.invalidateQueries({ queryKey: toolKeys.overview() });
      return saved;
    },
    [replaceLocal, queryClient]
  );

  const askDelete = useCallback(
    async (id: number) => {
      const ok = await confirmAction({ title: "Not silinsin mi?", message: "Not kalıcı olarak silinir.", confirmLabel: "Sil", destructive: true });
      if (!ok) return;
      await remove.mutateAsync(id).catch(() => undefined);
      setEditor(null);
    },
    [remove]
  );

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) for (const t of note.tags) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [notes]);
  const tagNames = useMemo(() => allTags.map(([name]) => name), [allTags]);

  const rows = useMemo<Row[]>(() => {
    const list = notes.filter((note) => matchesQuery(note, query) && (!tag || note.tags.includes(tag)));
    const sorted = [...list].sort((a, b) => {
      if (sort === "title") return (a.title || "").localeCompare(b.title || "", "tr");
      const k = sort === "created" ? "createdAt" : "updatedAt";
      return String(b[k]).localeCompare(String(a[k]));
    });
    const pinned = sorted.filter((n) => n.pinned);
    const others = sorted.filter((n) => !n.pinned);
    const out: Row[] = [];
    if (pinned.length) {
      out.push({ type: "header", key: "h-pinned", title: "Sabitlenenler", meta: String(pinned.length) });
      pinned.forEach((note) => out.push({ type: "note", key: `n${note.id}`, note }));
      if (others.length) out.push({ type: "header", key: "h-others", title: "Diğer notlar", meta: String(others.length) });
    }
    others.forEach((note) => out.push({ type: "note", key: `n${note.id}`, note }));
    return out;
  }, [notes, query, tag, sort]);

  const exportAll = async () => {
    if (!notes.length) return;
    try {
      await Share.share({ title: "ElitLig notlar", message: notesToMarkdown(notes) });
    } catch {
      toast.show({ message: "Paylaşım açılamadı.", tone: "danger" });
    }
  };

  const menuActions: SheetAction[] = menu
    ? [
        { label: "Düzenle", icon: "create-outline", onPress: () => setEditor(draftFromNote(menu)) },
        { label: menu.pinned ? "Sabitlemeyi kaldır" : "Sabitle", icon: "pin-outline", onPress: () => void patchNote(menu, { pinned: !menu.pinned }) },
        {
          label: "Metni kopyala",
          icon: "copy-outline",
          onPress: async () => {
            await Clipboard.setStringAsync(noteText(menu));
            toast.show({ message: "Not panoya kopyalandı.", tone: "success" });
          },
        },
        {
          label: "Çoğalt",
          icon: "duplicate-outline",
          onPress: () =>
            create.mutate({
              kind: menu.kind,
              title: menu.title ? `${menu.title} (kopya)` : "",
              body: menu.body || "",
              checklist: menu.checklist,
              tags: menu.tags,
              color: menu.color,
              pinned: false,
            }),
        },
        { label: "Paylaş", icon: "share-outline", onPress: () => void Share.share({ message: noteText(menu) }).catch(() => undefined) },
        {
          label: menu.archived ? "Arşivden çıkar" : "Arşivle",
          icon: menu.archived ? "arrow-undo-outline" : "archive-outline",
          onPress: () => archiveMut.mutate(menu),
        },
        { label: "Sil", icon: "trash-outline", danger: true, onPress: () => void askDelete(menu.id) },
      ]
    : [];

  const filtered = Boolean(query || tag);

  return (
    <AdminScreen
      app="not-defteri"
      title="Not defteri"
      scroll={false}
      actions={[{ icon: "share-outline", onPress: exportAll, accessibilityLabel: "Notları dışa aktar" }]}
      bottom={
        <View style={styles.segment}>
          <SegmentedControl
            items={[
              { key: "notes", label: "Notlar", icon: "document-text-outline" },
              { key: "archive", label: "Arşiv", icon: "archive-outline" },
            ]}
            value={archived ? "archive" : "notes"}
            onChange={(v) => {
              setArchived(v === "archive");
              setTag("");
            }}
          />
        </View>
      }
      overlay={
        archived ? null : (
          <ToolFab app="not-defteri" label="Not" onPress={() => setEditor(emptyDraft())} accessibilityLabel="Yeni not" />
        )
      }
    >
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Input variant="search" value={query} onChangeText={setQuery} placeholder="Notlarda ara" leadingIcon="search" returnKeyType="search" />
            <ChipGroup contentPadding={0}>
              {SORTS.map((s) => (
                <Chip key={s.key} label={s.label} size="sm" selected={sort === s.key} onPress={() => setSort(s.key)} icon={sort === s.key ? "swap-vertical" : undefined} />
              ))}
            </ChipGroup>
            {allTags.length ? (
              <ChipGroup contentPadding={0}>
                <Chip label="Tümü" size="sm" selected={!tag} onPress={() => setTag("")} />
                {allTags.map(([name, count]) => (
                  <Chip key={name} label={`#${name}`} count={count} size="sm" selected={tag === name} onPress={() => setTag(tag === name ? "" : name)} />
                ))}
              </ChipGroup>
            ) : null}
            {!archived ? (
              <View style={styles.quick}>
                <Touchable feedback="card" onPress={() => setEditor(emptyDraft())} style={styles.quickMain} accessibilityRole="button" accessibilityLabel="Yeni not">
                  <Text style={styles.quickText} {...textScale.dense}>
                    Not alın…
                  </Text>
                </Touchable>
                <Touchable feedback="icon" onPress={() => setEditor(emptyDraft("checklist"))} style={styles.quickIcon} accessibilityLabel="Yeni liste">
                  <Ionicons name="checkbox-outline" size={22} color={colors.textSecondary} />
                </Touchable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          notesQuery.isLoading ? (
            <View style={styles.gap}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : notesQuery.error ? (
            <ErrorState error={notesQuery.error} onRetry={notesQuery.refetch} />
          ) : (
            <EmptyState
              variant="inline"
              icon={archived ? "archive-outline" : "bulb-outline"}
              title={filtered ? "Aramaya uyan not yok" : archived ? "Arşiv boş" : "İlk notunuzu yazın"}
              body={filtered ? "Farklı bir kelime ya da etiket deneyin." : archived ? "Arşivlediğiniz notlar burada saklanır." : "Yukarıdaki kutuya ya da + düğmesine dokunun."}
            />
          )
        }
        renderItem={({ item }) =>
          item.type === "header" ? (
            <SectionHeader title={item.title} meta={item.meta} size="group" inset="flush" />
          ) : (
            <NoteCard
              note={item.note}
              onOpen={(n) => setEditor(draftFromNote(n))}
              onToggleItem={(n, index) =>
                void patchNote(n, { checklist: n.checklist.map((entry, i) => (i === index ? { ...entry, done: !entry.done } : entry)) })
              }
              onTogglePin={(n) => void patchNote(n, { pinned: !n.pinned })}
              onMore={setMenu}
              onTag={setTag}
            />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />

      <NoteEditorSheet
        visible={editor != null}
        initial={editor}
        tagSuggestions={tagNames}
        onClose={() => {
          setEditor(null);
          invalidate();
        }}
        onCreate={(input) => create.mutateAsync(input)}
        onUpdate={update}
        onDelete={(id) => void askDelete(id)}
        onArchive={(id) => {
          const note = notes.find((n) => n.id === id);
          if (note) archiveMut.mutate(note);
          setEditor(null);
        }}
      />

      <ActionSheet visible={menu != null} onClose={() => setMenu(null)} title={menu?.title || "Not"} actions={menuActions} />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  segment: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  list: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant * 2, flexGrow: 1 },
  header: { gap: space.md, marginBottom: space.md },
  gap: { gap: space.md },
  sep: { height: space.sm },
  quick: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  quickMain: { flex: 1, paddingHorizontal: space.lg, paddingVertical: space.md },
  quickText: { ...type.body, color: colors.textTertiary },
  quickIcon: { paddingHorizontal: space.lg, paddingVertical: space.md },
});
