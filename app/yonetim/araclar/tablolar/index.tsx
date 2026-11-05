/**
 * ARAÇLAR → TABLOLAR (web /yonetim/araclar/tablolar — Spreadsheets.js)
 *
 * Hesap tablosu dosyaları: şablondan ya da boş oluşturma, panodan (Excel /
 * CSV kopyası) içe aktarma, yıldızlama, yeniden adlandırma, kendi kopyamı
 * oluşturma, paylaşım (görüntüleyici / düzenleyici), CSV olarak paylaşma,
 * silme ve paylaşılanlardan ayrılma. Dosyaya dokununca düzenleyici açılır.
 *
 * İki bölüm: "Tablolarım" ve "Benimle paylaşılanlar". Uzun basma ya da
 * sağdaki menü düğmesi dosya işlemlerini açar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ActionSheet,
  AdminList,
  AdminScreen,
  FormSheet,
  OptionSheet,
  RecordCard,
  confirmAction,
  useAdminMutation,
  type BadgeSpec,
} from "@/components/admin";
import { ShareSheet } from "@/components/admin/sheets/ShareSheet";
import { shareCsv } from "@/components/admin/sheets/shareFile";
import { BottomSheet, FAB, Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDateTime } from "@/lib/admin/format";
import {
  TEMPLATES,
  addr,
  blankSheet,
  blockFromText,
  sheetToCsv,
  workbookFromCsv,
  type Cell,
  type SheetTemplate,
  type Workbook,
} from "@/lib/admin/sheetEngine";
import {
  createSheet,
  deleteSheet,
  getSheet,
  leaveSheet,
  listSheets,
  updateSheet,
  type SheetMeta,
  type SheetShare,
} from "@/lib/api/admin/sheets";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

type Row = { kind: "header"; key: string; label: string } | { kind: "sheet"; key: string; item: SheetMeta };

const fileBase = (title: string) => title.replace(/[\\/:*?"<>|]/g, "").trim() || "tablo";

export default function SheetsScreen() {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState<SheetMeta | null>(null);
  const [renaming, setRenaming] = useState<SheetMeta | null>(null);
  const [sharing, setSharing] = useState<{ item: SheetMeta; shares: SheetShare[] } | null>(null);
  const [csvPick, setCsvPick] = useState<{ item: SheetMeta; book: Workbook } | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useQuery({ queryKey: ["admin", "sheets", "list"], queryFn: listSheets });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return items.filter(
      (i) => !needle || i.title.toLocaleLowerCase("tr-TR").includes(needle) || (i.owner?.name || "").toLocaleLowerCase("tr-TR").includes(needle)
    );
  }, [items, q]);

  const rows = useMemo<Row[]>(() => {
    const mine = visible.filter((i) => (i.access || "owner") === "owner");
    const shared = visible.filter((i) => i.access && i.access !== "owner");
    if (!shared.length) return mine.map((item) => ({ kind: "sheet", key: `s${item.id}`, item }));
    return [
      ...(mine.length ? [{ kind: "header" as const, key: "h-mine", label: "TABLOLARIM" }] : []),
      ...mine.map((item) => ({ kind: "sheet" as const, key: `s${item.id}`, item })),
      { kind: "header" as const, key: "h-shared", label: "BENİMLE PAYLAŞILANLAR" },
      ...shared.map((item) => ({ kind: "sheet" as const, key: `s${item.id}`, item })),
    ];
  }, [visible]);

  const invalidate = [["admin", "sheets"]];

  const create = async (title: string, data: Workbook) => {
    setBusy(true);
    try {
      const { item } = await createSheet(title, data);
      setPicker(false);
      void query.refetch();
      router.push(`/yonetim/araclar/tablolar/${item.id}` as never);
    } catch (error) {
      toast.show({ message: errorText(error, "Tablo oluşturulamadı."), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const fromTemplate = (tpl: SheetTemplate) => void create(tpl.key === "blank" ? "Adsız tablo" : tpl.name, tpl.build());

  /** Panodaki tablo (Excel'den kopya = sekme ayraçlı, ya da CSV metni) yeni dosya olur. */
  const fromClipboard = async () => {
    const text = await Clipboard.getStringAsync().catch(() => "");
    if (!text.trim()) {
      toast.show({ message: "Panoda içe aktarılacak tablo yok. Excel'den hücreleri kopyalayıp yeniden dene.", tone: "warn" });
      return;
    }
    const name = "İçe aktarılan tablo";
    if (text.includes("\t")) {
      const block = blockFromText(text);
      const cells: Record<string, Cell> = {};
      block.rows.slice(0, 1000).forEach((row, r) =>
        row.slice(0, 52).forEach((cell, c) => {
          if (cell.v !== "") cells[addr(c, r)] = { v: cell.v.startsWith("=") ? `'${cell.v}` : cell.v };
        })
      );
      const cols = Math.min(52, Math.max(26, ...block.rows.map((r) => r.length)));
      await create(name, { sheets: [{ ...blankSheet("Sayfa1"), rows: Math.min(1000, Math.max(100, block.rows.length + 20)), cols, cells }] });
    } else {
      await create(name, workbookFromCsv(text, "Sayfa1"));
    }
  };

  const star = useAdminMutation((item: SheetMeta) => updateSheet(item.id, { starred: !item.starred }), {
    success: (_r, item) => (item.starred ? "Yıldız kaldırıldı." : "Yıldızlandı."),
    invalidate,
  });
  const rename = useAdminMutation((v: { id: number; title: string }) => updateSheet(v.id, { title: v.title }), {
    success: "Dosya adı değişti.",
    invalidate,
  });
  const remove = useAdminMutation((item: SheetMeta) => deleteSheet(item.id), { success: "Tablo silindi.", invalidate });
  const leave = useAdminMutation((item: SheetMeta) => leaveSheet(item.id), { success: "Paylaşımdan ayrıldın.", invalidate });
  const duplicate = useAdminMutation(
    async (item: SheetMeta) => {
      const { item: full } = await getSheet(item.id);
      return createSheet(`${item.title} (kopya)`.slice(0, 120), full.data);
    },
    { success: "Kopyan oluşturuldu.", invalidate }
  );

  const openShare = async (item: SheetMeta) => {
    try {
      const { item: full } = await getSheet(item.id);
      setSharing({ item, shares: full.shares || [] });
    } catch (error) {
      toast.show({ message: errorText(error, "Paylaşım bilgisi alınamadı."), tone: "danger" });
    }
  };

  const exportCsv = async (item: SheetMeta, book?: Workbook, si?: number) => {
    try {
      const data = book ?? (await getSheet(item.id)).item.data;
      if (si == null && data.sheets.length > 1) {
        setCsvPick({ item, book: data });
        return;
      }
      const index = si ?? 0;
      await shareCsv(`${fileBase(item.title)} - ${data.sheets[index].name}`, sheetToCsv(data, index));
    } catch (error) {
      toast.show({ message: errorText(error, "CSV oluşturulamadı."), tone: "danger" });
    }
  };

  const askDelete = async (item: SheetMeta) => {
    if (await confirmAction({ title: "Tablo silinsin mi?", message: `"${item.title}" kalıcı olarak silinir.`, confirmLabel: "Sil", destructive: true })) remove.mutate(item);
  };
  const askLeave = async (item: SheetMeta) => {
    if (
      await confirmAction({
        title: "Paylaşımdan ayrıl",
        message: `"${item.title}" tablosuna erişimin kaldırılır. Sahibi seni yeniden ekleyebilir.`,
        confirmLabel: "Ayrıl",
        destructive: true,
      })
    )
      leave.mutate(item);
  };

  const own = menu ? (menu.access || "owner") === "owner" : false;

  return (
    <AdminScreen
      title="Tablolar"
      subtitle="Formüllü hesap tabloları"
      scroll={false}
      overlay={<FAB icon="add" label="Yeni tablo" extended onPress={() => setPicker(true)} accessibilityLabel="Yeni tablo" />}
    >
      <AdminList<Row>
        data={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Dosya ara"
        summary={items.length ? `${items.length} dosya` : null}
        emptyIcon="grid-outline"
        emptyTitle={q ? "Aramaya uyan dosya yok" : "Henüz tablo yok"}
        emptyBody={q ? undefined : "Aidat, bütçe, puan durumu, katılım… Hazır formüllü bir şablonla başla."}
        emptyAction={q ? undefined : { label: "Yeni tablo", onPress: () => setPicker(true) }}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) =>
          item.kind === "header" ? (
            <Text style={styles.section} {...textScale.dense}>
              {item.label}
            </Text>
          ) : (
            <SheetCard
              item={item.item}
              onPress={() => router.push(`/yonetim/araclar/tablolar/${item.item.id}` as never)}
              onMenu={() => setMenu(item.item)}
              onStar={() => star.mutate(item.item)}
            />
          )
        }
      />

      <BottomSheet visible={picker} onClose={() => setPicker(false)} title="Yeni tablo">
        <View style={styles.templates}>
          <Text style={styles.intro} {...textScale.dense}>
            Boş bir tabloyla ya da hazır formüllü bir şablonla başla.
          </Text>
          {TEMPLATES.map((tpl) => (
            <Touchable key={tpl.key} onPress={() => fromTemplate(tpl)} disabled={busy} style={styles.template} accessibilityLabel={tpl.name}>
              <View style={styles.tplIcon}>
                <Ionicons name={tpl.icon} size={20} color={colors.brandAccent} />
              </View>
              <View style={styles.tplMain}>
                <Text style={styles.tplName} {...textScale.dense}>
                  {tpl.name}
                </Text>
                <Text style={styles.tplDesc} {...textScale.dense}>
                  {tpl.description}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Touchable>
          ))}
          <Touchable onPress={() => void fromClipboard()} disabled={busy} style={styles.template} accessibilityLabel="Panodan içe aktar">
            <View style={styles.tplIcon}>
              <Ionicons name="clipboard-outline" size={20} color={colors.brandAccent} />
            </View>
            <View style={styles.tplMain}>
              <Text style={styles.tplName} {...textScale.dense}>
                Panodan içe aktar
              </Text>
              <Text style={styles.tplDesc} {...textScale.dense}>
                Excel / Google E-Tablolar'dan kopyalanan hücreler ya da CSV metni.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Touchable>
        </View>
      </BottomSheet>

      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.title}
        actions={[
          { label: "Aç", icon: "open-outline", onPress: () => menu && router.push(`/yonetim/araclar/tablolar/${menu.id}` as never) },
          {
            label: "Paylaş",
            icon: "person-add-outline",
            hint: menu?.share_count ? `${menu.share_count} kişiyle paylaşıldı` : undefined,
            onPress: () => menu && void openShare(menu),
            hidden: !own,
          },
          { label: "Yeniden adlandır", icon: "create-outline", onPress: () => setRenaming(menu), hidden: !own },
          { label: menu?.starred ? "Yıldızı kaldır" : "Yıldızla", icon: menu?.starred ? "star" : "star-outline", onPress: () => menu && star.mutate(menu), hidden: !own },
          { label: "CSV olarak paylaş", icon: "document-text-outline", onPress: () => menu && void exportCsv(menu) },
          { label: "Kendi kopyamı oluştur", icon: "copy-outline", onPress: () => menu && duplicate.mutate(menu) },
          own
            ? { label: "Sil", icon: "trash-outline", danger: true, onPress: () => menu && void askDelete(menu) }
            : { label: "Paylaşımdan ayrıl", icon: "exit-outline", danger: true, onPress: () => menu && void askLeave(menu) },
        ]}
      />

      <FormSheet
        visible={renaming != null}
        onClose={() => setRenaming(null)}
        title="Yeniden adlandır"
        fields={[{ key: "title", label: "Dosya adı", kind: "text", required: true, maxLength: 120 }]}
        initial={{ title: renaming?.title ?? "" }}
        onSubmit={(v) => (renaming ? rename.mutateAsync({ id: renaming.id, title: String(v.title).trim() }) : undefined)}
      />

      <OptionSheet<number>
        visible={csvPick != null}
        onClose={() => setCsvPick(null)}
        title="Hangi sayfa?"
        options={(csvPick?.book.sheets ?? []).map((s, i) => ({ value: i, label: s.name }))}
        onSelect={(v) => {
          const pick = csvPick;
          if (pick && typeof v === "number") setTimeout(() => void exportCsv(pick.item, pick.book, v), 250);
        }}
      />

      {sharing ? (
        <ShareSheet
          visible
          onClose={() => setSharing(null)}
          sheetId={sharing.item.id}
          title={sharing.item.title}
          initialShares={sharing.shares}
        />
      ) : null}
    </AdminScreen>
  );
}

const SheetCard = React.memo(function SheetCard({
  item,
  onPress,
  onMenu,
  onStar,
}: {
  item: SheetMeta;
  onPress: () => void;
  onMenu: () => void;
  onStar: () => void;
}) {
  const own = (item.access || "owner") === "owner";
  const badges: BadgeSpec[] = [
    ...(!own ? [{ label: item.access === "editor" ? "Düzenleyici" : "Görüntüleyici", tone: item.access === "editor" ? ("brand" as const) : ("neutral" as const), icon: item.access === "editor" ? ("create-outline" as const) : ("eye-outline" as const) }] : []),
    ...(own && item.share_count ? [{ label: `${item.share_count} kişiyle paylaşıldı`, tone: "info" as const, icon: "people-outline" as const }] : []),
  ];
  const sub = [!own && item.owner?.name ? `Sahibi: ${item.owner.name}` : null, `${item.sheet_count} sayfa · ${item.cell_count} dolu hücre`].filter(Boolean).join(" · ");
  return (
    <RecordCard
      title={item.title}
      subtitle={sub}
      meta={`Son düzenleme ${formatDateTime(item.updatedAt)}${item.updated_by_name ? ` · ${item.updated_by_name}` : ""}`}
      icon="grid-outline"
      iconTone="win"
      badges={badges}
      onPress={onPress}
      onLongPress={onMenu}
      trailing={
        <View style={styles.trailing}>
          {own ? (
            <Touchable onPress={onStar} hitSlop={8} feedback="icon" accessibilityLabel={item.starred ? "Yıldızı kaldır" : "Yıldızla"}>
              <Ionicons name={item.starred ? "star" : "star-outline"} size={18} color={item.starred ? colors.star : colors.textTertiary} />
            </Touchable>
          ) : null}
          <Touchable onPress={onMenu} hitSlop={8} feedback="icon" accessibilityLabel={`${item.title} işlemleri`}>
            <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
          </Touchable>
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  section: { ...type.overline, color: colors.textTertiary, paddingTop: space.sm },
  trailing: { flexDirection: "row", alignItems: "center", gap: space.md },
  templates: { gap: space.sm, paddingBottom: space.lg },
  intro: { ...type.bodySm, color: colors.textSecondary },
  template: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  tplIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandDim, alignItems: "center", justifyContent: "center" },
  tplMain: { flex: 1, gap: 2 },
  tplName: { ...type.h4, color: colors.textPrimary },
  tplDesc: { ...type.caption, color: colors.textTertiary },
});
