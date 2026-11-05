/**
 * SEZONLAR — web editor_pages/Editor_Seasons.js'in yerel karşılığı.
 *
 * Her sezonun KURAL KİTAPÇIĞI burada seçilir: puanlama sistemi ve kadro
 * kuralları kitapçıktan gelir (satırda özet olarak görünür; değişikliği
 * Lig ayarları → Kural kitapçıkları yapar). Liste lig süzgeçli; arşivdekiler
 * ayrı çipte. Dokununca eylem sayfası: düzenle, kitapçık seç, lig statüsü,
 * arşiv, sil.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

import {
  ActionSheet,
  AdminList,
  AdminScreen,
  FormSheet,
  OptionSheet,
  RecordCard,
  SelectField,
  StatRow,
  confirmAction,
  useAdminMutation,
  type FieldDef,
  type FormValues,
  type Option,
} from "@/components/admin";
import { FAB } from "@/components/ui";
import { hasAnyPermission, hasPermission } from "@/lib/admin/access";
import {
  RULE_BOOK_STATUS_LABELS,
  assignSeasonRuleBook,
  createSeason,
  deleteSeason,
  listLeagues,
  listRuleBooks,
  listRuleSets,
  listSeasons,
  scoringSummary,
  seasonScoringText,
  setSeasonArchived,
  updateSeason,
  type RuleBook,
  type Season,
} from "@/lib/api/admin/leagues";
import { foldText, isArchived, isNationwide, seasonBelongsToLeague } from "@/lib/api/admin/lookups";
import { useAuth } from "@/providers/AuthProvider";

const PERMS = ["seasons.create", "seasons.update", "seasons.delete", "seasons.archive", "seasons.rule_set"];
const KEY = ["admin", "seasons"] as const;
type Filter = "active" | "archived" | "all";

const prio = (s: Season) => (s.season_priority == null ? Number.POSITIVE_INFINITY : Number(s.season_priority));

export default function SeasonsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const user = auth.user;
  const nationwide = isNationwide(user);
  const can = {
    create: hasPermission(user, "seasons.create"),
    edit: hasPermission(user, "seasons.update"),
    // Kitapçık listesi rule_books.update ile okunur; seçim sezonu günceller.
    book: hasPermission(user, "seasons.update") && hasPermission(user, "rule_books.update"),
    archive: hasPermission(user, "seasons.archive"),
    remove: hasPermission(user, "seasons.delete"),
    structure: hasAnyPermission(user, ["groups.view", "groups.create", "groups.update", "groups.delete"]),
  };

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Season | null>(null);
  const [editing, setEditing] = useState<Season | "new" | null>(null);
  const [bookFor, setBookFor] = useState<Season | null>(null);

  const seasons = useQuery({ queryKey: [...KEY, user?.city ?? ""], queryFn: () => listSeasons(user) });
  const leagues = useQuery({ queryKey: ["admin", "leagues", user?.city ?? ""], queryFn: () => listLeagues(user) });
  const books = useQuery({ queryKey: ["admin", "rule-books", "all"], queryFn: () => listRuleBooks(), enabled: can.book });
  const ruleSets = useQuery({
    queryKey: ["admin", "rule-sets"],
    queryFn: listRuleSets,
    enabled: hasAnyPermission(user, ["seasons.rule_set", "roster_rules.view"]),
  });

  const leagueList = leagues.data ?? [];
  const bookOf = (season: Season): RuleBook | null =>
    (books.data ?? []).find((b) => (b.seasons ?? []).some((s) => Number(s.id) === Number(season.id))) ?? null;
  const ruleSetName = (season: Season) => {
    if (!season.roster_rule_set_id) return null;
    return ruleSets.data?.find((r) => Number(r.id) === Number(season.roster_rule_set_id))?.name || "Kadro kuralları uygulanıyor";
  };
  const leagueName = (season: Season) => {
    const league = leagueList.find((l) => seasonBelongsToLeague(season, l));
    return league?.league_name || season.league_name || "";
  };

  const all = seasons.data ?? [];
  const stats = useMemo(() => {
    const active = all.filter((s) => !isArchived(s));
    return {
      active: active.length,
      archived: all.length - active.length,
      custom: active.filter((s) => s.standings_type === "ozel").length,
      ruleSet: active.filter((s) => s.roster_rule_set_id).length,
    };
  }, [all]);

  const rows = useMemo(() => {
    const needle = foldText(q);
    const league = leagueId ? leagueList.find((l) => l.id === leagueId) : null;
    return all
      .filter((s) => (filter === "all" ? true : filter === "archived" ? isArchived(s) : !isArchived(s)))
      .filter((s) => (league ? seasonBelongsToLeague(s, league) : true))
      .filter((s) => !needle || foldText(`${s.season_name} ${s.league_name ?? ""}`).includes(needle))
      .sort(
        (a, b) =>
          Number(isArchived(a)) - Number(isArchived(b)) ||
          String(a.league_name).localeCompare(String(b.league_name), "tr") ||
          prio(a) - prio(b) ||
          b.id - a.id
      );
  }, [all, q, filter, leagueId, leagueList]);

  const invalidate = [KEY, ["admin", "rule-books"]];

  const save = useAdminMutation<FormValues, unknown>(
    (v: FormValues) => {
      if (editing === "new") {
        const league = leagueList.find((l) => l.id === Number(v.league_id));
        if (!league) throw new Error("Bir lig seçin.");
        return createSeason({
          season_name: String(v.season_name ?? ""),
          league,
          season_priority: v.season_priority,
          rule_book_id: (v.rule_book_id as string) || null,
          fallbackCity: user?.city,
        });
      }
      return updateSeason((editing as Season).id, { season_name: String(v.season_name ?? ""), season_priority: v.season_priority });
    },
    { success: editing === "new" ? "Sezon oluşturuldu." : "Sezon güncellendi.", invalidate }
  );

  const assign = useAdminMutation(
    ({ season, book }: { season: Season; book: RuleBook | null }) => assignSeasonRuleBook(season.id, book?.id ?? null),
    { success: (_, v) => (v.book ? "Kural kitapçığı seçildi." : "Kural kitapçığı kaldırıldı."), invalidate }
  );

  const archive = useAdminMutation((s: Season) => setSeasonArchived(s.id, !isArchived(s)), {
    success: (_, s) => (isArchived(s) ? `"${s.season_name}" arşivden çıkarıldı.` : `"${s.season_name}" arşive alındı.`),
    invalidate,
  });

  const remove = useAdminMutation((s: Season) => deleteSeason(s.id), {
    success: (_, s) => `"${s.season_name}" silindi.`,
    invalidate,
  });

  const leagueOptions: Option<number>[] = leagueList
    .filter((l) => !isArchived(l))
    .map((l) => ({ value: l.id, label: l.league_name, hint: nationwide ? l.city ?? null : null }));
  const bookOptions: Option<string>[] = (books.data ?? []).map((b) => ({
    value: b.id,
    label: b.status === "draft" ? `${b.title} (taslak)` : b.title,
    hint: b.manage_summary?.scoring ? scoringSummary(b.manage_summary.scoring) : RULE_BOOK_STATUS_LABELS[b.status] ?? null,
  }));

  const fields: FieldDef[] =
    editing === "new"
      ? [
          { key: "league_id", label: "Lig", kind: "select", required: true, options: leagueOptions },
          { key: "season_name", label: "Sezon adı", kind: "text", required: true, placeholder: "ör. 2026-2027 Güz", maxLength: 120 },
          { key: "season_priority", label: "Öncelik", kind: "number", placeholder: "ör. 1" },
          ...(can.book
            ? [{ key: "rule_book_id", label: "Kural kitapçığı", kind: "select", options: bookOptions, placeholder: "Kitapçık yok", hint: "Sezonun kuralları, puanlaması ve kadro kuralları kitapçıktan gelir." } as FieldDef]
            : []),
        ]
      : [
          { key: "season_name", label: "Sezon adı", kind: "text", required: true, maxLength: 120 },
          { key: "season_priority", label: "Öncelik", kind: "number" },
        ];

  const pickBook = async (season: Season, publicId: string | null) => {
    const current = bookOf(season);
    if ((publicId || "") === (current?.id || "")) return;
    const next = (books.data ?? []).find((b) => b.id === publicId) ?? null;
    const scoring = next?.manage_summary?.scoring;
    const ok = await confirmAction({
      title: next ? "Kural kitapçığı seçilsin mi?" : "Kitapçık kaldırılsın mı?",
      message: next
        ? `"${season.season_name}" sezonunda "${next.title}" geçerli olacak.${
            scoring
              ? `\n\nPuanlama: ${scoringSummary(scoring)}${next.manage_summary?.roster ? " · kadro kuralları uygulanır" : ""}. Puanlama değişirse puan tablosu yeniden hesaplanır.`
              : ""
          }`
        : `"${season.season_name}" sezonunun kural kitapçığı kaldırılacak. Puanlama ve kadro kuralları olduğu gibi kalır.`,
      confirmLabel: next ? "Seç" : "Kaldır",
    });
    if (ok) assign.mutate({ season, book: next });
  };

  const askArchive = async (s: Season) => {
    const archived = isArchived(s);
    const ok = await confirmAction({
      title: archived ? "Arşivden çıkarılsın mı?" : "Arşive alınsın mı?",
      message: archived
        ? `"${s.season_name}" sezonu arşivden çıkarılacak.`
        : `"${s.season_name}" sezonu filtrelerden, maç oluşturma ekranından ve içerik havuzundan kalkar. İstatistikler olduğu gibi kalır.`,
      confirmLabel: archived ? "Arşivden çıkar" : "Arşive al",
    });
    if (ok) archive.mutate(s);
  };

  const askDelete = async (s: Season) => {
    const ok = await confirmAction({
      title: "Sezon silinsin mi?",
      message: `"${s.season_name}" silinecek. Silinen sezon çöp kutusuna taşınır; oradan geri alınabilir.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate(s);
  };

  return (
    <AdminScreen
      title="Sezonlar"
      permission={PERMS}
      scroll={false}
      overlay={
        can.create ? (
          <FAB icon="add" label="Yeni sezon" extended onPress={() => setEditing("new")} accessibilityLabel="Yeni sezon" />
        ) : null
      }
    >
      <AdminList
        data={rows}
        loading={seasons.isLoading}
        error={seasons.error}
        onRetry={seasons.refetch}
        refreshing={seasons.isRefetching}
        onRefresh={() => {
          void seasons.refetch();
          void books.refetch();
        }}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Sezon ara"
        filters={[
          { key: "active", label: "Aktif", count: stats.active },
          { key: "archived", label: "Arşivde", count: stats.archived },
          { key: "all", label: "Tümü", count: all.length },
        ]}
        filter={filter}
        onFilter={(k) => setFilter(k as Filter)}
        extraHeader={
          <>
            <StatRow
              items={[
                { label: "Aktif sezon", value: stats.active, tone: "brand" },
                { label: "Özel puanlamalı", value: stats.custom },
                { label: "Kadro kurallı", value: stats.ruleSet },
                { label: "Arşivde", value: stats.archived },
              ]}
            />
            <SelectField<number>
              value={leagueId}
              onChange={(v) => setLeagueId(v)}
              options={leagueList.map((l) => ({
                value: l.id,
                label: isArchived(l) ? `${l.league_name} (Arşiv)` : l.league_name,
                hint: nationwide ? l.city ?? null : null,
              }))}
              placeholder="Tüm ligler"
              icon="trophy-outline"
              clearable
              sheetTitle="Lig seç"
            />
          </>
        }
        summary={`${rows.length} sezon`}
        keyExtractor={(s) => String(s.id)}
        emptyIcon="calendar-outline"
        emptyTitle={q ? "Aramaya uyan sezon yok" : "Sezon yok"}
        emptyBody={can.create && !q ? "Sağ alttaki düğmeyle ilk sezonu oluştur." : undefined}
        renderItem={({ item }) => {
          const book = bookOf(item);
          const rs = ruleSetName(item);
          return (
            <RecordCard
              title={item.season_name}
              subtitle={[leagueName(item), nationwide ? item.city : null].filter(Boolean).join(" · ")}
              meta={[seasonScoringText(item), rs ?? "Kadro kuralı yok"].join(" · ")}
              icon="calendar-outline"
              iconTone={isArchived(item) ? "neutral" : "brand"}
              muted={isArchived(item)}
              badges={[
                item.season_priority != null && { label: `#${item.season_priority}` },
                can.book && { label: book ? book.title : "Kitapçık yok", tone: book ? "info" : "neutral", icon: "book-outline" },
                isArchived(item) && { label: "Arşivde", icon: "archive-outline" },
              ]}
              onPress={() => setSelected(item)}
            />
          );
        }}
      />

      <ActionSheet
        visible={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.season_name}
        actions={
          selected
            ? [
                { label: "Düzenle", hint: "Ad ve öncelik", icon: "create-outline", hidden: !can.edit, onPress: () => setEditing(selected) },
                {
                  label: "Kural kitapçığı seç",
                  hint: bookOf(selected)?.title ?? "Kitapçık yok",
                  icon: "book-outline",
                  hidden: !can.book,
                  onPress: () => setBookFor(selected),
                },
                {
                  label: "Lig statüsü",
                  hint: "Gruplar ve eleme turları",
                  icon: "git-network-outline",
                  hidden: !can.structure,
                  onPress: () => router.push(`/yonetim/lig-ayarlari/statu?sezon=${selected.id}`),
                },
                {
                  label: isArchived(selected) ? "Arşivden çıkar" : "Arşive al",
                  icon: isArchived(selected) ? "arrow-undo-outline" : "archive-outline",
                  hidden: !can.archive,
                  onPress: () => void askArchive(selected),
                },
                { label: "Sil", icon: "trash-outline", danger: true, hidden: !can.remove, onPress: () => void askDelete(selected) },
              ]
            : []
        }
      />

      <OptionSheet<string>
        visible={bookFor != null}
        onClose={() => setBookFor(null)}
        title="Kural kitapçığı"
        options={bookOptions}
        value={bookFor ? bookOf(bookFor)?.id ?? null : null}
        clearable
        searchable
        onSelect={(value) => {
          const season = bookFor;
          setBookFor(null);
          if (season) void pickBook(season, (value as string | null) ?? null);
        }}
      />

      <FormSheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Yeni sezon" : "Sezonu düzenle"}
        fields={fields}
        initial={
          editing && editing !== "new"
            ? { season_name: editing.season_name, season_priority: editing.season_priority ?? "" }
            : { league_id: leagueId ?? (leagueOptions.length === 1 ? leagueOptions[0].value : null) }
        }
        submitLabel={editing === "new" ? "Sezonu oluştur" : "Kaydet"}
        intro={editing === "new" ? "Kitapçıkları Lig ayarları → Kural kitapçıkları bölümünden yazıp düzenleyebilirsin." : undefined}
        onSubmit={(v) => save.mutateAsync(v)}
      />
    </AdminScreen>
  );
}
