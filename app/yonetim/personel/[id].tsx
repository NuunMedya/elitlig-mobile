/**
 * PERSONEL AYRINTISI — iletişim, yönetim hesabı, görev geçmişi ve puanlar.
 *
 * Web: StaffManagement.js sağ paneli. Rapor ayrı uçtan gelir (liste hafif
 * kalsın diye). Telefon ve e-posta dokununca arama / posta açılır.
 * Düzenle formunda "Pasif" anahtarı kişiyi görevlendirme listelerinden çıkarır;
 * Sil kaydı çöp kutusuna taşır (geri alınabilir) ama yine de onay ister.
 */

import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AdminScreen,
  FormSheet,
  InfoLine,
  Panel,
  RecordCard,
  StatRow,
  confirmAction,
  useAdminMutation,
} from "@/components/admin";
import { CredentialsCard, StaffAccountSheet } from "@/components/admin/staff/StaffAccountsBulkSheet";
import { payloadFrom, staffFields } from "@/components/admin/staff/staffForm";
import { Avatar, Badge, Button, EmptyState, ErrorState, SegmentedControl, SkeletonCard } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDate } from "@/lib/admin/format";
import { ROLE_LABELS } from "@/lib/api/admin";
import {
  deleteStaff,
  FALLBACK_DUTIES,
  formatMatchWhen,
  getLinkableUsers,
  getManagementRoles,
  getStaffReport,
  isNationwideUser,
  listStaff,
  raterLabel,
  scoreTone,
  updateStaff,
} from "@/lib/api/admin/staff";
import { getCities } from "@/lib/api/meta";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, space, textScale, type } from "@/theme";

const PERMS = ["staff.view"] as const;
type MatchFilter = "all" | "rated" | "unrated";

export default function StaffDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const staffId = Number(id);
  const router = useRouter();
  const auth = useAuth();
  const user = auth.user;
  const canUpdate = hasAnyPermission(user, ["staff.update"]);
  const canDelete = hasAnyPermission(user, ["staff.delete"]);
  const canOpenAccount = canUpdate && hasAnyPermission(user, ["management_users.create"]);
  const nationwide = isNationwideUser(user);

  const [editing, setEditing] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [fresh, setFresh] = useState<{ fullName: string; username: string; password: string; role: string } | null>(null);
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");

  // Kişinin özet satırı listeden okunur (liste önbellekteyse ağ yok).
  const list = useQuery({ queryKey: ["admin", "staff", "list"], queryFn: () => listStaff() });
  const report = useQuery({ queryKey: ["admin", "staff", "report", staffId], queryFn: () => getStaffReport(staffId), enabled: Number.isFinite(staffId) });
  const linkable = useQuery({ queryKey: ["admin", "staff", "linkable"], queryFn: getLinkableUsers, enabled: canUpdate });
  const cities = useQuery({ queryKey: ["admin", "staff", "cities"], queryFn: getCities, enabled: nationwide, staleTime: 300_000 });
  const roles = useQuery({ queryKey: ["admin", "staff", "roles"], queryFn: getManagementRoles, enabled: canOpenAccount, staleTime: 300_000 });

  const person = list.data?.items.find((i) => i.id === staffId) ?? report.data?.staff ?? null;
  const duties = list.data?.duties?.length ? list.data.duties : FALLBACK_DUTIES;

  const fields = useMemo(
    () => staffFields({ duties, linkable: linkable.data ?? [], cities: nationwide ? cities.data ?? [] : null, editing: true }),
    [duties, linkable.data, cities.data, nationwide]
  );

  const save = useAdminMutation((v: Parameters<typeof payloadFrom>[0]) => updateStaff(staffId, payloadFrom(v, nationwide)), {
    success: (r) => r.message || "Personel güncellendi.",
    invalidate: [["admin", "staff"]],
  });
  const remove = useAdminMutation(() => deleteStaff(staffId), {
    success: (r) => r.message || "Personel çöp kutusuna taşındı.",
    invalidate: [["admin", "staff", "list"]],
    onSuccess: () => router.back(),
  });

  const matches = (report.data?.matches ?? []).filter((m) => (matchFilter === "rated" ? m.rated : matchFilter === "unrated" ? !m.rated : true));
  const passive = (person?.status || "active") !== "active";

  const refresh = () => {
    void list.refetch();
    void report.refetch();
  };

  return (
    <AdminScreen
      title={person?.fullName ?? "Personel"}
      subtitle={person ? `${person.dutyLabels?.join(", ") || "Görev seçilmedi"}${passive ? " · Pasif" : ""}` : undefined}
      permission={PERMS}
      onRefresh={refresh}
      refreshing={list.isRefetching || report.isRefetching}
      actions={canUpdate && person ? [{ icon: "create-outline", onPress: () => setEditing(true), accessibilityLabel: "Düzenle" }] : undefined}
    >
      {!person ? (
        list.isLoading || report.isLoading ? (
          <SkeletonCard />
        ) : list.error || report.error ? (
          <ErrorState error={list.error || report.error} onRetry={refresh} variant="inline" />
        ) : (
          <EmptyState icon="person-outline" title="Personel bulunamadı" variant="inline" />
        )
      ) : (
        <>
          <View style={styles.hero}>
            <Avatar name={person.fullName} size={56} />
            <View style={styles.heroText}>
              <Text style={styles.heroName} {...textScale.dense}>
                {person.fullName}
              </Text>
              <View style={styles.badges}>
                {passive ? <Badge label="Pasif" size="xs" /> : <Badge label="Aktif" tone="win" size="xs" />}
                {(person.dutyLabels ?? []).map((d) => (
                  <Badge key={d} label={d} tone="brand" size="xs" />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            {person.phone ? (
              <Button label="Ara" icon="call-outline" size="sm" variant="secondary" onPress={() => void Linking.openURL(`tel:${person.phone}`)} />
            ) : null}
            {person.phone ? (
              <Button
                label="WhatsApp"
                icon="logo-whatsapp"
                size="sm"
                variant="secondary"
                onPress={() => void Linking.openURL(`https://wa.me/${String(person.phone).replace(/\D/g, "").replace(/^0/, "90")}`)}
              />
            ) : null}
            {person.email ? (
              <Button label="E-posta" icon="mail-outline" size="sm" variant="secondary" onPress={() => void Linking.openURL(`mailto:${person.email}`)} />
            ) : null}
          </View>

          <StatRow
            items={[
              { label: "Toplam görev", value: person.matchCount || 0 },
              { label: "Yaklaşan", value: person.upcomingCount || 0, tone: "accent" },
              { label: "Ortalama puan", value: person.average == null ? "—" : String(person.average).replace(".", ","), tone: scoreTone(person.average) },
              { label: "Verilen puan", value: person.ratingCount || 0 },
            ]}
          />

          <Panel title="İletişim">
            <InfoLine label="Telefon" value={person.phone || ""} />
            <InfoLine label="E-posta" value={person.email || ""} />
            <InfoLine label="İl" value={person.city || "Tüm iller"} />
            <InfoLine label="Kayıt" value={person.createdAt ? formatDate(person.createdAt) : ""} />
            {person.nextMatch ? <InfoLine label="Sıradaki görev" value={`${formatMatchWhen(person.nextMatch)} · ${person.nextMatch.label}`} tone="accent" /> : null}
            {person.notes ? <InfoLine label="Not" value={person.notes} /> : null}
          </Panel>

          <Panel title="Yönetim hesabı">
            {fresh ? <CredentialsCard rows={[fresh]} roles={roles.data ?? []} /> : null}
            {person.linkedUser ? (
              <>
                <InfoLine label="Hesap" value={person.linkedUser.username ? `@${person.linkedUser.username}` : person.linkedUser.name} />
                <InfoLine label="Rol" value={ROLE_LABELS[person.linkedUser.role] || person.linkedUser.role} />
                {person.linkedUser.source === "name" ? <InfoLine label="Bağ" value="Ad soyad eşleşmesiyle bağlandı" /> : null}
                {person.linkedUser.status === "suspended" ? <InfoLine label="Durum" value="Hesap askıya alınmış" tone="danger" /> : null}
              </>
            ) : !fresh ? (
              <>
                <Text style={styles.muted} {...textScale.long}>
                  Bu personelin panel hesabı yok.
                </Text>
                {canOpenAccount && roles.data?.length ? (
                  <Button label="Hesap aç" icon="key-outline" size="sm" onPress={() => setAccountOpen(true)} />
                ) : null}
              </>
            ) : null}
          </Panel>

          <Panel title="Görevler ve puanlar">
            {report.isLoading ? (
              <SkeletonCard />
            ) : report.error ? (
              <ErrorState error={report.error} onRetry={report.refetch} variant="inline" />
            ) : report.data ? (
              <>
                <Text style={styles.summary} {...textScale.long}>
                  {report.data.summary.matchCount} maçta görev aldı, {report.data.summary.ratedMatchCount} maçta puan aldı.
                  {report.data.summary.average != null ? ` Genel ortalaması ${String(report.data.summary.average).replace(".", ",")}.` : ""}
                </Text>
                {report.data.summary.byDuty?.map((d) => (
                  <InfoLine
                    key={d.duty}
                    label={d.dutyLabel}
                    value={`${d.matchCount} maç · ${d.average == null ? "puan yok" : `ort. ${String(d.average).replace(".", ",")}`}`}
                    tone={scoreTone(d.average)}
                  />
                ))}
                {report.data.matches.length ? (
                  <SegmentedControl<MatchFilter>
                    items={[
                      { key: "all", label: "Tümü" },
                      { key: "rated", label: "Puanlanan" },
                      { key: "unrated", label: "Puansız" },
                    ]}
                    value={matchFilter}
                    onChange={setMatchFilter}
                    size="sm"
                  />
                ) : null}
              </>
            ) : null}
          </Panel>

          {report.data && !report.data.matches.length ? (
            <EmptyState icon="calendar-outline" title="Henüz görev yok" body="Bu personel henüz hiçbir maça görevlendirilmedi." variant="inline" compact />
          ) : report.data && !matches.length ? (
            <EmptyState icon="filter-outline" title="Bu süzgece uyan maç yok" variant="inline" compact />
          ) : null}
          {matches.map((m) => (
            <RecordCard
              key={`${m.matchId}-${m.duty}`}
              title={m.matchLabel}
              subtitle={[m.dutyLabel, m.date ? formatDate(m.date) : null, m.league].filter(Boolean).join(" · ")}
              icon="football-outline"
              value={m.rated && m.average != null ? String(m.average).replace(".", ",") : null}
              valueTone={scoreTone(m.average)}
              badges={[m.rated ? { label: `${m.raterCount} kişi puanladı`, tone: "info" } : { label: "Puan verilmedi", tone: "neutral" }]}
            >
              {m.ratings.length ? (
                <View style={styles.ratings}>
                  {m.ratings.map((r, i) => (
                    <Text key={`${r.type}-${r.playerId || r.teamId || i}`} style={styles.rating} {...textScale.long}>
                      {raterLabel(r)}: {r.score}
                      {r.comment ? ` · “${r.comment}”` : ""}
                    </Text>
                  ))}
                </View>
              ) : null}
            </RecordCard>
          ))}

          {canDelete ? (
            <Button
              label="Personeli sil"
              icon="trash-outline"
              variant="danger"
              loading={remove.isPending}
              onPress={async () => {
                const ok = await confirmAction({
                  title: "Personel silinsin mi?",
                  message: `“${person.fullName}” personel listesinden kaldırılacak; kayıt çöp kutusuna taşınır.`,
                  confirmLabel: "Sil",
                  destructive: true,
                });
                if (ok) remove.mutate(undefined);
              }}
            />
          ) : null}

          <FormSheet
            visible={editing}
            onClose={() => setEditing(false)}
            title="Personeli düzenle"
            fields={fields}
            initial={{
              fullName: person.fullName,
              duties: person.duties?.length ? [...person.duties] : [person.duty].filter(Boolean),
              phone: person.phone || "",
              email: person.email || "",
              notes: person.notes || "",
              userId: person.userId ?? null,
              cityId: person.cityId ?? null,
              passive,
            }}
            onSubmit={(v) => save.mutateAsync(v)}
          />
          {roles.data?.length ? (
            <StaffAccountSheet
              visible={accountOpen}
              onClose={() => setAccountOpen(false)}
              person={person}
              roles={roles.data}
              cities={cities.data ?? []}
              nationwide={nationwide}
              onCreated={(cred) => {
                setFresh(cred);
                void list.refetch();
              }}
            />
          ) : null}
        </>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroText: { flex: 1, gap: space.xs },
  heroName: { ...type.h2, color: colors.textPrimary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  muted: { ...type.bodySm, color: colors.textTertiary },
  summary: { ...type.bodySm, color: colors.textSecondary },
  ratings: { gap: 2, marginTop: space.xs, paddingTop: space.xs, borderTopWidth: hairline, borderTopColor: colors.separator },
  rating: { ...type.caption, color: colors.textSecondary },
});
