/**
 * TRANSFER ONAYLARI — web pages/management/transfers/TransferApprovals.js.
 *
 * Profilini kendisi yönetmeyen (bağlı panel hesabı olmayan) oyunculara
 * gönderilen teklifler oyuncuya değil yönetime düşer. Sekmeler: onay bekleyen,
 * onaylanan, reddedilen (geçmiş). Dokununca teklif ayrıntısı alt sayfada:
 * koşullar, takım, karar notu; onayla (sözleşme oluşur, oyuncu takıma geçer)
 * ya da reddet (gerekçe zorunlu, takıma iletilir).
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, InfoLine, Panel, RecordCard, confirmAction, useAdminMutation } from "@/components/admin";
import { Avatar, BottomSheet, Button, Input, SegmentedControl, TeamLogo } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { foldText } from "@/lib/api/admin/lookups";
import { positionLabel } from "@/lib/api/admin/players";
import {
  ADMIN_STATUS_TABS,
  OFFER_STATUS_LABELS,
  approveOffer,
  currentTerms,
  listAdminOffers,
  money,
  rejectOffer,
  type AdminOffer,
  type AdminStatus,
} from "@/lib/api/admin/transfers";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["transfers.view", "transfers.review"];
const KEY = ["admin", "transfers"] as const;
const yesNo = (v?: boolean) => (v ? "Evet" : "Hayır");

export default function TransferApprovalsScreen() {
  const auth = useAuth();
  const canReview = hasPermission(auth.user, "transfers.review");
  const [tab, setTab] = useState<AdminStatus>("PENDING");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<AdminOffer | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const query = useQuery({ queryKey: [...KEY, tab], queryFn: () => listAdminOffers(tab) });
  const needle = foldText(q);
  const rows = (query.data?.items ?? []).filter(
    (o) => !needle || foldText(`${o.player?.player_name ?? ""} ${o.team?.team_name ?? ""}`).includes(needle)
  );

  const close = () => {
    setSelected(null);
    setNote("");
    setNoteError(null);
  };

  const approve = useAdminMutation((o: AdminOffer) => approveOffer(o, note), {
    success: "Transfer onaylandı ve sözleşme oluşturuldu.",
    invalidate: [KEY, ["admin", "players"], ["admin", "teams"]],
    onSuccess: close,
  });
  const reject = useAdminMutation((o: AdminOffer) => rejectOffer(o, note), {
    success: "Teklif reddedildi ve takıma bildirildi.",
    invalidate: [KEY],
    onSuccess: close,
  });

  const decide = async (kind: "approve" | "reject") => {
    if (!selected) return;
    if (kind === "reject" && !note.trim()) {
      setNoteError("Ret gerekçesini yaz; teklifi gönderen takıma iletilir.");
      return;
    }
    const ok = await confirmAction({
      title: kind === "approve" ? "Transfer onaylansın mı?" : "Teklif reddedilsin mi?",
      message:
        kind === "approve"
          ? `${selected.player?.player_name ?? "Oyuncu"} için sözleşme oluşacak ve oyuncu ${selected.team?.team_name ?? "teklifi veren takım"} kadrosuna geçecek.`
          : "Teklif reddedilecek ve takıma bildirilecek.",
      confirmLabel: kind === "approve" ? "Onayla ve tamamla" : "Reddet",
      destructive: kind === "reject",
    });
    if (!ok) return;
    if (kind === "approve") approve.mutate(selected);
    else reject.mutate(selected);
  };

  const terms = selected ? currentTerms(selected) : null;
  const decided = selected?.admin_status && selected.admin_status !== "PENDING";

  return (
    <AdminScreen
      title="Transfer onayları"
      subtitle={query.data ? `${query.data.total} teklif` : undefined}
      permission={PERMS}
      scroll={false}
      bottom={
        <SegmentedControl<AdminStatus>
          items={ADMIN_STATUS_TABS.map((t) => ({ key: t.key, label: t.label }))}
          value={tab}
          onChange={setTab}
          stretch
          size="sm"
        />
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
        searchPlaceholder="Oyuncu ya da takım ara"
        summary={tab === "PENDING" ? "Panel hesabı bağlı olmayan oyunculara gönderilen teklifler" : null}
        keyExtractor={(o) => o.public_id}
        emptyIcon="swap-horizontal-outline"
        emptyTitle="Bu listede teklif yok"
        renderItem={({ item }) => {
          const t = currentTerms(item);
          return (
            <RecordCard
              title={item.player?.player_name ?? `Oyuncu #${item.player_id}`}
              subtitle={`${item.team?.team_name ?? "Takım"} · ${OFFER_STATUS_LABELS[item.status] ?? item.status}`}
              meta={`Gönderim: ${formatDateTime(item.sent_at || item.createdAt)}`}
              avatar={{ name: item.player?.player_name, image: item.player?.player_img }}
              value={money(t.transfer_fee, t.currency || "TRY")}
              badges={[
                tab === "PENDING" && { label: "Yönetim onayı gerekli", tone: "warn" },
                t.transfer_type === "loan" && { label: "Kiralık", tone: "info" },
              ]}
              onPress={() => {
                setSelected(item);
                setNote("");
                setNoteError(null);
              }}
            />
          );
        }}
      />

      <BottomSheet
        visible={selected != null}
        onClose={close}
        title="Teklif ayrıntısı"
        snap="full"
        footer={
          selected && !decided && canReview ? (
            <View style={styles.footer}>
              <Button label="Reddet" variant="danger" icon="close" onPress={() => void decide("reject")} loading={reject.isPending} />
              <Button label="Onayla ve tamamla" icon="checkmark" onPress={() => void decide("approve")} loading={approve.isPending} style={styles.grow} haptic="success" />
            </View>
          ) : undefined
        }
      >
        {selected && terms ? (
          <View style={styles.stack}>
            <View style={styles.party}>
              <Avatar name={selected.player?.player_name} image={selected.player?.player_img} size={48} />
              <View style={styles.grow}>
                <Text style={styles.title} {...textScale.dense}>
                  {selected.player?.player_name ?? "Oyuncu"}
                </Text>
                <Text style={styles.muted} {...textScale.dense}>
                  {[positionLabel(selected.player?.player_position) || "Mevki bilgisi yok", selected.player?.city].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </View>
            <Panel title="TEKLİFİ VEREN TAKIM">
              <View style={styles.party}>
                <TeamLogo name={selected.team?.team_name} logo={selected.team?.logo} size={36} />
                <View style={styles.grow}>
                  <Text style={styles.name} {...textScale.dense}>
                    {selected.team?.team_name ?? "Takım"}
                  </Text>
                  <Text style={styles.muted} {...textScale.dense}>
                    {selected.team?.city ?? "Şehir bilgisi yok"}
                  </Text>
                </View>
              </View>
            </Panel>
            <Panel title={`TEKLİF KOŞULLARI · SÜRÜM ${selected.current_version || 1}`}>
              <InfoLine label="Durum" value={OFFER_STATUS_LABELS[selected.status] ?? selected.status} />
              <InfoLine label="Tür" value={terms.transfer_type === "loan" ? "Kiralık" : "Transfer"} />
              <InfoLine label="Transfer bedeli" value={money(terms.transfer_fee, terms.currency || "TRY")} />
              <InfoLine label="Sözleşme başlangıcı" value={terms.contract_start_date ? formatDate(terms.contract_start_date) : "—"} />
              <InfoLine label="Sözleşme bitişi" value={terms.contract_end_date ? formatDate(terms.contract_end_date) : "Süresiz"} />
              <InfoLine label="Teklif son tarihi" value={selected.expires_at ? formatDateTime(selected.expires_at) : "—"} />
              <InfoLine label="Misafir oyunculuk" value={yesNo(terms.guest_play_allowed)} />
              <InfoLine label="Seyahat masrafları" value={yesNo(terms.travel_expenses_covered)} />
              <InfoLine label="Katılım ücreti" value={yesNo(terms.match_participation_fee_covered)} />
              {terms.release_clause_active ? <InfoLine label="Serbest kalma bedeli" value={money(terms.release_clause_fee, terms.currency || "TRY")} /> : null}
              {terms.per_match_fee_active ? <InfoLine label="Maç başı ücret" value={money(terms.per_match_fee, terms.currency || "TRY")} /> : null}
              {terms.message ? (
                <Text style={styles.quote} {...textScale.long}>
                  “{terms.message}”
                </Text>
              ) : null}
            </Panel>
            {decided ? (
              <Panel title={`YÖNETİM KARARI · ${formatDateTime(selected.admin_reviewed_at)}`}>
                <InfoLine label="Karar" value={selected.admin_status === "APPROVED" ? "Onaylandı" : "Reddedildi"} tone={selected.admin_status === "APPROVED" ? "win" : "danger"} />
                <Text style={styles.quote} {...textScale.long}>
                  {selected.admin_note || "Not yazılmadı."}
                </Text>
              </Panel>
            ) : canReview ? (
              <Input
                label="Karar notu"
                value={note}
                onChangeText={(t) => {
                  setNote(t);
                  setNoteError(null);
                }}
                multiline
                placeholder="Teklifi gönderen takıma iletilir. Retteki gerekçe zorunlu."
                error={noteError ?? undefined}
              />
            ) : (
              <Text style={styles.muted} {...textScale.long}>
                Karar vermek için transfer inceleme yetkisi gerekir.
              </Text>
            )}
          </View>
        ) : null}
      </BottomSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  party: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1 },
  footer: { flexDirection: "row", gap: space.sm },
  title: { ...type.h3, color: colors.textPrimary },
  name: { ...type.h4, color: colors.textPrimary },
  muted: { ...type.bodySm, color: colors.textTertiary },
  quote: { ...type.bodySm, color: colors.textSecondary, fontStyle: "italic" },
});
