/**
 * LİGLER — web editor_pages/Editor_Leagues.js'in yerel karşılığı.
 *
 * Liste (öncelik sırası; arşivdekiler sonda) → dokununca eylem sayfası:
 * düzenle (ad + öncelik), logo yükle, arşive al / çıkar, sil. Türkiye geneli
 * yetkili hesaplar il süzgecini ve yeni ligde il seçimini görür; il
 * yetkilisinin listesi zaten kendi iliyle sınırlıdır (sunucu /by-city).
 *
 * Arşiv lige bağlı TÜM sezonları da arşive alır; istatistikler silinmez.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  ActionSheet,
  AdminList,
  AdminScreen,
  FormSheet,
  RecordCard,
  SelectField,
  confirmAction,
  useAdminMutation,
  type FieldDef,
  type FormValues,
} from "@/components/admin";
import { pickImageFile } from "@/components/admin/team/ImageUpload";
import { FAB, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import {
  createLeague,
  deleteLeague,
  listLeagues,
  setLeagueArchived,
  updateLeague,
  uploadLeagueLogo,
  type League,
} from "@/lib/api/admin/leagues";
import { foldText, isArchived, isNationwide, loadCityOptions } from "@/lib/api/admin/lookups";
import { useAuth } from "@/providers/AuthProvider";

const PERMS = ["leagues.create", "leagues.update", "leagues.delete", "leagues.archive"];
const KEY = ["admin", "leagues"] as const;

type Filter = "active" | "archived" | "all";

const priority = (l: League) => (l.league_priority == null ? Number.POSITIVE_INFINITY : Number(l.league_priority));

export default function LeaguesScreen() {
  const auth = useAuth();
  const toast = useToast();
  const user = auth.user;
  const nationwide = isNationwide(user);
  const can = {
    create: hasAnyPermission(user, ["leagues.create"]),
    update: hasAnyPermission(user, ["leagues.update"]),
    archive: hasAnyPermission(user, ["leagues.archive"]),
    remove: hasAnyPermission(user, ["leagues.delete"]),
  };

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [city, setCity] = useState<string | null>(null);
  const [selected, setSelected] = useState<League | null>(null);
  const [editing, setEditing] = useState<League | "new" | null>(null);

  const query = useQuery({ queryKey: [...KEY, user?.city ?? ""], queryFn: () => listLeagues(user) });
  const all = query.data ?? [];

  const counts = useMemo(() => {
    const archived = all.filter(isArchived).length;
    return { active: all.length - archived, archived, all: all.length };
  }, [all]);

  const rows = useMemo(() => {
    const needle = foldText(q);
    return all
      .filter((l) => (filter === "all" ? true : filter === "archived" ? isArchived(l) : !isArchived(l)))
      .filter((l) => !city || foldText(l.city) === foldText(city))
      .filter((l) => !needle || foldText(`${l.league_name} ${l.city ?? ""}`).includes(needle))
      .sort(
        (a, b) =>
          Number(isArchived(a)) - Number(isArchived(b)) ||
          priority(a) - priority(b) ||
          a.league_name.localeCompare(b.league_name, "tr", { numeric: true })
      );
  }, [all, q, filter, city]);

  const save = useAdminMutation<FormValues, unknown>(
    (v: FormValues) => {
      const body = { league_name: String(v.league_name ?? ""), league_priority: v.league_priority };
      if (editing === "new") return createLeague({ ...body, city: (v.city as string) || user?.city || null });
      return updateLeague((editing as League).id, body);
    },
    { success: editing === "new" ? "Lig oluşturuldu." : "Lig güncellendi.", invalidate: [KEY, ["admin", "seasons"]] }
  );

  const archive = useAdminMutation((l: League) => setLeagueArchived(l.id, !isArchived(l)), {
    success: (res) => (res as { message?: string })?.message || "Arşiv durumu güncellendi.",
    invalidate: [KEY, ["admin", "seasons"]],
  });

  const remove = useAdminMutation((l: League) => deleteLeague(l.id), {
    success: "Lig silindi; çöp kutusundan geri alınabilir.",
    invalidate: [KEY],
  });

  const fields: FieldDef[] = [
    { key: "league_name", label: "Lig adı", kind: "text", required: true, placeholder: "ör. Süper Lig" },
    { key: "league_priority", label: "Öncelik", kind: "number", hint: "Küçük sayı listede önce görünür; boş bırakılabilir." },
    ...(editing === "new" && nationwide
      ? [{ key: "city", label: "İl", kind: "select", required: true, loadOptions: loadCityOptions, queryKey: ["admin", "cities"] } as FieldDef]
      : []),
  ];

  const askArchive = async (l: League) => {
    const archived = isArchived(l);
    const ok = await confirmAction({
      title: archived ? "Arşivden çıkarılsın mı?" : "Arşive alınsın mı?",
      message: archived
        ? `"${l.league_name}" ligi ve sezonları arşivden çıkarılacak.`
        : `"${l.league_name}" ligine ait tüm sezonlar da arşive geçer. Lig filtrelerden, maç oluşturma ekranından ve içerik havuzundan kalkar; istatistikler olduğu gibi kalır.`,
      confirmLabel: archived ? "Arşivden çıkar" : "Arşive al",
    });
    if (ok) archive.mutate(l);
  };

  const askDelete = async (l: League) => {
    const ok = await confirmAction({
      title: "Lig silinsin mi?",
      message: `"${l.league_name}" silinecek. Silinen lig çöp kutusuna taşınır.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate(l);
  };

  const changeLogo = async (l: League) => {
    const file = await pickImageFile(`lig-${l.id}`);
    if (!file) return;
    try {
      await uploadLeagueLogo(l.id, file);
      toast.show({ message: "Lig logosu güncellendi.", tone: "success" });
      void query.refetch();
    } catch (error) {
      toast.show({ message: errorText(error, "Logo yüklenemedi."), tone: "danger" });
    }
  };

  return (
    <AdminScreen
      title="Ligler"
      subtitle={`${counts.active} aktif · ${counts.archived} arşivde`}
      permission={PERMS}
      scroll={false}
      overlay={
        can.create ? (
          <FAB icon="add" label="Yeni lig" extended onPress={() => setEditing("new")} accessibilityLabel="Yeni lig" />
        ) : null
      }
    >
      <AdminList
        data={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={query.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Lig ara"
        filters={[
          { key: "active", label: "Aktif", count: counts.active },
          { key: "archived", label: "Arşivde", count: counts.archived },
          { key: "all", label: "Tümü", count: counts.all },
        ]}
        filter={filter}
        onFilter={(k) => setFilter(k as Filter)}
        extraHeader={
          nationwide ? (
            <SelectField<string>
              value={city}
              onChange={(v) => setCity(v)}
              loadOptions={loadCityOptions}
              queryKey={["admin", "cities"]}
              placeholder="Tüm iller"
              icon="location-outline"
              clearable
              sheetTitle="İl seç"
            />
          ) : null
        }
        summary={`${rows.length} lig`}
        keyExtractor={(l) => String(l.id)}
        emptyIcon="trophy-outline"
        emptyTitle={q ? "Aramaya uyan lig yok" : "Lig yok"}
        emptyBody={can.create && !q ? "Sağ alttaki düğmeyle ilk ligi oluştur." : undefined}
        renderItem={({ item }) => (
          <RecordCard
            title={item.league_name}
            subtitle={[nationwide ? item.city : null, `Öncelik: ${item.league_priority ?? "—"}`].filter(Boolean).join(" · ")}
            avatar={{ name: item.league_name, image: item.league_logo }}
            muted={isArchived(item)}
            badges={[isArchived(item) && { label: "Arşivde", tone: "neutral", icon: "archive-outline" }]}
            onPress={() => setSelected(item)}
          />
        )}
      />

      <ActionSheet
        visible={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.league_name}
        actions={
          selected
            ? [
                { label: "Düzenle", hint: "Ad ve öncelik", icon: "create-outline", hidden: !can.update, onPress: () => setEditing(selected) },
                {
                  label: selected.league_logo ? "Logoyu değiştir" : "Logo yükle",
                  icon: "image-outline",
                  hidden: !can.update,
                  onPress: () => void changeLogo(selected),
                },
                {
                  label: isArchived(selected) ? "Arşivden çıkar" : "Arşive al",
                  hint: "Lige bağlı sezonlar da aynı duruma geçer",
                  icon: isArchived(selected) ? "arrow-undo-outline" : "archive-outline",
                  hidden: !can.archive,
                  onPress: () => void askArchive(selected),
                },
                { label: "Sil", icon: "trash-outline", danger: true, hidden: !can.remove, onPress: () => void askDelete(selected) },
              ]
            : []
        }
      />

      <FormSheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Yeni lig" : "Ligi düzenle"}
        fields={fields}
        initial={
          editing && editing !== "new"
            ? { league_name: editing.league_name, league_priority: editing.league_priority ?? "" }
            : {}
        }
        submitLabel={editing === "new" ? "Oluştur" : "Kaydet"}
        intro={editing !== "new" ? "Ad değişirse bu ligin sezon ve maç kayıtlarındaki lig adı da güncellenir." : undefined}
        onSubmit={(v) => save.mutateAsync(v)}
      />
    </AdminScreen>
  );
}
