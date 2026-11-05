/**
 * Rehber → ÜYELER sekmesi (web Contacts.js "Kişiler" görünümünün üye kısmı).
 *
 * Kaynak: GET /api/tools/contacts/directory — "Üyeleri görüntüleme"
 * (users.view) yetkisi ve il kapsamı sunucuda uygulanır; sayfa sayfa gelir.
 * Süzgeçler: kategori (sayılı çipler), durum, il, telefonu olanlar, son 7 gün;
 * sıralama: yeni→eski, eski→yeni, A→Z, Z→A. "Takıma göre" yüklü satırları
 * takım başlıkları altında toplar (başkanlar önce).
 *
 * Dışa aktarım (CSV, vCard, telefon / e-posta kopyalama) süzgece uyan TÜM
 * üyeleri sunucudan tek seferde (export=1) alır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, OptionSheet, RecordCard, type BadgeSpec } from "@/components/admin";
import { Chip, ChipGroup, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { timeAgo } from "@/lib/admin/format";
import {
  CATEGORY_LABELS,
  contactsCsv,
  contactsVcard,
  exportFileName,
  listDirectory,
  MEMBER_SORTS,
  memberTeam,
  prettyPhone,
  STATUS_LABELS,
  type DirectoryMember,
  type ExportRow,
  type MemberCategory,
  type MemberSort,
  type MemberStatus,
  type PersonalContact,
} from "@/lib/api/admin/contacts";
import { colors, space, textScale, type } from "@/theme";

import { shareCsv, shareVcard } from "../sheets/shareFile";
import { ContactButtons } from "./ContactButtons";
import type { ContactActions } from "./useContactActions";

const PAGE_SIZE = 60;
type Category = "all" | MemberCategory;
const CATEGORIES: Category[] = ["all", "uye", "oyuncu", "takim_baskani", "yonetim"];

type Row = { kind: "header"; key: string; label: string; count: number } | { kind: "member"; key: string; member: DirectoryMember };

export interface MembersTabHandle {
  exportAs: (kind: "csv" | "vcf" | "phones" | "emails") => Promise<void>;
}

export const MembersTab = forwardRef<MembersTabHandle, { actions: ContactActions; cards: Map<number, PersonalContact> }>(
  function MembersTab({ actions, cards }, ref) {
    const router = useRouter();
    const toast = useToast();
    const [q, setQ] = useState("");
    const [category, setCategory] = useState<Category>("all");
    const [sort, setSort] = useState<MemberSort>("newest");
    const [status, setStatus] = useState<string | null>(null);
    const [city, setCity] = useState<string | null>(null);
    const [hasPhone, setHasPhone] = useState(false);
    const [newOnly, setNewOnly] = useState(false);
    const [byTeam, setByTeam] = useState(false);
    const [picker, setPicker] = useState<"sort" | "city" | "status" | null>(null);

    const params = useMemo(
      () => ({ q, category: category === "all" ? null : category, sort, status, city, has_phone: hasPhone, new: newOnly }),
      [q, category, sort, status, city, hasPhone, newOnly]
    );

    const query = useInfiniteQuery({
      queryKey: ["admin", "contacts", "directory", params],
      queryFn: ({ pageParam }) => listDirectory({ ...params, page: pageParam, page_size: PAGE_SIZE }),
      initialPageParam: 1,
      getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    });

    const members = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
    const first = query.data?.pages[0];
    const counts = first?.counts;

    const rows = useMemo<Row[]>(() => {
      if (!byTeam) return members.map((m) => ({ kind: "member", key: `u${m.id}`, member: m }));
      // Takıma göre: takım adları alfabetik, takımsızlar en sonda; başkanlar önce.
      const map = new Map<string, DirectoryMember[]>();
      members.forEach((m) => {
        const label = memberTeam(m)?.name || "Takımsız";
        map.set(label, [...(map.get(label) ?? []), m]);
      });
      return [...map.entries()]
        .sort(([a], [b]) => Number(a === "Takımsız") - Number(b === "Takımsız") || a.localeCompare(b, "tr"))
        .flatMap(([label, list]) => [
          { kind: "header" as const, key: `h-${label}`, label, count: list.length },
          ...[...list]
            .sort((x, y) => Number(Boolean(memberTeam(y)?.captain)) - Number(Boolean(memberTeam(x)?.captain)))
            .map((m) => ({ kind: "member" as const, key: `u${m.id}`, member: m })),
        ]);
    }, [members, byTeam]);

    const toExport = (m: DirectoryMember): ExportRow => {
      const card = cards.get(Number(m.id));
      return {
        name: m.name,
        username: m.username,
        categories: m.categories,
        phone: m.phone,
        email: m.email,
        city: m.city,
        org: m.team?.name || m.player?.team || null,
        status: m.status,
        createdAt: m.createdAt,
        note: card?.note ?? null,
      };
    };

    useImperativeHandle(ref, () => ({
      exportAs: async (kind) => {
        try {
          const all = await listDirectory({ ...params, export: true });
          const list = all.items.map(toExport);
          const stamp = new Date().toISOString().slice(0, 10);
          const name = `${exportFileName(`rehber-${category === "all" ? "tumu" : CATEGORY_LABELS[category]}`)}-${stamp}`;
          if (kind === "csv") await shareCsv(name, contactsCsv(list));
          if (kind === "vcf") await shareVcard(name, contactsVcard(list));
          if (kind === "phones") {
            const phones = [...new Set(list.map((r) => prettyPhone(r.phone)).filter(Boolean))];
            await actions.copy(phones.join("\n"), `${phones.length} telefon numarası kopyalandı.`);
          }
          if (kind === "emails") {
            const emails = [...new Set(list.map((r) => r.email).filter(Boolean))];
            await actions.copy(emails.join(", "), `${emails.length} e-posta adresi kopyalandı.`);
          }
        } catch (error) {
          toast.show({ message: errorText(error, "Dışa aktarılamadı."), tone: "danger" });
        }
      },
    }));

    const open = useCallback((id: number) => router.push(`/yonetim/araclar/rehber/uye/${id}` as never), [router]);
    const countOf = (key: Category) => (counts ? (key === "all" ? counts.all : counts[key]) : undefined);
    const sortLabel = MEMBER_SORTS.find((s) => s.key === sort)?.label ?? "Sıralama";
    const anyFilter = Boolean(q || status || city || hasPhone || newOnly);

    const header = (
      <View style={styles.extra}>
        <ChipGroup scrollable contentPadding={0}>
          {CATEGORIES.map((key) => (
            <Chip
              key={key}
              label={key === "all" ? "Tümü" : CATEGORY_LABELS[key]}
              count={countOf(key)}
              size="sm"
              selected={category === key}
              onPress={() => setCategory(key)}
            />
          ))}
        </ChipGroup>
        <ChipGroup scrollable contentPadding={0}>
          <Chip label={sortLabel} icon="swap-vertical" size="sm" onPress={() => setPicker("sort")} />
          <Chip label="Telefonu olanlar" icon="call-outline" size="sm" selected={hasPhone} onPress={() => setHasPhone((v) => !v)} />
          {counts?.new_week || newOnly ? (
            <Chip label={`${counts?.new_week ?? 0} yeni`} icon="sparkles-outline" size="sm" selected={newOnly} onPress={() => setNewOnly((v) => !v)} />
          ) : null}
          <Chip label="Takıma göre" icon="layers-outline" size="sm" selected={byTeam} onPress={() => setByTeam((v) => !v)} />
          <Chip
            label={status ? STATUS_LABELS[status as MemberStatus] ?? status : "Tüm durumlar"}
            size="sm"
            selected={Boolean(status)}
            onPress={() => setPicker("status")}
            onDismiss={status ? () => setStatus(null) : undefined}
          />
          {first?.cities?.length || city ? (
            <Chip
              label={city ?? "Tüm iller"}
              icon="location-outline"
              size="sm"
              selected={Boolean(city)}
              onPress={() => setPicker("city")}
              onDismiss={city ? () => setCity(null) : undefined}
            />
          ) : null}
        </ChipGroup>
      </View>
    );

    return (
      <>
        <AdminList<Row>
          data={rows}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => void query.refetch()}
          onEndReached={() => void query.fetchNextPage()}
          hasMore={query.hasNextPage}
          loadingMore={query.isFetchingNextPage}
          search={q}
          onSearch={setQ}
          searchPlaceholder="Ad, kullanıcı adı, telefon, e-posta, takım"
          extraHeader={header}
          summary={first ? `${members.length} / ${first.total} üye gösteriliyor` : null}
          emptyIcon="people-outline"
          emptyTitle={anyFilter ? "Aramaya uyan üye yok" : "Rehber boş"}
          keyExtractor={(r) => r.key}
          renderItem={({ item }) =>
            item.kind === "header" ? (
              <View style={styles.groupHead}>
                <Ionicons name={item.label === "Takımsız" ? "people-outline" : "shield-half-outline"} size={14} color={colors.textTertiary} />
                <Text style={styles.groupTitle} numberOfLines={1} {...textScale.dense}>
                  {item.label}
                </Text>
                <Text style={styles.groupCount} {...textScale.dense}>
                  {item.count}
                </Text>
              </View>
            ) : (
              <MemberRow member={item.member} card={cards.get(Number(item.member.id))} actions={actions} hideTeam={byTeam} onPress={() => open(item.member.id)} />
            )
          }
        />
        <OptionSheet<MemberSort>
          visible={picker === "sort"}
          onClose={() => setPicker(null)}
          title="Sıralama"
          options={MEMBER_SORTS.map((s) => ({ value: s.key, label: s.label }))}
          value={sort}
          onSelect={(v) => v && setSort(v as MemberSort)}
        />
        <OptionSheet<string>
          visible={picker === "status"}
          onClose={() => setPicker(null)}
          title="Üyelik durumu"
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          value={status}
          clearable
          onSelect={(v) => setStatus((v as string | null) ?? null)}
        />
        <OptionSheet<string>
          visible={picker === "city"}
          onClose={() => setPicker(null)}
          title="İl"
          options={(first?.cities ?? []).map((c) => ({ value: c, label: c }))}
          value={city}
          clearable
          searchable
          onSelect={(v) => setCity((v as string | null) ?? null)}
        />
      </>
    );
  }
);

export const MemberRow = React.memo(function MemberRow({
  member,
  card,
  actions,
  hideTeam,
  onPress,
}: {
  member: DirectoryMember;
  card?: PersonalContact;
  actions: ContactActions;
  hideTeam?: boolean;
  onPress: () => void;
}) {
  const team = memberTeam(member);
  const badges: BadgeSpec[] = [
    ...(!hideTeam && team ? [{ label: `${team.name}${team.captain ? " · Başkan" : ""}`, tone: team.captain ? ("brand" as const) : ("info" as const), icon: "shield-half-outline" as const }] : []),
    ...member.categories.map((c) => ({ label: CATEGORY_LABELS[c] ?? c, tone: "neutral" as const })),
    ...(member.isNew ? [{ label: "Yeni", tone: "win" as const }] : []),
    ...(member.status && member.status !== "approved" ? [{ label: STATUS_LABELS[member.status as MemberStatus] ?? member.status, tone: "warn" as const }] : []),
    ...(card?.favorite ? [{ label: "Favori", tone: "accent" as const, icon: "star" as const }] : []),
  ];
  const sub = [`@${member.username}`, member.city].filter(Boolean).join(" · ");
  return (
    <RecordCard
      title={member.name}
      subtitle={sub}
      meta={member.createdAt ? `Kayıt ${timeAgo(member.createdAt)}` : null}
      avatar={{ name: member.name }}
      badges={badges}
      onPress={onPress}
      trailing={
        <ContactButtons
          name={member.name}
          phone={member.phone}
          email={member.email}
          userId={member.id}
          staff={member.categories.includes("yonetim")}
          actions={actions}
          only={["tel", "wa"]}
        />
      }
    />
  );
});

const styles = StyleSheet.create({
  extra: { gap: space.sm },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingTop: space.sm },
  groupTitle: { ...type.overline, color: colors.textTertiary, flex: 1 },
  groupCount: { ...type.caption, color: colors.textTertiary },
});
