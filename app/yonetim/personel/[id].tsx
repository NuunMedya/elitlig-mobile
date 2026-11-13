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

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";

import { AdminScreen, FormSheet, confirmAction, useAdminMutation } from "@/components/admin";
import { CredentialsCard, StaffAccountSheet } from "@/components/admin/staff/StaffAccountsBulkSheet";
import { payloadFrom, staffFields } from "@/components/admin/staff/staffForm";
import { dutyIcon } from "@/components/admin/staff/StaffParts";
import { MeterRow, ScorePlate, StageStat, SysGroup, SysRow, SysStage, toneFg, trNum } from "@/components/admin/system/SysKit";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  GradientBar,
  IconTile,
  Reveal,
  SectionHeader,
  SegmentedControl,
  SkeletonCard,
  Touchable,
  type IconTileTone,
} from "@/components/ui";
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
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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
          {/* Kimlik sahnesi: avatar, ad, görevler, dört sayaç. */}
          <SysStage>
            <View style={styles.hero}>
              <Avatar name={person.fullName} size={64} ring="brand" />
              <View style={styles.heroText}>
                <Text style={styles.heroEyebrow} {...textScale.badge}>
                  {passive ? "PASİF PERSONEL" : "AKTİF PERSONEL"}
                </Text>
                <Text style={styles.heroName} numberOfLines={2} {...textScale.dense}>
                  {person.fullName}
                </Text>
                <View style={styles.heroDuties}>
                  {(person.duties ?? []).map((d, i) => (
                    <View key={d} style={styles.heroDuty}>
                      <Ionicons name={dutyIcon(d)} size={11} color={colors.onDark} />
                      <Text style={styles.heroDutyText} {...textScale.badge}>
                        {person.dutyLabels?.[i] ?? d}
                      </Text>
                    </View>
                  ))}
                  {person.city ? (
                    <View style={styles.heroDuty}>
                      <Ionicons name="location" size={11} color={colors.onDark} />
                      <Text style={styles.heroDutyText} {...textScale.badge}>
                        {person.city}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
            <View style={styles.stageStats}>
              <StageStat label="Görev" value={person.matchCount || 0} icon="football" />
              <StageStat label="Yaklaşan" value={person.upcomingCount || 0} icon="calendar" tone="info" />
              <StageStat label="Ortalama" value={trNum(person.average)} icon="star" tone="warn" />
              <StageStat label="Puan" value={person.ratingCount || 0} icon="people" />
            </View>
          </SysStage>

          {/* Hızlı iletişim: üç eşit karo. */}
          {person.phone || person.email ? (
            <View style={styles.quick}>
              {person.phone ? (
                <QuickAction icon="call" tone="mint" label="Ara" onPress={() => void Linking.openURL(`tel:${person.phone}`)} />
              ) : null}
              {person.phone ? (
                <QuickAction
                  icon="logo-whatsapp"
                  tone="mint"
                  label="WhatsApp"
                  onPress={() => void Linking.openURL(`https://wa.me/${String(person.phone).replace(/\D/g, "").replace(/^0/, "90")}`)}
                />
              ) : null}
              {person.email ? (
                <QuickAction icon="mail" tone="cyan" label="E-posta" onPress={() => void Linking.openURL(`mailto:${person.email}`)} />
              ) : null}
            </View>
          ) : null}

          {person.nextMatch ? (
            <View style={styles.next}>
              <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.nextRail} />
              <IconTile icon="time" tone="cyan" size={34} glow={false} />
              <View style={styles.flex}>
                <Text style={styles.nextLabel} {...textScale.badge}>
                  SIRADAKİ GÖREV · {formatMatchWhen(person.nextMatch)}
                </Text>
                <Text style={styles.nextTitle} numberOfLines={1} {...textScale.dense}>
                  {person.nextMatch.label}
                </Text>
              </View>
            </View>
          ) : null}

          <SysGroup title="İletişim" icon="call" tone="cyan" flush>
            <SysRow first icon="call-outline" tone="win" title={person.phone || "Telefon yok"} meta="Telefon" muted={!person.phone} />
            <SysRow icon="mail-outline" tone="info" title={person.email || "E-posta yok"} meta="E-posta" muted={!person.email} />
            <SysRow icon="location-outline" tone="brand" title={person.city || "Tüm iller"} meta="İl" />
            <SysRow icon="calendar-outline" tone="neutral" title={person.createdAt ? formatDate(person.createdAt) : "—"} meta="Kayıt tarihi" />
            {person.notes ? <SysRow icon="document-text-outline" tone="warn" title={person.notes} meta="Not" /> : null}
          </SysGroup>

          <SysGroup title="Yönetim hesabı" icon="key" tone="violet">
            {fresh ? <CredentialsCard rows={[fresh]} roles={roles.data ?? []} /> : null}
            {person.linkedUser ? (
              <View style={styles.account}>
                <Avatar name={person.linkedUser.name} size={40} />
                <View style={styles.flex}>
                  <Text style={styles.accountName} numberOfLines={1} {...textScale.dense}>
                    {person.linkedUser.username ? `@${person.linkedUser.username}` : person.linkedUser.name}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                    {person.linkedUser.source === "name" ? "Ad soyad eşleşmesiyle bağlandı" : "Hesaba bağlı"}
                  </Text>
                </View>
                <View style={styles.accountBadges}>
                  <Badge label={ROLE_LABELS[person.linkedUser.role] || person.linkedUser.role} tone="brand" size="xs" />
                  {person.linkedUser.status === "suspended" ? <Badge label="Askıda" tone="danger" size="xs" /> : <Badge label="Aktif" tone="win" size="xs" />}
                </View>
              </View>
            ) : !fresh ? (
              <View style={styles.account}>
                <IconTile icon="key-outline" tone="neutral" size={40} glow={false} />
                <View style={styles.flex}>
                  <Text style={styles.accountName} {...textScale.dense}>
                    Panel hesabı yok
                  </Text>
                  <Text style={styles.muted} {...textScale.long}>
                    Hesap açılınca görevleri Yapılacaklar'a düşer.
                  </Text>
                </View>
                {canOpenAccount && roles.data?.length ? (
                  <Button label="Hesap aç" icon="add" size="sm" onPress={() => setAccountOpen(true)} />
                ) : null}
              </View>
            ) : null}
          </SysGroup>

          <SysGroup title="Performans" icon="stats-chart" tone="gold">
            {report.isLoading ? (
              <SkeletonCard />
            ) : report.error ? (
              <ErrorState error={report.error} onRetry={report.refetch} variant="inline" />
            ) : report.data ? (
              <>
                <View style={styles.perfHead}>
                  <ScorePlate value={trNum(report.data.summary.average)} tone={scoreTone(report.data.summary.average)} caption="ortalama" size="lg" />
                  <View style={styles.flex}>
                    <Text style={styles.perfBig} {...textScale.dense}>
                      {report.data.summary.ratedMatchCount} / {report.data.summary.matchCount} maç puanlandı
                    </Text>
                    <GradientBar
                      value={report.data.summary.matchCount ? report.data.summary.ratedMatchCount / report.data.summary.matchCount : 0}
                      height={6}
                    />
                    <Text style={styles.muted} {...textScale.dense}>
                      Takımlar ve oyuncular maç merkezinden puanlar.
                    </Text>
                  </View>
                </View>
                {report.data.summary.byDuty?.map((d) => (
                  <MeterRow
                    key={d.duty}
                    leading={<Ionicons name={dutyIcon(d.duty)} size={13} color={colors.textSecondary} />}
                    label={d.dutyLabel}
                    hint={`${d.matchCount} maç · ${d.ratingCount} puan`}
                    value={trNum(d.average)}
                    ratio={(d.average ?? 0) / 10}
                  />
                ))}
              </>
            ) : null}
          </SysGroup>

          <SectionHeader title="Görev geçmişi" meta={report.data ? `${report.data.matches.length} maç` : undefined} />
          {report.data?.matches.length ? (
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
          {report.data && !report.data.matches.length ? (
            <EmptyState icon="calendar-outline" title="Henüz görev yok" body="Bu personel henüz hiçbir maça görevlendirilmedi." variant="inline" compact />
          ) : report.data && !matches.length ? (
            <EmptyState icon="filter-outline" title="Bu süzgece uyan maç yok" variant="inline" compact />
          ) : null}
          <View style={styles.timeline}>
            {matches.map((m, i) => (
              <Reveal key={`${m.matchId}-${m.duty}`} index={i}>
                <View style={styles.tlItem}>
                  <View style={styles.tlAxis}>
                    <View style={[styles.tlDot, { backgroundColor: m.rated ? colors.brand : colors.textTertiary }]} />
                    {i < matches.length - 1 ? <View style={styles.tlLine} /> : null}
                  </View>
                  <View style={styles.tlCard}>
                    <View style={styles.tlHead}>
                      <View style={styles.flex}>
                        <Text style={styles.tlDate} {...textScale.badge}>
                          {[m.date ? formatDate(m.date) : null, m.league].filter(Boolean).join(" · ").toLocaleUpperCase("tr-TR")}
                        </Text>
                        <Text style={styles.tlTitle} numberOfLines={2} {...textScale.dense}>
                          {m.matchLabel}
                        </Text>
                        <View style={styles.tlBadges}>
                          <Badge label={m.dutyLabel} tone="brand" icon={dutyIcon(m.duty)} size="xs" />
                          {m.rated ? <Badge label={`${m.raterCount} değerlendirme`} tone="info" size="xs" /> : <Badge label="Puan verilmedi" size="xs" />}
                        </View>
                      </View>
                      {m.rated && m.average != null ? <ScorePlate value={trNum(m.average)} tone={scoreTone(m.average)} size="sm" /> : null}
                    </View>
                    {m.ratings.length ? (
                      <View style={styles.ratings}>
                        {m.ratings.map((r, j) => (
                          <View key={`${r.type}-${r.playerId || r.teamId || j}`} style={styles.rating}>
                            <Ionicons name={r.type === "player" ? "person" : "shield"} size={11} color={colors.textTertiary} />
                            <View style={styles.flex}>
                              <Text style={styles.ratingWho} numberOfLines={1} {...textScale.dense}>
                                {raterLabel(r)}
                              </Text>
                              {r.comment ? (
                                <Text style={styles.ratingComment} {...textScale.long}>
                                  “{r.comment}”
                                </Text>
                              ) : null}
                            </View>
                            <Text style={[styles.ratingScore, { color: toneFg(scoreTone(r.score)) }]} {...textScale.badge}>
                              {r.score}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              </Reveal>
            ))}
          </View>

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

/** Hızlı iletişim karosu: degrade IconTile + etiket. */
function QuickAction({ icon, tone, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; tone: IconTileTone; label: string; onPress: () => void }) {
  return (
    <Touchable feedback="card" onPress={onPress} style={styles.quickItem} accessibilityRole="button" accessibilityLabel={label}>
      <IconTile icon={icon} tone={tone} size={36} />
      <Text style={styles.quickLabel} {...textScale.dense}>
        {label}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  hero: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroText: { flex: 1, gap: space.xs },
  heroEyebrow: { ...type.overline, color: colors.adminAccent },
  heroName: { ...type.h1, color: colors.onDark },
  heroDuties: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  heroDuty: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.inkPill, borderWidth: hairline, borderColor: colors.inkPillBorder },
  heroDutyText: { ...type.labelXs, color: colors.onDark },
  stageStats: { flexDirection: "row", gap: space.sm },
  quick: { flexDirection: "row", gap: space.sm },
  quickItem: { flex: 1, alignItems: "center", gap: space.xs, paddingVertical: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  quickLabel: { ...type.labelSm, color: colors.textPrimary },
  next: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, paddingLeft: space.lg, borderRadius: radius.xl, backgroundColor: colors.accentDim, overflow: "hidden" },
  nextRail: { position: "absolute", left: 0, top: space.md, bottom: space.md, width: 3, borderRadius: 2 },
  nextLabel: { ...type.micro, color: colors.accentText },
  nextTitle: { ...type.h4, color: colors.textPrimary },
  account: { flexDirection: "row", alignItems: "center", gap: space.md },
  accountName: { ...type.h4, color: colors.textPrimary },
  accountBadges: { alignItems: "flex-end", gap: space.xs },
  muted: { ...type.caption, color: colors.textTertiary },
  perfHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  perfBig: { ...type.label, color: colors.textPrimary },
  timeline: { gap: 0 },
  tlItem: { flexDirection: "row", gap: space.md },
  tlAxis: { width: 14, alignItems: "center", paddingTop: space.lg },
  tlDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.bg },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.separator, marginTop: 2 },
  tlCard: { flex: 1, gap: space.sm, padding: space.md, marginBottom: space.sm, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  tlHead: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  tlDate: { ...type.micro, color: colors.textTertiary },
  tlTitle: { ...type.h4, color: colors.textPrimary },
  tlBadges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xxs },
  ratings: { gap: space.xs, paddingTop: space.sm, borderTopWidth: hairline, borderTopColor: colors.separator },
  rating: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  ratingWho: { ...type.bodySm, color: colors.textPrimary },
  ratingComment: { ...type.caption, color: colors.textSecondary },
  ratingScore: { ...type.scoreXs },
});
