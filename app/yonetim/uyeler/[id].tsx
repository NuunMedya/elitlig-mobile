/**
 * ÜYE AYRINTISI — tek site üyesinin kartı ve işlemleri
 * (web AdminUsers.js ayrıntı çekmecesi).
 *
 * NE: kimlik + durum rozetleri, iletişim (ara / WhatsApp / e-posta), hesap
 * bilgileri ve "Düzenle" (ad, e-posta, telefon, il, takım adı, rol, durum,
 * üye profili, oyuncu ve takım bağlantısı), üyelik kararı (onayla / reddet),
 * askıya al / etkinleştir, profil bağlantıları, premium planları (oyuncu /
 * takım: free yap, premium'u onaya gönder), premium siparişleri, hesap
 * talepleri, tek kullanımlık şifre sıfırlama kodu ve üyeyi silme.
 *
 * Her işlem kendi yetkisine bağlıdır (users.update / users.review /
 * users.membership / users.password_reset / users.delete); yetki yoksa düğme
 * çizilmez, sunucu da 403 ile korur.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, confirmAction, FormSheet, useAdminMutation, type FieldDef } from "@/components/admin";
import { ContactActions, memberBadges, STATUS_TONE } from "@/components/admin/members/MemberCard";
import { MembershipPlanCard, ResetCodeCard } from "@/components/admin/members/MemberSections";
import { REVIEW_TONE } from "@/components/admin/members/RequestParts";
import { DangerNote, FactRow, GroupCard, IdentityStage, ListLine, StagePill } from "@/components/admin/team/ManageKit";
import { Avatar, Badge, Button, ErrorState, IconTile, Reveal, SkeletonCard, SkeletonHero, TeamLogo } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import {
  ACCOUNT_REQUEST_TYPES,
  ACCOUNT_STATUS_LABELS,
  deleteMember,
  EDITABLE_STATUSES,
  getMember,
  issuePasswordCode,
  MEMBER_ROLE_LABELS,
  ORDER_STATUS_LABELS,
  PLAN_LABELS,
  PROFILE_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  reviewMember,
  setMembership,
  updateMember,
  type MemberUpdate,
} from "@/lib/api/admin/users";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const EDIT_FIELDS: FieldDef[] = [
  { key: "fullName", label: "Ad soyad", kind: "text" },
  { key: "email", label: "E-posta", kind: "email" },
  { key: "phone", label: "Telefon", kind: "phone" },
  { key: "city", label: "İl", kind: "text" },
  { key: "teamName", label: "Takım adı", kind: "text" },
  { key: "role", label: "Rol", kind: "select", options: Object.entries(MEMBER_ROLE_LABELS).map(([value, label]) => ({ value, label })), clearable: false },
  { key: "status", label: "Durum", kind: "select", options: EDITABLE_STATUSES.map((value) => ({ value, label: ACCOUNT_STATUS_LABELS[value] })), clearable: false },
  { key: "profile_type", label: "Üye profili", kind: "select", options: Object.entries(PROFILE_TYPE_LABELS).map(([value, label]) => ({ value, label })), clearable: false },
  { key: "player_id", label: "Oyuncu ID", kind: "number", hint: "Boş bırakılırsa oyuncu bağlantısı kaldırılır." },
  { key: "managed_team_id", label: "Yönetilen takım ID", kind: "number", hint: "Boş bırakılırsa takım bağlantısı kaldırılır." },
];

const APPROVED = new Set(["active", "approved"]);

export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const memberId = Number(id);
  const auth = useAuth();
  const router = useRouter();
  const can = (p: string) => hasAnyPermission(auth.user, [p]);

  const query = useQuery({ queryKey: ["admin", "members", "detail", memberId], queryFn: () => getMember(memberId), enabled: Number.isFinite(memberId) });
  const detail = query.data;
  const user = detail?.user;

  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [planBusy, setPlanBusy] = useState<string | null>(null);

  const inv = [["admin", "members"]];
  const save = useAdminMutation((body: MemberUpdate) => updateMember(memberId, body), { success: "Üye bilgileri güncellendi.", invalidate: inv, silentError: true });
  const review = useAdminMutation((decision: "approved" | "rejected") => reviewMember(memberId, decision), {
    success: (r, d) => r?.message || (d === "approved" ? "Üyelik onaylandı." : "Üyelik reddedildi."),
    invalidate: inv,
  });
  const status = useAdminMutation((next: string) => updateMember(memberId, { status: next }), {
    success: (_r, next) => (next === "suspended" ? "Hesap askıya alındı." : "Hesap etkinleştirildi."),
    invalidate: inv,
  });
  const plan = useAdminMutation(
    (v: { plan: "player" | "team"; body: Parameters<typeof setMembership>[2] }) => setMembership(memberId, v.plan, v.body),
    {
      success: (r, v) => r?.message || (v.body.membership === "free" ? "Premium üyelik kaldırıldı." : "Premium talebi onay kuyruğuna eklendi."),
      invalidate: [...inv, ["admin", "premium"]],
      onSuccess: () => setPlanBusy(null),
    }
  );
  const reset = useAdminMutation(() => issuePasswordCode(memberId), {
    success: (r) => r?.message || "Sıfırlama kodu üretildi.",
    invalidate: [["admin", "passwordResets"]],
    onSuccess: (r) => setCode({ code: r.code, expiresAt: r.expiresAt }),
  });
  const remove = useAdminMutation(() => deleteMember(memberId), {
    success: "Üye silindi.",
    invalidate: inv,
    onSuccess: () => router.back(),
  });

  const name = user ? user.fullName || user.username || `Üye #${user.id}` : "Üye";

  const askReview = async (decision: "approved" | "rejected") => {
    const ok = await confirmAction({
      title: decision === "approved" ? "Üyelik onaylansın mı?" : "Üyelik reddedilsin mi?",
      message: decision === "approved" ? `${name} onaylandığında panele giriş yapabilecek.` : `${name} panele giriş yapamayacak.`,
      confirmLabel: decision === "approved" ? "Onayla" : "Reddet",
      destructive: decision === "rejected",
    });
    if (ok) review.mutate(decision);
  };
  const askStatus = async (next: "suspended" | "active") => {
    const ok = await confirmAction({
      title: next === "suspended" ? "Hesap askıya alınsın mı?" : "Hesap etkinleştirilsin mi?",
      message: next === "suspended" ? "Üye askıdayken panele giriş yapamaz." : "Üye yeniden giriş yapabilir.",
      confirmLabel: next === "suspended" ? "Askıya al" : "Etkinleştir",
      destructive: next === "suspended",
    });
    if (ok) status.mutate(next);
  };
  const askFree = async (p: "player" | "team") => {
    const ok = await confirmAction({ title: `${PLAN_LABELS[p]} premium üyeliği kaldırılsın mı?`, confirmLabel: "Kaldır", destructive: true });
    if (!ok) return;
    setPlanBusy(p);
    plan.mutate({ plan: p, body: { membership: "free" } });
  };
  const askReset = async () => {
    const ok = await confirmAction({
      title: "Sıfırlama kodu üretilsin mi?",
      message: `${name} için tek kullanımlık kod üretilecek. Üyenin kimliğini doğruladığından emin ol. Daha önce üretilmiş kod geçersiz olur.`,
      confirmLabel: "Kod üret",
    });
    if (ok) reset.mutate(undefined);
  };
  const askDelete = async () => {
    const ok = await confirmAction({
      title: "Üye kalıcı olarak silinsin mi?",
      message: `${name} ve bağlı premium, sipariş ve talep kayıtları silinir. Bu işlem geri alınamaz.`,
      confirmLabel: "Kalıcı olarak sil",
      destructive: true,
    });
    if (ok) remove.mutate(undefined);
  };

  const submitEdit = (v: Record<string, unknown>) => {
    const body: MemberUpdate = {};
    for (const field of EDIT_FIELDS) {
      const raw = v[field.key];
      if (field.key === "player_id" || field.key === "managed_team_id") {
        const text = raw == null ? "" : String(raw).trim();
        body[field.key] = text === "" ? null : Number(text);
      } else if (field.key === "role" || field.key === "status" || field.key === "profile_type") {
        // Boş seçim gönderilmez; sunucu onu geçersiz sayar.
        if (raw) body[field.key] = String(raw);
      } else {
        (body as Record<string, unknown>)[field.key] = raw == null ? "" : String(raw);
      }
    }
    return save.mutateAsync(body);
  };

  const st = String(user?.status ?? "").toLowerCase();

  return (
    <AdminScreen
      title={name}
      subtitle={user ? `@${user.username} · Üye #${user.id}` : undefined}
      permission={["users.view"]}
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
      actions={can("users.update") && user ? [{ icon: "create-outline", onPress: () => setEditing(true), accessibilityLabel: "Üyeyi düzenle" }] : undefined}
    >
      {query.isLoading ? (
        <>
          <SkeletonHero />
          <SkeletonCard lines={5} />
        </>
      ) : query.error || !user ? (
        <ErrorState error={query.error ?? new Error("Kullanıcı bulunamadı.")} onRetry={query.refetch} variant="inline" />
      ) : (
        <>
          {/* KİMLİK SAHNESİ — rol, durum, üyelik tarihi + hızlı iletişim. */}
          <Reveal scaleFrom={0.97}>
            <IdentityStage
              leading={<Avatar name={name} image={user.player?.player_img ?? user.managedTeam?.logo ?? null} size={68} ring="brand" />}
              overline={[MEMBER_ROLE_LABELS[user.role] ?? user.role, user.city].filter(Boolean).join(" · ")}
              title={name}
              subtitle={`@${user.username}${user.createdAt ? ` · üye ${formatDate(user.createdAt)}` : ""}`}
              pills={
                <>
                  {memberBadges(user).map((b) => (
                    <StagePill
                      key={b.label}
                      label={b.label}
                      icon={b.icon}
                      tone={b.tone === "win" ? "win" : b.tone === "warn" ? "gold" : b.tone === "danger" ? "danger" : "plain"}
                    />
                  ))}
                </>
              }
              footer={<ContactActions phone={user.phone} email={user.email} />}
            />
          </Reveal>

          {can("users.review") || can("users.update") ? (
            <GroupCard title="Üyelik kararı" icon="checkmark-done" tone={st === "pending" ? "gold" : "neutral"}>
              {st === "pending" ? (
                <DangerNote tone="warn" icon="hourglass" title="Onay bekliyor" body="Onaylanınca üye panele giriş yapabilir; reddedilirse giriş kapanır." />
              ) : null}
              <View style={styles.row}>
                {can("users.review") && st !== "rejected" ? (
                  <Button label="Reddet" icon="close" variant="secondary" onPress={() => void askReview("rejected")} disabled={review.isPending} style={styles.grow} />
                ) : null}
                {can("users.review") && !APPROVED.has(st) ? (
                  <Button label="Onayla" icon="checkmark" onPress={() => void askReview("approved")} loading={review.isPending} style={styles.grow} />
                ) : null}
              </View>
              {can("users.update") ? (
                st === "suspended" ? (
                  <Button label="Hesabı etkinleştir" icon="play-circle-outline" variant="secondary" onPress={() => void askStatus("active")} loading={status.isPending} fullWidth />
                ) : (
                  <Button label="Hesabı askıya al" icon="ban-outline" variant="ghost" onPress={() => void askStatus("suspended")} loading={status.isPending} fullWidth />
                )
              ) : null}
            </GroupCard>
          ) : null}

          <GroupCard title="Hesap bilgileri" icon="person" tone="violet" action={can("users.update") ? { label: "Düzenle", onPress: () => setEditing(true) } : undefined}>
            <View>
              <FactRow icon="text-outline" label="Ad soyad" value={user.fullName || null} />
              <FactRow icon="at-outline" label="Kullanıcı adı" value={`@${user.username}`} />
              <FactRow icon="mail-outline" label="E-posta" value={user.email || null} />
              <FactRow icon="call-outline" label="Telefon" value={user.phone || null} />
              <FactRow icon="location-outline" label="İl" value={user.city || null} />
              <FactRow icon="shield-half-outline" label="Takım adı" value={user.teamName || null} />
              <FactRow icon="key-outline" label="Rol" value={MEMBER_ROLE_LABELS[user.role] ?? user.role} />
              <FactRow icon="pulse-outline" label="Durum" value={ACCOUNT_STATUS_LABELS[st] ?? (user.status || null)} tone={STATUS_TONE[st]} />
              <FactRow icon="id-card-outline" label="Üye profili" value={user.profileTypeLabel || PROFILE_TYPE_LABELS[user.profileType ?? ""] || null} last />
            </View>
          </GroupCard>

          <GroupCard title="Profil bağlantıları" icon="link" tone="cyan" padded={false}>
            <View style={styles.foot}>
              <ListLine
                leading={user.player ? <Avatar name={user.player.player_name} image={user.player.player_img} size={38} /> : <IconTile icon="person-outline" tone="neutral" size={38} glow={false} />}
                title={user.player?.player_name ?? (user.player_id ? `Oyuncu #${user.player_id}` : "Bağlı değil")}
                subtitle="Oyuncu profili"
                onPress={user.player_id ? () => router.push(`/oyuncu/${user.player_id}` as Href) : undefined}
              />
              <ListLine
                leading={user.managedTeam ? <TeamLogo name={user.managedTeam.team_name} logo={user.managedTeam.logo} size={38} /> : <IconTile icon="shield-outline" tone="neutral" size={38} glow={false} />}
                title={user.managedTeam?.team_name ?? (user.managed_team_id ? `Takım #${user.managed_team_id}` : "Bağlı değil")}
                subtitle="Yönetilen takım"
                onPress={user.managed_team_id ? () => router.push(`/takim/${user.managed_team_id}` as Href) : undefined}
                last
              />
            </View>
          </GroupCard>

          {(["player", "team"] as const).map((p) => (
            <MembershipPlanCard
              key={p}
              plan={p}
              current={detail?.membership?.[p]}
              canEdit={can("users.membership")}
              busy={plan.isPending && planBusy === p}
              onFree={() => void askFree(p)}
              onPremium={(startedAt, expiresAt) => {
                setPlanBusy(p);
                plan.mutate({ plan: p, body: { membership: "premium", startedAt, expiresAt } });
              }}
            />
          ))}

          <GroupCard
            title={`Premium siparişleri · ${detail?.premiumOrders?.length ?? 0}`}
            icon="diamond"
            tone="violet"
            padded={false}
            action={can("users.membership") ? { label: "Onay ekranı", onPress: () => router.push("/yonetim/premium" as Href) } : undefined}
          >
            <View style={styles.foot}>
              {detail?.premiumOrders?.length ? (
                detail.premiumOrders.map((order, i) => (
                  <ListLine
                    key={order.id}
                    leading={<IconTile icon="diamond" tone={order.status === "approved" ? "violet" : order.status === "pending" ? "gold" : "neutral"} size={34} glow={false} />}
                    title={`${PLAN_LABELS[order.plan] ?? order.plan}${order.months ? ` · ${order.months} ay` : ""}`}
                    subtitle={formatDate(order.createdAt || order.created_at)}
                    trailing={<Badge label={ORDER_STATUS_LABELS[order.status] ?? order.status} tone={REVIEW_TONE[order.status] ?? "neutral"} size="xs" />}
                    last={i === detail.premiumOrders.length - 1}
                  />
                ))
              ) : (
                <Text style={[styles.empty, styles.inset]} {...textScale.dense}>
                  Premium siparişi yok.
                </Text>
              )}
            </View>
          </GroupCard>

          <GroupCard
            title={`Hesap talepleri · ${detail?.accountRequests?.length ?? 0}`}
            icon="git-pull-request"
            tone="gold"
            padded={false}
            action={can("users.requests") ? { label: "Talepler", onPress: () => router.push("/yonetim/uyeler?bolum=requests" as Href) } : undefined}
          >
            <View style={styles.foot}>
              {detail?.accountRequests?.length ? (
                detail.accountRequests.map((r, i) => (
                  <ListLine
                    key={r.id}
                    leading={<IconTile icon="document-text-outline" tone={r.status === "pending" ? "gold" : "neutral"} size={34} glow={false} />}
                    title={ACCOUNT_REQUEST_TYPES[r.type] ?? r.type}
                    subtitle={formatDate(r.createdAt || r.created_at)}
                    trailing={<Badge label={REVIEW_STATUS_LABELS[r.status] ?? r.status} tone={REVIEW_TONE[r.status] ?? "neutral"} size="xs" />}
                    last={i === detail.accountRequests.length - 1}
                  />
                ))
              ) : (
                <Text style={[styles.empty, styles.inset]} {...textScale.dense}>
                  Hesap talebi yok.
                </Text>
              )}
            </View>
          </GroupCard>

          {can("users.password_reset") ? (
            <GroupCard title="Şifre sıfırlama" icon="key" tone="cyan">
              <Text style={styles.note} {...textScale.long}>
                Üye şifresini unuttuysa tek kullanımlık kod üret ve kendisine ilet. Kod bir saat geçerlidir, yalnız bir kez kullanılır.
              </Text>
              {code ? <ResetCodeCard code={code.code} expiresAt={code.expiresAt} username={user.username} phone={user.phone} /> : null}
              <Button label={code ? "Yeni kod üret" : "Sıfırlama kodu üret"} icon="key-outline" variant="secondary" onPress={() => void askReset()} loading={reset.isPending} fullWidth />
            </GroupCard>
          ) : null}

          {can("users.delete") ? (
            <GroupCard title="Tehlikeli bölge" icon="warning" tone="red">
              <DangerNote title="Kalıcı silme" body="Üye ve bağlı premium, sipariş ve talep kayıtları kalıcı olarak silinir. Bu işlem geri alınamaz." />
              <Button label="Üyeyi kalıcı olarak sil" icon="trash-outline" variant="danger" onPress={() => void askDelete()} loading={remove.isPending} fullWidth />
            </GroupCard>
          ) : null}

          <Text style={[styles.empty, styles.center]} {...textScale.dense}>
            Son güncelleme: {formatDateTime((user as { updatedAt?: string }).updatedAt)}
          </Text>
        </>
      )}

      {user ? (
        <FormSheet
          visible={editing}
          onClose={() => setEditing(false)}
          title="Hesap bilgileri"
          fields={EDIT_FIELDS}
          initial={{
            fullName: user.fullName ?? "",
            email: user.email ?? "",
            phone: user.phone ?? "",
            city: user.city ?? "",
            teamName: user.teamName ?? "",
            role: user.role,
            status: user.status ?? "",
            profile_type: user.profile_type ?? user.profileType ?? "",
            player_id: user.player_id ?? "",
            managed_team_id: user.managed_team_id ?? "",
          }}
          submitLabel="Değişiklikleri kaydet"
          onSubmit={submitEdit}
        />
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  grow: { flex: 1 },
  note: { ...type.bodySm, color: colors.textSecondary },
  empty: { ...type.caption, color: colors.textTertiary },
  inset: { paddingHorizontal: space.lg },
  foot: { paddingBottom: space.sm },
  center: { textAlign: "center" },
});
