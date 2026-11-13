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

import Ionicons from "@expo/vector-icons/Ionicons";

import { AdminList, AdminScreen, confirmAction, useAdminMutation } from "@/components/admin";
import { CountStrip, DangerNote, FactRow, GroupCard, PositionAvatar, RequestCard } from "@/components/admin/team/ManageKit";
import { Badge, BottomSheet, Button, Input, SegmentedControl, TeamLogo } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { formatDate, formatDateTime, timeAgo } from "@/lib/admin/format";
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
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["transfers.view", "transfers.review"];
const KEY = ["admin", "transfers"] as const;
/** Teklifin son tarihi 48 saatten yakınsa öncelikli. */
const expiresSoon = (v?: string | null) => {
  if (!v) return false;
  const ms = new Date(v).getTime() - Date.now();
  return ms > 0 && ms < 48 * 3_600_000;
};

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

  const openOffer = (item: AdminOffer) => {
    setSelected(item);
    setNote("");
    setNoteError(null);
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
        extraHeader={
          tab === "PENDING" && rows.length ? (
            <CountStrip
              items={[
                { key: "pending", label: "Bekleyen", value: rows.length, tone: "warn", icon: "hourglass" },
                { key: "soon", label: "Acil", hint: "48 saatte biter", value: rows.filter((o) => expiresSoon(o.expires_at)).length, tone: "danger", icon: "alarm" },
                { key: "loan", label: "Kiralık", value: rows.filter((o) => currentTerms(o).transfer_type === "loan").length, tone: "info", icon: "repeat" },
              ]}
            />
          ) : null
        }
        summary={tab === "PENDING" ? "Panel hesabı olmayan oyunculara gelen teklifler" : `${rows.length} teklif`}
        keyExtractor={(o) => o.public_id}
        emptyIcon="swap-horizontal-outline"
        emptyTitle="Bu listede teklif yok"
        emptyBody={tab === "PENDING" ? "Hesapsız oyunculara teklif gelince burada onay bekler." : undefined}
        renderItem={({ item }) => {
          const t = currentTerms(item);
          const pending = tab === "PENDING";
          const soon = pending && expiresSoon(item.expires_at);
          return (
            <RequestCard
              leading={<PositionAvatar name={item.player?.player_name} image={item.player?.player_img} position={item.player?.player_position} size={38} />}
              who={item.player?.player_name ?? `Oyuncu #${item.player_id}`}
              when={[timeAgo(item.sent_at || item.createdAt), item.player?.city].filter(Boolean).join(" · ")}
              priority={pending ? (soon ? { label: "Süre doluyor", tone: "danger", icon: "alarm" } : { label: "Onay gerekli", tone: "warn", icon: "hourglass" }) : null}
              status={pending ? null : { label: tab === "APPROVED" ? "Onaylandı" : "Reddedildi", tone: tab === "APPROVED" ? "win" : "danger" }}
              title={t.transfer_type === "loan" ? "Kiralık teklif" : "Transfer teklifi"}
              done={!pending}
              onPress={() => openOffer(item)}
              extraActions={pending ? <Button label="İncele ve karar ver" icon="search" variant="secondary" onPress={() => openOffer(item)} style={styles.grow} /> : null}
            >
              <View style={styles.path}>
                <View style={styles.pathTeam}>
                  <TeamLogo name={item.team?.team_name} logo={item.team?.logo} size={28} />
                  <Text style={styles.pathName} numberOfLines={1} {...textScale.dense}>
                    {item.team?.team_name ?? "Takım"}
                  </Text>
                </View>
                <View style={styles.fee}>
                  <Text style={styles.feeValue} numberOfLines={1} {...textScale.badge}>
                    {money(t.transfer_fee, t.currency || "TRY")}
                  </Text>
                  <Text style={styles.feeLabel} {...textScale.badge}>
                    BONSERVİS
                  </Text>
                </View>
              </View>
              <View style={styles.pills}>
                <Badge label={OFFER_STATUS_LABELS[item.status] ?? item.status} size="xs" />
                {t.contract_end_date ? <Badge label={`Bitiş ${formatDate(t.contract_end_date)}`} size="xs" icon="calendar-outline" /> : <Badge label="Süresiz" size="xs" />}
                {item.expires_at && pending ? <Badge label={`Son: ${formatDate(item.expires_at)}`} tone={soon ? "danger" : "neutral"} size="xs" icon="alarm-outline" /> : null}
              </View>
            </RequestCard>
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
              <Button label="Reddet" variant="secondary" icon="close" size="lg" onPress={() => void decide("reject")} loading={reject.isPending} />
              <Button label="Onayla ve tamamla" icon="checkmark" size="lg" onPress={() => void decide("approve")} loading={approve.isPending} style={styles.grow} haptic="success" />
            </View>
          ) : undefined
        }
      >
        {selected && terms ? (
          <View style={styles.stack}>
            {/* TRANSFER YOLU — oyuncu → teklifi veren takım. */}
            <View style={styles.route}>
              <View style={styles.routeSide}>
                <PositionAvatar name={selected.player?.player_name} image={selected.player?.player_img} position={selected.player?.player_position} size={52} />
                <Text style={styles.routeName} numberOfLines={2} {...textScale.dense}>
                  {selected.player?.player_name ?? "Oyuncu"}
                </Text>
                <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                  {[positionLabel(selected.player?.player_position) || "Mevki yok", selected.player?.city].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <View style={styles.routeMid}>
                <Text style={styles.routeFee} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
                  {money(terms.transfer_fee, terms.currency || "TRY")}
                </Text>
                <Ionicons name="arrow-forward-circle" size={28} color={colors.brandAccent} />
                <Text style={styles.feeLabel} {...textScale.badge}>
                  {terms.transfer_type === "loan" ? "KİRALIK" : "TRANSFER"}
                </Text>
              </View>
              <View style={styles.routeSide}>
                <TeamLogo name={selected.team?.team_name} logo={selected.team?.logo} size={56} />
                <Text style={styles.routeName} numberOfLines={2} {...textScale.dense}>
                  {selected.team?.team_name ?? "Takım"}
                </Text>
                <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                  {selected.team?.city ?? "Şehir yok"}
                </Text>
              </View>
            </View>

            <GroupCard title={`Teklif koşulları · sürüm ${selected.current_version || 1}`} icon="document-text" tone="violet">
              <View>
                <FactRow icon="pulse-outline" label="Durum" value={OFFER_STATUS_LABELS[selected.status] ?? selected.status} />
                <FactRow icon="play-outline" label="Başlangıç" value={terms.contract_start_date ? formatDate(terms.contract_start_date) : null} />
                <FactRow icon="stop-outline" label="Bitiş" value={terms.contract_end_date ? formatDate(terms.contract_end_date) : "Süresiz"} />
                <FactRow icon="alarm-outline" label="Teklif son tarihi" value={selected.expires_at ? formatDateTime(selected.expires_at) : null} />
                {terms.release_clause_active ? <FactRow icon="lock-open-outline" label="Serbest kalma" value={money(terms.release_clause_fee, terms.currency || "TRY")} /> : null}
                {terms.per_match_fee_active ? <FactRow icon="cash-outline" label="Maç başı ücret" value={money(terms.per_match_fee, terms.currency || "TRY")} /> : null}
              </View>
              <View style={styles.pills}>
                <Badge label="Misafir oyunculuk" tone={terms.guest_play_allowed ? "win" : "neutral"} icon={terms.guest_play_allowed ? "checkmark" : "close"} size="sm" />
                <Badge label="Seyahat masrafı" tone={terms.travel_expenses_covered ? "win" : "neutral"} icon={terms.travel_expenses_covered ? "checkmark" : "close"} size="sm" />
                <Badge label="Katılım ücreti" tone={terms.match_participation_fee_covered ? "win" : "neutral"} icon={terms.match_participation_fee_covered ? "checkmark" : "close"} size="sm" />
              </View>
              {terms.message ? (
                <View style={styles.quoteBox}>
                  <Text style={styles.quote} {...textScale.long}>
                    “{terms.message}”
                  </Text>
                </View>
              ) : null}
            </GroupCard>
            {decided ? (
              <DangerNote
                tone={selected.admin_status === "APPROVED" ? "info" : "danger"}
                icon={selected.admin_status === "APPROVED" ? "checkmark-circle" : "close-circle"}
                title={`${selected.admin_status === "APPROVED" ? "Onaylandı" : "Reddedildi"} · ${formatDateTime(selected.admin_reviewed_at)}`}
                body={selected.admin_note || "Not yazılmadı."}
              />
            ) : canReview ? (
              <>
                <DangerNote tone="info" icon="information-circle" title="Onaylanırsa" body={`Sözleşme oluşur ve oyuncu ${selected.team?.team_name ?? "takım"} kadrosuna geçer.`} />
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
              </>
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
  grow: { flex: 1 },
  footer: { flexDirection: "row", gap: space.sm },
  muted: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
  path: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    marginTop: space.xxs,
  },
  pathTeam: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, minWidth: 0 },
  pathName: { ...type.label, color: colors.textPrimary, flexShrink: 1 },
  fee: { alignItems: "flex-end" },
  feeValue: { ...type.scoreXs, color: colors.accentText },
  feeLabel: { ...type.nano, color: colors.textTertiary },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  route: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  routeSide: { flex: 1, alignItems: "center", gap: space.xs, minWidth: 0 },
  routeName: { ...type.h4, color: colors.textPrimary, textAlign: "center" },
  routeMid: { alignItems: "center", gap: space.xxs, maxWidth: 110 },
  routeFee: { ...type.scoreXs, color: colors.accentText },
  quoteBox: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2, borderLeftWidth: 3, borderLeftColor: colors.brandAccent },
  quote: { ...type.bodySm, color: colors.textSecondary },
});
