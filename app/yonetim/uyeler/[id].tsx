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

import { AdminScreen, confirmAction, FormSheet, InfoLine, Panel, RecordCard, useAdminMutation, type FieldDef } from "@/components/admin";
import { openExternal } from "@/components/admin/members/contact";
import { memberBadges } from "@/components/admin/members/MemberCard";
import { MembershipPlanCard, ResetCodeCard } from "@/components/admin/members/MemberSections";
import { REVIEW_TONE } from "@/components/admin/members/RequestParts";
import { Avatar, Badge, Button, ErrorState, SkeletonCard } from "@/components/ui";
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
  whatsappUrl,
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
  const wa = whatsappUrl(user?.phone);

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
          <SkeletonCard lines={3} />
          <SkeletonCard lines={5} />
        </>
      ) : query.error || !user ? (
        <ErrorState error={query.error ?? new Error("Kullanıcı bulunamadı.")} onRetry={query.refetch} variant="inline" />
      ) : (
        <>
          <View style={styles.hero}>
            <Avatar name={name} image={user.player?.player_img ?? user.managedTeam?.logo ?? null} size={56} />
            <View style={styles.heroText}>
              <Text style={styles.heroTitle} {...textScale.dense}>
                {name}
              </Text>
              <Text style={styles.heroSub} {...textScale.dense}>
                {[user.city, user.createdAt ? `Üyelik ${formatDate(user.createdAt)}` : null].filter(Boolean).join(" · ") || "—"}
              </Text>
              <View style={styles.badges}>
                {memberBadges(user).map((b) => (
                  <Badge key={b.label} label={b.label} tone={b.tone} icon={b.icon} size="xs" />
                ))}
              </View>
            </View>
          </View>

          {user.phone || user.email ? (
            <View style={styles.row}>
              {user.phone ? <Button label="Ara" icon="call-outline" variant="secondary" size="sm" onPress={() => void openExternal(`tel:${user.phone}`)} style={styles.grow} /> : null}
              {wa ? <Button label="WhatsApp" icon="logo-whatsapp" variant="secondary" size="sm" onPress={() => void openExternal(wa)} style={styles.grow} /> : null}
              {user.email ? <Button label="E-posta" icon="mail-outline" variant="secondary" size="sm" onPress={() => void openExternal(`mailto:${user.email}`)} style={styles.grow} /> : null}
            </View>
          ) : null}

          {can("users.review") || can("users.update") ? (
            <Panel title="Üyelik kararı">
              <View style={styles.row}>
                {can("users.review") && st !== "rejected" ? (
                  <Button label="Reddet" icon="close" variant="danger" size="sm" onPress={() => void askReview("rejected")} disabled={review.isPending} />
                ) : null}
                {can("users.review") && !APPROVED.has(st) ? (
                  <Button label="Onayla" icon="checkmark" size="sm" onPress={() => void askReview("approved")} loading={review.isPending} style={styles.grow} />
                ) : null}
                {can("users.update") ? (
                  st === "suspended" ? (
                    <Button label="Etkinleştir" icon="play-circle-outline" variant="secondary" size="sm" onPress={() => void askStatus("active")} loading={status.isPending} style={styles.grow} />
                  ) : (
                    <Button label="Askıya al" icon="ban-outline" variant="secondary" size="sm" onPress={() => void askStatus("suspended")} loading={status.isPending} style={styles.grow} />
                  )
                ) : null}
              </View>
            </Panel>
          ) : null}

          <Panel title="Hesap bilgileri" action={can("users.update") ? { label: "Düzenle", onPress: () => setEditing(true) } : undefined}>
            <InfoLine label="Ad soyad" value={user.fullName || "—"} />
            <InfoLine label="Kullanıcı adı" value={`@${user.username}`} />
            <InfoLine label="E-posta" value={user.email || "—"} />
            <InfoLine label="Telefon" value={user.phone || "—"} />
            <InfoLine label="İl" value={user.city || "—"} />
            <InfoLine label="Takım adı" value={user.teamName || "—"} />
            <InfoLine label="Rol" value={MEMBER_ROLE_LABELS[user.role] ?? user.role} />
            <InfoLine label="Durum" value={ACCOUNT_STATUS_LABELS[st] ?? (user.status || "—")} />
            <InfoLine label="Üye profili" value={user.profileTypeLabel || PROFILE_TYPE_LABELS[user.profileType ?? ""] || "—"} />
          </Panel>

          <Panel title="Profil bağlantıları">
            <RecordCard
              title={user.player?.player_name ?? (user.player_id ? `Oyuncu #${user.player_id}` : "Bağlı değil")}
              subtitle="Oyuncu profili"
              avatar={user.player ? { name: user.player.player_name, image: user.player.player_img } : undefined}
              icon={user.player ? undefined : "person-outline"}
              onPress={user.player_id ? () => router.push(`/oyuncu/${user.player_id}` as Href) : undefined}
            />
            <RecordCard
              title={user.managedTeam?.team_name ?? (user.managed_team_id ? `Takım #${user.managed_team_id}` : "Bağlı değil")}
              subtitle="Yönetilen takım"
              avatar={user.managedTeam ? { name: user.managedTeam.team_name, image: user.managedTeam.logo } : undefined}
              icon={user.managedTeam ? undefined : "shield-outline"}
              onPress={user.managed_team_id ? () => router.push(`/takim/${user.managed_team_id}` as Href) : undefined}
            />
          </Panel>

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

          <Panel title="Premium siparişleri" action={can("users.membership") ? { label: "Onay ekranı", onPress: () => router.push("/yonetim/premium" as Href) } : undefined}>
            {detail?.premiumOrders?.length ? (
              detail.premiumOrders.map((order) => (
                <InfoLine
                  key={order.id}
                  label={formatDate(order.createdAt || order.created_at)}
                  value={
                    <View style={styles.lineValue}>
                      <Text style={styles.lineText} {...textScale.dense}>
                        {PLAN_LABELS[order.plan] ?? order.plan}
                        {order.months ? ` · ${order.months} ay` : ""}
                      </Text>
                      <Badge label={ORDER_STATUS_LABELS[order.status] ?? order.status} tone={REVIEW_TONE[order.status] ?? "neutral"} size="xs" />
                    </View>
                  }
                />
              ))
            ) : (
              <Text style={styles.empty} {...textScale.dense}>
                Premium siparişi yok.
              </Text>
            )}
          </Panel>

          <Panel title="Hesap talepleri" action={can("users.requests") ? { label: "Talepler", onPress: () => router.push("/yonetim/uyeler?bolum=requests" as Href) } : undefined}>
            {detail?.accountRequests?.length ? (
              detail.accountRequests.map((r) => (
                <InfoLine
                  key={r.id}
                  label={formatDate(r.createdAt || r.created_at)}
                  value={
                    <View style={styles.lineValue}>
                      <Text style={styles.lineText} {...textScale.dense}>
                        {ACCOUNT_REQUEST_TYPES[r.type] ?? r.type}
                      </Text>
                      <Badge label={REVIEW_STATUS_LABELS[r.status] ?? r.status} tone={REVIEW_TONE[r.status] ?? "neutral"} size="xs" />
                    </View>
                  }
                />
              ))
            ) : (
              <Text style={styles.empty} {...textScale.dense}>
                Hesap talebi yok.
              </Text>
            )}
          </Panel>

          {can("users.password_reset") ? (
            <Panel title="Şifre sıfırlama">
              <Text style={styles.note} {...textScale.long}>
                Üye şifresini unuttuysa tek kullanımlık bir kod üret ve kendisine ilet. Kod bir saat geçerlidir ve yalnız bir kez kullanılabilir.
              </Text>
              {code ? <ResetCodeCard code={code.code} expiresAt={code.expiresAt} username={user.username} phone={user.phone} /> : null}
              <Button label={code ? "Yeni kod üret" : "Sıfırlama kodu üret"} icon="key-outline" variant="secondary" onPress={() => void askReset()} loading={reset.isPending} fullWidth />
            </Panel>
          ) : null}

          {can("users.delete") ? (
            <Panel title="Üyeyi sil">
              <Text style={styles.note} {...textScale.long}>
                Üyeyi ve bağlı premium, sipariş ve talep kayıtlarını kalıcı olarak siler. Bu işlem geri alınamaz.
              </Text>
              <Button label="Üyeyi kalıcı olarak sil" icon="trash-outline" variant="danger" onPress={() => void askDelete()} loading={remove.isPending} fullWidth />
            </Panel>
          ) : null}

          <Text style={styles.empty} {...textScale.dense}>
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
  hero: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroText: { flex: 1, gap: 2 },
  heroTitle: { ...type.h2, color: colors.textPrimary },
  heroSub: { ...type.bodySm, color: colors.textSecondary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xs },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  grow: { flex: 1 },
  note: { ...type.bodySm, color: colors.textSecondary },
  empty: { ...type.caption, color: colors.textTertiary },
  lineValue: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  lineText: { ...type.bodySm, color: colors.textPrimary },
});
