/**
 * ŞİFRE SIFIRLAMA TALEPLERİ — "şifremi unuttum" diyen üyeler
 * (web /yonetim/admin/sifre-talepleri, PasswordResets.js).
 *
 * NE: durum çipleri sayılarıyla (Bekleyen / Kod üretildi / Tamamlanan /
 * Kapatılan / Tümü), arama (kullanıcı adı, ad, e-posta, telefon). Talebe
 * dokununca ayrıntı: iletişim (ara, WhatsApp), talep geçmişi; "Kod üret"
 * tek kullanımlık kodu üretir — kod YALNIZ o anda bir kez görünür, kopyalanır
 * ya da WhatsApp / SMS ile iletilir. "Talebi kapat" kodu geçersiz kılar.
 * Tamamlama üye tarafındadır: üye kodu giriş ekranında kullanıp yeni şifresini
 * belirleyince talep "Tamamlanan"a geçer.
 *
 * VERİ: GET /api/admin/users/password-resets?status=&q=,
 *       POST /api/admin/users/:userId/password-reset,
 *       POST /api/admin/users/password-resets/:id/cancel
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, confirmAction, useAdminMutation, type FilterOption } from "@/components/admin";
import { ContactActions } from "@/components/admin/members/MemberCard";
import { CountStrip, DangerNote, FactRow, GroupCard, RequestCard } from "@/components/admin/team/ManageKit";
import { ResetCodeCard } from "@/components/admin/members/MemberSections";
import { Avatar, Badge, BottomSheet, Button, Chip, ChipGroup, type Tone } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDateTime, timeAgo } from "@/lib/admin/format";
import {
  ACCOUNT_STATUS_LABELS,
  cancelPasswordReset,
  issuePasswordCode,
  listPasswordResets,
  personName,
  RESET_STATUS_LABELS,
  type PasswordReset,
} from "@/lib/api/admin/users";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const TABS: { key: string; label: string }[] = [
  { key: "requested", label: "Bekleyen" },
  { key: "issued", label: "Kod üretildi" },
  { key: "used", label: "Tamamlanan" },
  { key: "cancelled", label: "Kapatılan" },
  { key: "all", label: "Tümü" },
];

const TONE: Record<string, Tone> = { requested: "warn", issued: "info", used: "win", cancelled: "neutral" };

const statusText = (item: PasswordReset) => (item.expired ? "Kodun süresi doldu" : RESET_STATUS_LABELS[item.status] ?? item.status);

export default function PasswordResetsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState("requested");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Sekme değişip liste yeniden yüklenirken açık talep kaybolmasın.
  const [snapshot, setSnapshot] = useState<PasswordReset | null>(null);
  // Üretilen kod yalnız bu ekranda, üretildiği üye için tutulur.
  const [issued, setIssued] = useState<{ userId: number; code: string; expiresAt: string } | null>(null);

  const query = useQuery({ queryKey: ["admin", "passwordResets", tab, q], queryFn: () => listPasswordResets({ status: tab, q: q || undefined }) });
  const items = query.data?.resets ?? [];
  const counts = query.data?.counts ?? {};
  const selected = items.find((r) => r.id === selectedId) ?? (snapshot && snapshot.id === selectedId ? snapshot : null);

  const issue = useAdminMutation((item: PasswordReset) => issuePasswordCode(item.user.id), {
    success: (r) => r?.message || "Sıfırlama kodu üretildi.",
    invalidate: [["admin", "passwordResets"]],
    onSuccess: (r, item) => {
      setIssued({ userId: item.user.id, code: r.code, expiresAt: r.expiresAt });
      // Talep "Kod üretildi" sekmesine geçer; kod kartı görünür kalsın.
      if (tab === "requested") setTab("issued");
    },
  });
  const cancel = useAdminMutation((item: PasswordReset) => cancelPasswordReset(item.id), {
    success: (r) => r?.message || "Talep kapatıldı.",
    invalidate: [["admin", "passwordResets"]],
    onSuccess: (_r, item) => {
      if (issued?.userId === item.user.id) setIssued(null);
      setSelectedId(null);
    },
  });

  const askIssue = async (item: PasswordReset) => {
    const ok = await confirmAction({
      title: "Sıfırlama kodu üretilsin mi?",
      message:
        item.status === "issued"
          ? "Bu üye için daha önce kod üretildi. Yeni kod üretilirse eski kod geçersiz olur."
          : `${personName(item.user)} için tek kullanımlık kod üretilecek. Üyenin kimliğini doğruladığından emin ol.`,
      confirmLabel: "Kod üret",
    });
    if (ok) issue.mutate(item);
  };
  const askCancel = async (item: PasswordReset) => {
    const ok = await confirmAction({
      title: "Talep kapatılsın mı?",
      message: `${personName(item.user)} adlı üyenin şifre sıfırlama talebi kapatılacak${item.status === "issued" ? " ve üretilen kod geçersiz olacak" : ""}.`,
      confirmLabel: "Kapat",
      destructive: true,
    });
    if (ok) cancel.mutate(item);
  };

  const filters: FilterOption[] = TABS.map((t) => ({ ...t, count: counts[t.key] ?? undefined }));
  const open = selected && (selected.status === "requested" || selected.status === "issued");
  const shownCode = issued && selected && issued.userId === selected.user.id ? issued : null;

  return (
    <AdminScreen title="Şifre sıfırlama talepleri" subtitle={counts.requested ? `${counts.requested} kod bekliyor` : "Şifremi unuttum talepleri"} permission={["users.password_reset"]} scroll={false}>
      <AdminList<PasswordReset>
        data={items}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={query.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Kullanıcı adı, ad, e-posta, telefon"
        extraHeader={
          <View style={styles.head}>
            <CountStrip
              items={[
                { key: "requested", label: "Bekleyen", value: counts.requested ?? 0, tone: "warn", icon: "hourglass", selected: tab === "requested", onPress: () => setTab("requested") },
                { key: "issued", label: "Kod iletildi", value: counts.issued ?? 0, tone: "info", icon: "key", selected: tab === "issued", onPress: () => setTab("issued") },
                { key: "used", label: "Yenilendi", value: counts.used ?? 0, tone: "win", icon: "checkmark-circle", selected: tab === "used", onPress: () => setTab("used") },
              ]}
            />
            <ChipGroup scrollable contentPadding={0}>
              {filters.map((f) => (
                <Chip key={f.key} label={f.label} count={f.count} size="sm" selected={tab === f.key} onPress={() => setTab(f.key)} />
              ))}
            </ChipGroup>
          </View>
        }
        keyExtractor={(r) => String(r.id)}
        emptyIcon="lock-open-outline"
        emptyTitle={q ? "Aramayla eşleşen talep yok" : tab === "requested" ? "Bekleyen şifre sıfırlama talebi yok" : "Bu listede talep yok"}
        renderItem={({ item }) => {
          const openItem = item.status === "requested" || item.status === "issued";
          const openSheet = () => {
            setSnapshot(item);
            setSelectedId(item.id);
          };
          /* Bekleyen talep 12 saati geçtiyse öncelikli. */
          const late = item.status === "requested" && Date.now() - new Date(item.created_at).getTime() > 12 * 3_600_000;
          return (
            <RequestCard
              leading={<Avatar name={personName(item.user)} size={38} />}
              who={personName(item.user)}
              when={[timeAgo(item.created_at), item.user.username ? `@${item.user.username}` : null, item.user.city].filter(Boolean).join(" · ")}
              priority={openItem ? (late ? { label: "Gecikti", tone: "danger", icon: "alert-circle" } : { label: statusText(item), tone: item.expired ? "danger" : TONE[item.status], icon: item.status === "issued" ? "key" : "hourglass" }) : null}
              status={openItem ? null : { label: statusText(item), tone: item.expired ? "danger" : TONE[item.status] }}
              title={item.status === "issued" ? "Kod iletildi, üyenin kullanması bekleniyor" : item.status === "requested" ? "Şifremi unuttum: kod istiyor" : statusText(item)}
              done={!openItem}
              onPress={openSheet}
              onApprove={item.status === "requested" ? () => void askIssue(item) : undefined}
              approveLabel="Kod üret"
              busy={issue.isPending}
              extraActions={item.status === "issued" ? <Button label="Ayrıntı ve iletim" icon="key-outline" variant="secondary" onPress={openSheet} style={styles.grow} /> : null}
            >
              <View style={styles.pills}>
                {item.user.phone ? <Badge label={item.user.phone} icon="call-outline" size="xs" /> : <Badge label="Telefon yok" tone="warn" size="xs" />}
                {item.channel === "sms" ? <Badge label="SMS otomatik" tone="info" icon="chatbubble-outline" size="xs" /> : null}
                {item.attempts ? <Badge label={`${item.attempts} hatalı deneme`} tone="warn" size="xs" /> : null}
              </View>
            </RequestCard>
          );
        }}
      />

      <BottomSheet
        visible={selected != null}
        onClose={() => setSelectedId(null)}
        title={selected ? personName(selected.user) : "Talep"}
        snap="full"
        footer={
          open ? (
            <View style={styles.footer}>
              <Button label="Talebi kapat" variant="secondary" size="lg" onPress={() => void askCancel(selected!)} loading={cancel.isPending} disabled={issue.isPending} />
              <Button
                label={selected!.status === "issued" ? "Yeni kod üret" : "Kod üret"}
                icon="key-outline"
                size="lg"
                onPress={() => void askIssue(selected!)}
                loading={issue.isPending}
                disabled={cancel.isPending}
                style={styles.grow}
              />
            </View>
          ) : null
        }
      >
        {selected ? (
          <View style={styles.sheet}>
            <View style={styles.from}>
              <Avatar name={personName(selected.user)} size={48} ring="brand" />
              <View style={styles.grow}>
                <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                  {personName(selected.user)}
                </Text>
                <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                  {selected.user.username ? `@${selected.user.username}` : "Kullanıcı adı yok"}
                  {selected.user.city ? ` · ${selected.user.city}` : ""}
                </Text>
              </View>
              <Badge label={statusText(selected)} tone={selected.expired ? "danger" : TONE[selected.status]} size="sm" />
            </View>

            {shownCode ? <ResetCodeCard code={shownCode.code} expiresAt={shownCode.expiresAt} username={selected.user.username} phone={selected.user.phone} /> : null}

            <ContactActions phone={selected.user.phone} email={selected.user.email} />

            <GroupCard title="İletişim bilgileri" icon="call" tone="cyan">
              <View>
                <FactRow icon="call-outline" label="Telefon" value={selected.user.phone || null} />
                <FactRow icon="mail-outline" label="E-posta" value={selected.user.email || null} />
                <FactRow icon="location-outline" label="İl" value={selected.user.city || null} />
                <FactRow
                  icon="pulse-outline"
                  label="Hesap durumu"
                  value={ACCOUNT_STATUS_LABELS[String(selected.user.status ?? "")] ?? (selected.user.status || null)}
                  last={!hasAnyPermission(auth.user, ["users.view"])}
                />
                {hasAnyPermission(auth.user, ["users.view"]) ? (
                  <FactRow
                    icon="person-outline"
                    label="Üye kartı"
                    value="Aç"
                    last
                    onPress={() => {
                      const id = selected.user.id;
                      setSelectedId(null);
                      router.push(`/yonetim/uyeler/${id}` as Href);
                    }}
                  />
                ) : null}
              </View>
            </GroupCard>

            <GroupCard title="Talep geçmişi" icon="time" tone="neutral">
              <View>
                <FactRow icon="calendar-outline" label="Talep tarihi" value={formatDateTime(selected.created_at)} />
                <FactRow icon="globe-outline" label="Talep IP" value={selected.requested_ip || null} />
                <FactRow icon="send-outline" label="Kod iletimi" value={selected.channel === "sms" ? "SMS (otomatik)" : "Yönetim"} last={!selected.attempts && !selected.issued_by && !selected.expires_at && !selected.used_at && selected.status !== "cancelled"} />
                {selected.attempts ? <FactRow icon="warning-outline" label="Hatalı deneme" value={String(selected.attempts)} tone="warn" /> : null}
                {selected.issued_by ? <FactRow icon="key-outline" label="Kodu üreten" value={selected.issued_by.fullName || `@${selected.issued_by.username}`} /> : null}
                {selected.expires_at ? <FactRow icon="hourglass-outline" label="Geçerlilik sonu" value={formatDateTime(selected.expires_at)} tone={selected.expired ? "danger" : undefined} /> : null}
                {selected.used_at ? <FactRow icon="checkmark-circle-outline" label="Şifre yenilendi" value={formatDateTime(selected.used_at)} tone="win" /> : null}
                {selected.status === "cancelled" ? <FactRow icon="close-circle-outline" label="Kapatıldı" value={formatDateTime(selected.updated_at)} /> : null}
              </View>
            </GroupCard>

            {open ? (
              <DangerNote
                tone="info"
                icon="information-circle"
                title="Sonraki adım üyede"
                body="Kodu ilettikten sonra üye giriş ekranındaki “Şifremi unuttum” adımında kodu girerek yeni şifresini belirler; talep o zaman “Tamamlanan”a geçer."
              />
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.md },
  sheet: { gap: space.md },
  from: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { ...type.h2, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  footer: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
});
