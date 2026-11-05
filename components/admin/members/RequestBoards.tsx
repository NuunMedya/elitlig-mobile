/**
 * Üye talep panoları (web requests/AccountRequestsBoard.js + ChangeRequestsBoard.js).
 *
 *   AccountRequestsBoard  takım yönetimi, sahiplenme, yeni oyuncu / takım,
 *                         ayrılma ve devir talepleri; yeni kayıt talebi mevcut
 *                         kayda bağlanarak da onaylanabilir.
 *   ChangeRequestsBoard   profil, logo, sponsor ve kadrodan çıkarma talepleri;
 *                         alan alan "şu an → istenen" karşılaştırması.
 *
 * Liste: durum çipleri (sayılı), tür ve il süzgeci, arama. Ayrıntı alt
 * sayfada açılır; karar öncesi sonuç cümlesiyle onay istenir.
 */

import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { AdminList, confirmAction, InfoLine, Panel, RecordCard, SelectField, useAdminMutation, type FilterOption } from "@/components/admin";
import { BottomSheet, Chip, ChipGroup } from "@/components/ui";
import { timeAgo } from "@/lib/admin/format";
import {
  ACCOUNT_REQUEST_TYPES,
  accountRequestOutcome,
  accountRequestSummary,
  CHANGE_REQUEST_TYPES,
  changeRequestOutcome,
  changeRequestSummary,
  listAccountRequests,
  listChangeRequests,
  PAYLOAD_LABELS,
  personName,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_TABS,
  reviewAccountRequest,
  reviewChangeRequest,
  type AccountRequestItem,
  type ChangeRequestItem,
  type RequestPlayer,
  type RequestTeam,
} from "@/lib/api/admin/users";
import { colors, radius, space, textScale, type } from "@/theme";

import { DecisionBlock, DiffList, LinkExisting, Outcome, PersonPanel, PlayerPanel, REVIEW_TONE, TeamPanel, Warnings } from "./RequestParts";

const TAB_LABELS: Record<string, string> = { ...REVIEW_STATUS_LABELS, pending: "Bekleyen", approved: "Onaylanan", rejected: "Reddedilen", all: "Tümü" };

function useBoardFilters() {
  const [status, setStatus] = useState<string>("pending");
  const [kind, setKind] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [q, setQ] = useState("");
  return { status, setStatus, kind, setKind, city, setCity, q, setQ };
}

function BoardHeader({
  types,
  kind,
  setKind,
  cities,
  city,
  setCity,
}: {
  types: Record<string, string>;
  kind: string;
  setKind: (v: string) => void;
  cities: string[];
  city: string | null;
  setCity: (v: string | null) => void;
}) {
  const shown = Object.entries(types).filter(([key]) => key !== "profile_claim" && key !== "team_authority");
  return (
    <View style={styles.header}>
      <ChipGroup scrollable contentPadding={0}>
        <Chip label="Tüm türler" selected={!kind} onPress={() => setKind("")} size="sm" tone="info" />
        {shown.map(([key, label]) => (
          <Chip key={key} label={label} selected={kind === key} onPress={() => setKind(key)} size="sm" tone="info" />
        ))}
      </ChipGroup>
      {cities.length > 1 ? (
        <SelectField<string>
          value={city}
          options={cities.map((c) => ({ value: c, label: c }))}
          placeholder="Tüm iller"
          clearable
          icon="location-outline"
          onChange={setCity}
        />
      ) : null}
    </View>
  );
}

/* ═══════════════════════ HESAP TALEPLERİ ═══════════════════════ */

export function AccountRequestsBoard({ canDecide }: { canDecide: boolean }) {
  const f = useBoardFilters();
  const [selected, setSelected] = useState<AccountRequestItem | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [selected?.id]);

  const query = useQuery({
    queryKey: ["admin", "members", "account-requests", f.status, f.kind, f.city, f.q],
    queryFn: () => listAccountRequests({ status: f.status, type: f.kind || undefined, city: f.city || undefined, q: f.q || undefined }),
  });

  const review = useAdminMutation(
    (v: { item: AccountRequestItem; decision: "approved" | "rejected"; link?: { kind: "player" | "team"; record: RequestPlayer | RequestTeam } }) =>
      reviewAccountRequest(v.item.id, {
        decision: v.decision,
        note: note.trim() || undefined,
        ...(v.link?.kind === "player" ? { linkPlayerId: v.link.record.id } : {}),
        ...(v.link?.kind === "team" ? { linkTeamId: v.link.record.id } : {}),
      }),
    {
      success: (_r, v) => (v.decision === "approved" ? "Talep onaylandı." : "Talep reddedildi."),
      invalidate: [["admin", "members"], ["admin", "requests"]],
      onSuccess: () => setSelected(null),
    }
  );

  const decide = async (item: AccountRequestItem, decision: "approved" | "rejected", link?: { kind: "player" | "team"; record: RequestPlayer | RequestTeam }) => {
    const linkName = link ? (link.kind === "team" ? (link.record as RequestTeam).team_name : (link.record as RequestPlayer).player_name) : "";
    const message = [
      accountRequestSummary(item),
      decision === "rejected"
        ? note.trim()
          ? `Notun: “${note.trim()}”`
          : "Not yazmadın; üye gerekçeyi göremeyecek."
        : link
          ? link.kind === "team"
            ? `Yeni takım açılmaz; “${linkName}” (#${link.record.id}) takımının yönetimi üyeye tanımlanır.`
            : `Yeni profil açılmaz; üye “${linkName}” (#${link.record.id}) kaydına bağlanır.`
          : accountRequestOutcome(item.type) ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const ok = await confirmAction({
      title: decision === "rejected" ? "Talebi reddet" : link ? (link.kind === "team" ? "Mevcut takımı sahiplendir" : "Mevcut kayda bağlayarak onayla") : "Talebi onayla",
      message,
      confirmLabel: decision === "rejected" ? "Reddet" : "Onayla",
      destructive: decision === "rejected",
    });
    if (ok) review.mutate({ item, decision, link });
  };

  const data = query.data;
  const filters: FilterOption[] = REVIEW_STATUS_TABS.map((key) => ({ key, label: TAB_LABELS[key], count: data?.counts?.[key] }));
  const item = selected;
  const payloadRows = Object.entries(item?.payload ?? {}).filter(([key, value]) => PAYLOAD_LABELS[key] && value);
  const image = (item?.payload?.player_img || item?.payload?.logo) as string | undefined;

  return (
    <>
      <AdminList<AccountRequestItem>
        data={data?.items}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={query.refetch}
        search={f.q}
        onSearch={f.setQ}
        searchPlaceholder="Üye, takım, oyuncu ya da talep no"
        filters={filters}
        filter={f.status}
        onFilter={f.setStatus}
        extraHeader={<BoardHeader types={ACCOUNT_REQUEST_TYPES} kind={f.kind} setKind={f.setKind} cities={data?.cities ?? []} city={f.city} setCity={f.setCity} />}
        keyExtractor={(r) => String(r.id)}
        emptyIcon="id-card-outline"
        emptyTitle="Bu filtrede talep yok"
        renderItem={({ item: r }) => (
          <RecordCard
            title={ACCOUNT_REQUEST_TYPES[r.type] ?? r.type}
            subtitle={accountRequestSummary(r)}
            meta={[r.requester?.city, timeAgo(r.createdAt || r.created_at), `#${r.id}`].filter(Boolean).join(" · ")}
            icon="id-card-outline"
            iconTone={r.status === "pending" ? "brand" : "neutral"}
            badges={[
              { label: REVIEW_STATUS_LABELS[r.status] ?? r.status, tone: REVIEW_TONE[r.status] },
              r.status === "pending" && r.warnings?.length ? { label: `${r.warnings.length} uyarı`, tone: "warn", icon: "warning-outline" } : null,
            ]}
            onPress={() => setSelected(r)}
          />
        )}
      />

      <BottomSheet visible={item != null} onClose={review.isPending ? () => undefined : () => setSelected(null)} title={item ? `${ACCOUNT_REQUEST_TYPES[item.type] ?? item.type} · #${item.id}` : "Talep"} snap="full">
        {item ? (
          <View style={styles.sheet}>
            <Text style={styles.lead} {...textScale.long}>
              {accountRequestSummary(item)}
            </Text>
            {item.status === "pending" ? <Warnings items={item.warnings} /> : null}
            {item.status === "pending" ? <Outcome text={accountRequestOutcome(item.type)} /> : null}
            {item.note ? (
              <Panel title="Üyenin notu">
                <Text style={styles.quote} {...textScale.long}>
                  “{item.note}”
                </Text>
              </Panel>
            ) : null}
            <PersonPanel user={item.requester} />
            <TeamPanel team={item.target_team} title={item.type === "team_create" ? "Açılan takım" : "Talep edilen takım"} />
            <PlayerPanel player={item.target_player} title={item.type === "player_create" ? "Bağlanan oyuncu kaydı" : "Talep edilen oyuncu profili"} />
            {item.transfer_target ? (
              <Panel title="Devralacak üye">
                <InfoLine label="Ad" value={personName(item.transfer_target)} />
                <InfoLine label="Kullanıcı adı" value={`@${item.transfer_target.username ?? "—"}`} />
                <InfoLine label="İl" value={item.transfer_target.city || "—"} />
                <InfoLine label="Yönettiği takım" value={item.transfer_target.managed_team_id ? `#${item.transfer_target.managed_team_id}` : "Yok"} />
              </Panel>
            ) : null}
            {item.type === "player_create" || item.type === "team_create" ? (
              <Panel title="Gönderilen bilgiler">
                {image ? <Image source={{ uri: image }} style={styles.preview} resizeMode="cover" /> : null}
                {payloadRows.length ? payloadRows.map(([key, value]) => <InfoLine key={key} label={PAYLOAD_LABELS[key]} value={String(value)} />) : <InfoLine label="Bilgi" value="Yok" />}
                {item.payload?.duplicate_check?.confirmed_new ? (
                  <Text style={styles.note} {...textScale.dense}>
                    Üye, benzer isimli kayıtları gördü ve bunların kendisi olmadığını belirtti.
                  </Text>
                ) : null}
              </Panel>
            ) : null}
            {canDecide && item.status === "pending" && (item.type === "player_create" || item.type === "team_create") ? (
              <LinkExisting
                kind={item.type === "team_create" ? "team" : "player"}
                suggestions={item.type === "team_create" ? item.similar_teams ?? [] : item.possible_matches ?? []}
                initialQuery={String(item.payload?.team_name ?? item.payload?.player_name ?? "")}
                busy={review.isPending}
                onLink={(record) => void decide(item, "approved", { kind: item.type === "team_create" ? "team" : "player", record })}
              />
            ) : null}
            <DecisionBlock
              item={item}
              note={note}
              setNote={setNote}
              busy={review.isPending}
              canDecide={canDecide}
              onDecide={(decision) => void decide(item, decision)}
              approveLabel={item.type === "player_create" ? "Yeni profil olarak onayla" : item.type === "team_create" ? "Yeni takım olarak onayla" : "Onayla"}
            />
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
}

/* ═══════════════════════ İÇERİK GÜNCELLEME TALEPLERİ ═══════════════════════ */

export function ChangeRequestsBoard({ canDecide }: { canDecide: boolean }) {
  const f = useBoardFilters();
  const [selected, setSelected] = useState<ChangeRequestItem | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [selected?.id]);

  const query = useQuery({
    queryKey: ["admin", "members", "change-requests", f.status, f.kind, f.city, f.q],
    queryFn: () => listChangeRequests({ status: f.status, type: f.kind || undefined, city: f.city || undefined, q: f.q || undefined }),
  });

  const review = useAdminMutation(
    (v: { item: ChangeRequestItem; decision: "approved" | "rejected" }) => reviewChangeRequest(v.item.id, { decision: v.decision, note: note.trim() || undefined }),
    {
      success: (_r, v) => (v.decision === "approved" ? "Değişiklik onaylandı ve yayınlandı." : "Değişiklik reddedildi."),
      invalidate: [["admin", "members"], ["admin", "requests"]],
      onSuccess: () => setSelected(null),
    }
  );

  const decide = async (item: ChangeRequestItem, decision: "approved" | "rejected") => {
    const ok = await confirmAction({
      title: decision === "rejected" ? "Değişikliği reddet" : "Değişikliği onayla ve yayınla",
      message: [
        changeRequestSummary(item),
        decision === "rejected"
          ? `Profilde hiçbir şey değişmez; üyeye ret bildirimi gider.${note.trim() ? `\nNotun: “${note.trim()}”` : "\nNot yazmadın; üye gerekçeyi göremeyecek."}`
          : changeRequestOutcome(item),
      ].join("\n\n"),
      confirmLabel: decision === "rejected" ? "Reddet" : "Onayla ve yayınla",
      destructive: decision === "rejected",
    });
    if (ok) review.mutate({ item, decision });
  };

  const data = query.data;
  const filters: FilterOption[] = REVIEW_STATUS_TABS.map((key) => ({ key, label: TAB_LABELS[key], count: data?.counts?.[key] }));
  const item = selected;

  return (
    <>
      <AdminList<ChangeRequestItem>
        data={data?.items}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={query.refetch}
        search={f.q}
        onSearch={f.setQ}
        searchPlaceholder="Üye, takım, oyuncu ya da talep no"
        filters={filters}
        filter={f.status}
        onFilter={f.setStatus}
        extraHeader={<BoardHeader types={CHANGE_REQUEST_TYPES} kind={f.kind} setKind={f.setKind} cities={data?.cities ?? []} city={f.city} setCity={f.setCity} />}
        keyExtractor={(r) => String(r.id)}
        emptyIcon="create-outline"
        emptyTitle="Bu filtrede değişiklik talebi yok"
        renderItem={({ item: r }) => {
          const n = (r.diff ?? []).filter((d) => d.changed).length;
          return (
            <RecordCard
              title={CHANGE_REQUEST_TYPES[r.type] ?? r.type}
              subtitle={changeRequestSummary(r)}
              meta={[r.requester?.city, r.type !== "player_release" ? `${n} alan` : null, timeAgo(r.createdAt || r.created_at)].filter(Boolean).join(" · ")}
              icon={r.type === "team_logo" ? "image-outline" : r.type === "player_release" ? "person-remove-outline" : "create-outline"}
              iconTone={r.status === "pending" ? "brand" : "neutral"}
              badges={[
                { label: REVIEW_STATUS_LABELS[r.status] ?? r.status, tone: REVIEW_TONE[r.status] },
                r.status === "pending" && r.warnings?.length ? { label: `${r.warnings.length} uyarı`, tone: "warn", icon: "warning-outline" } : null,
              ]}
              onPress={() => setSelected(r)}
            />
          );
        }}
      />

      <BottomSheet visible={item != null} onClose={review.isPending ? () => undefined : () => setSelected(null)} title={item ? `${CHANGE_REQUEST_TYPES[item.type] ?? item.type} · #${item.id}` : "Talep"} snap="full">
        {item ? (
          <View style={styles.sheet}>
            <Text style={styles.lead} {...textScale.long}>
              {changeRequestSummary(item)}
            </Text>
            {item.status === "pending" ? <Warnings items={item.warnings} /> : null}
            {item.status === "pending" ? <Outcome text={changeRequestOutcome(item)} /> : null}
            {item.diff?.length ? <DiffList diff={item.diff} /> : null}
            <PersonPanel user={item.requester} />
            <PlayerPanel player={item.target_player} title={item.type === "player_release" ? "Kadrodan çıkarılacak oyuncu" : "Güncellenen oyuncu profili"} />
            <TeamPanel team={item.team} title={item.type === "player_release" ? "Kadrosundan çıkarılacağı takım" : "İlgili takım"} />
            <DecisionBlock item={item} note={note} setNote={setNote} busy={review.isPending} canDecide={canDecide} onDecide={(d) => void decide(item, d)} approveLabel="Onayla ve yayınla" />
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
  sheet: { gap: space.md },
  lead: { ...type.h4, color: colors.textPrimary },
  quote: { ...type.bodySm, color: colors.textSecondary },
  note: { ...type.caption, color: colors.textSecondary },
  preview: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surface2 },
});
