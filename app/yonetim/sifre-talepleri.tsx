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

import { AdminList, AdminScreen, confirmAction, InfoLine, RecordCard, useAdminMutation, type FilterOption } from "@/components/admin";
import { openExternal } from "@/components/admin/members/contact";
import { ResetCodeCard } from "@/components/admin/members/MemberSections";
import { BottomSheet, Button, type Tone } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDateTime, timeAgo } from "@/lib/admin/format";
import {
  ACCOUNT_STATUS_LABELS,
  cancelPasswordReset,
  issuePasswordCode,
  listPasswordResets,
  personName,
  RESET_STATUS_LABELS,
  whatsappUrl,
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
  const wa = selected ? whatsappUrl(selected.user.phone) : null;

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
        filters={filters}
        filter={tab}
        onFilter={setTab}
        keyExtractor={(r) => String(r.id)}
        emptyIcon="lock-open-outline"
        emptyTitle={q ? "Aramayla eşleşen talep yok" : tab === "requested" ? "Bekleyen şifre sıfırlama talebi yok" : "Bu listede talep yok"}
        renderItem={({ item }) => (
          <RecordCard
            title={personName(item.user)}
            subtitle={[item.user.username ? `@${item.user.username}` : null, item.user.city].filter(Boolean).join(" · ") || null}
            meta={`${formatDateTime(item.created_at)} · ${timeAgo(item.created_at)}`}
            avatar={{ name: personName(item.user) }}
            badges={[{ label: statusText(item), tone: item.expired ? "danger" : TONE[item.status] }]}
            onPress={() => {
              setSnapshot(item);
              setSelectedId(item.id);
            }}
          />
        )}
      />

      <BottomSheet
        visible={selected != null}
        onClose={() => setSelectedId(null)}
        title={selected ? personName(selected.user) : "Talep"}
        snap="full"
        footer={
          open ? (
            <View style={styles.footer}>
              <Button label="Talebi kapat" variant="secondary" onPress={() => void askCancel(selected!)} loading={cancel.isPending} disabled={issue.isPending} />
              <Button
                label={selected!.status === "issued" ? "Yeni kod üret" : "Kod üret"}
                icon="key-outline"
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
            <Text style={styles.meta} {...textScale.dense}>
              {selected.user.username ? `@${selected.user.username}` : "Kullanıcı adı yok"}
              {selected.user.city ? ` · ${selected.user.city}` : ""} · {statusText(selected)}
            </Text>

            {shownCode ? <ResetCodeCard code={shownCode.code} expiresAt={shownCode.expiresAt} username={selected.user.username} phone={selected.user.phone} /> : null}

            <View>
              <Text style={styles.section} {...textScale.dense}>
                İletişim bilgileri
              </Text>
              <InfoLine label="Telefon" value={selected.user.phone || "—"} />
              <InfoLine label="E-posta" value={selected.user.email || "—"} />
              <InfoLine label="İl" value={selected.user.city || "—"} />
              <InfoLine label="Hesap durumu" value={ACCOUNT_STATUS_LABELS[String(selected.user.status ?? "")] ?? (selected.user.status || "—")} />
            </View>
            <View style={styles.row}>
              {selected.user.phone ? <Button label="Ara" icon="call-outline" size="sm" variant="secondary" onPress={() => void openExternal(`tel:${selected.user.phone}`)} /> : null}
              {wa ? <Button label="WhatsApp" icon="logo-whatsapp" size="sm" variant="secondary" onPress={() => void openExternal(wa)} /> : null}
              {selected.user.email ? <Button label="E-posta" icon="mail-outline" size="sm" variant="secondary" onPress={() => void openExternal(`mailto:${selected.user.email}`)} /> : null}
              {hasAnyPermission(auth.user, ["users.view"]) ? (
                <Button
                  label="Üye kartı"
                  icon="person-outline"
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    const id = selected.user.id;
                    setSelectedId(null);
                    router.push(`/yonetim/uyeler/${id}` as Href);
                  }}
                />
              ) : null}
            </View>

            <View>
              <Text style={styles.section} {...textScale.dense}>
                Talep geçmişi
              </Text>
              <InfoLine label="Talep tarihi" value={formatDateTime(selected.created_at)} />
              <InfoLine label="Talep IP" value={selected.requested_ip || "—"} />
              {selected.issued_by ? <InfoLine label="Kodu üreten" value={selected.issued_by.fullName || `@${selected.issued_by.username}`} /> : null}
              {selected.expires_at ? <InfoLine label="Kod geçerlilik sonu" value={formatDateTime(selected.expires_at)} /> : null}
              {selected.used_at ? <InfoLine label="Şifre yenilendi" value={formatDateTime(selected.used_at)} /> : null}
              {selected.status === "cancelled" ? <InfoLine label="Kapatıldı" value={formatDateTime(selected.updated_at)} /> : null}
            </View>

            {open ? (
              <Text style={styles.note} {...textScale.long}>
                Kodu ilettikten sonra üye giriş ekranındaki “Şifremi unuttum” adımında kodu girerek yeni şifresini belirler; talep o zaman “Tamamlanan”a geçer.
              </Text>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: space.lg },
  meta: { ...type.caption, color: colors.textTertiary },
  section: { ...type.overline, color: colors.textTertiary, marginBottom: space.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  note: { ...type.bodySm, color: colors.textSecondary },
  footer: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
});
