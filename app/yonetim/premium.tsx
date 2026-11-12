/**
 * PREMIUM ONAYLARI — havale ile ödenen premium üyelik siparişleri
 * (web /editor/premium-onaylari, PremiumApproval.js).
 *
 * NE: durum çipleri (Bekleyen / Onaylanan / Reddedilen / Tümü), arama (ad,
 * kullanıcı adı, açıklama kodu), sipariş kartı (üye, plan, süre, tutar,
 * havale açıklama kodu). Bekleyen siparişte Onayla / Reddet; onaylanınca
 * premium seçilen süre boyunca aktifleşir. Açıklama kodu kopyalanabilir.
 *
 * VERİ: GET /api/membership/admin/orders?status=, POST …/:id/approve|reject
 */

import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, confirmAction, useAdminMutation, type FilterOption } from "@/components/admin";
import { CountStrip, RequestCard } from "@/components/admin/team/ManageKit";
import { Chip, ChipGroup, IconTile, Touchable, useToast } from "@/components/ui";
import { formatDate, formatMoney, timeAgo } from "@/lib/admin/format";
import { decidePremiumOrder, listPremiumOrders, ORDER_STATUS_LABELS, PLAN_LABELS, type PremiumOrder } from "@/lib/api/admin/users";
import { REVIEW_TONE } from "@/components/admin/members/RequestParts";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const FILTERS: FilterOption[] = [
  { key: "pending", label: "Bekleyen" },
  { key: "approved", label: "Onaylanan" },
  { key: "rejected", label: "Reddedilen" },
  { key: "all", label: "Tümü" },
];

export default function PremiumApprovalScreen() {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const query = useQuery({ queryKey: ["admin", "premium", status], queryFn: () => listPremiumOrders(status) });

  const items = useMemo(() => {
    const needle = q.toLocaleLowerCase("tr-TR");
    const list = query.data ?? [];
    if (!needle) return list;
    return list.filter((o) =>
      `${o.user?.fullName ?? ""} ${o.user?.username ?? ""} ${o.user?.teamName ?? ""} ${o.referenceCode}`.toLocaleLowerCase("tr-TR").includes(needle)
    );
  }, [query.data, q]);

  const decide = useAdminMutation((v: { order: PremiumOrder; action: "approve" | "reject" }) => decidePremiumOrder(v.order.id, v.action), {
    success: (r, v) => r?.message || (v.action === "approve" ? "Sipariş onaylandı, premium aktifleştirildi." : "Sipariş reddedildi."),
    invalidate: [["admin", "premium"], ["admin", "members"]],
    onSuccess: () => setBusyId(null),
  });

  const ask = async (order: PremiumOrder, action: "approve" | "reject") => {
    const who = order.user?.fullName || order.user?.username || `#${order.user?.id ?? "?"}`;
    const ok = await confirmAction({
      title: action === "approve" ? "Sipariş onaylansın mı?" : "Sipariş reddedilsin mi?",
      message:
        action === "approve"
          ? `${who} için ${PLAN_LABELS[order.plan] ?? order.plan} premium ${order.months} ay aktifleşir. Havalenin (${order.referenceCode}) hesaba geçtiğinden emin ol.`
          : `${who} adlı üyenin siparişi reddedilecek.`,
      confirmLabel: action === "approve" ? "Onayla" : "Reddet",
      destructive: action === "reject",
    });
    if (!ok) return;
    setBusyId(order.id);
    decide.mutate({ order, action }, { onError: () => setBusyId(null) });
  };

  return (
    <AdminScreen title="Premium onayları" subtitle="Havale ile ödenen üyelik siparişleri" permission={["users.membership"]} scroll={false}>
      <AdminList<PremiumOrder>
        data={items}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={query.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Üye ya da açıklama kodu ara"
        extraHeader={
          <View style={styles.head}>
            {status === "pending" && query.data ? (
              <CountStrip
                items={[
                  { key: "count", label: "Bekleyen", value: query.data.length, tone: "warn", icon: "hourglass" },
                  { key: "sum", label: "Tutar", value: formatMoney(query.data.reduce((n, o) => n + Number(o.amount || 0), 0), true), tone: "win", icon: "cash" },
                  { key: "team", label: "Takım planı", value: query.data.filter((o) => o.plan === "team").length, tone: "brand", icon: "shield-half" },
                ]}
              />
            ) : null}
            <ChipGroup scrollable contentPadding={0}>
              {FILTERS.map((f) => (
                <Chip key={f.key} label={f.label} count={f.key === status && query.data ? query.data.length : undefined} size="sm" selected={status === f.key} onPress={() => setStatus(f.key)} />
              ))}
            </ChipGroup>
          </View>
        }
        summary={query.data ? `${items.length} sipariş · açıklama koduna dokununca kopyalanır` : null}
        keyExtractor={(o) => String(o.id)}
        emptyIcon="diamond-outline"
        emptyTitle="Bu durumda sipariş yok"
        renderItem={({ item }) => {
          const pending = item.status === "pending";
          const who = item.user?.fullName || item.user?.username || `Üye #${item.user?.id ?? "?"}`;
          const copy = async () => {
            await Clipboard.setStringAsync(item.referenceCode);
            toast.show({ message: "Açıklama kodu kopyalandı.", tone: "success" });
          };
          return (
            <RequestCard
              leading={<IconTile icon={item.plan === "team" ? "shield-half" : "diamond"} tone={pending ? (item.plan === "team" ? "violet" : "pink") : "neutral"} size={38} glow={false} />}
              who={who}
              when={[timeAgo(item.createdAt), item.user?.teamName || item.user?.phone || item.user?.email].filter(Boolean).join(" · ")}
              priority={pending ? { label: PLAN_LABELS[item.plan] ?? item.plan, tone: item.plan === "team" ? "brand" : "info", icon: "diamond" } : null}
              status={pending ? null : { label: ORDER_STATUS_LABELS[item.status] ?? item.status, tone: REVIEW_TONE[item.status] }}
              title={`${item.planLabel || PLAN_LABELS[item.plan] || item.plan} premium · ${item.months} ay`}
              done={!pending}
              onPress={item.user?.id ? () => router.push(`/yonetim/uyeler/${item.user!.id}` as Href) : undefined}
              onApprove={pending ? () => void ask(item, "approve") : undefined}
              onReject={pending ? () => void ask(item, "reject") : undefined}
              busy={busyId === item.id}
            >
              <View style={styles.money}>
                <View style={styles.grow}>
                  <Text style={styles.amount} numberOfLines={1} {...textScale.badge}>
                    {formatMoney(item.amount)}
                  </Text>
                  <Text style={styles.period} numberOfLines={1} {...textScale.dense}>
                    {item.startDate ? `${formatDate(item.startDate)} → ${formatDate(item.endDate)}` : formatDate(item.createdAt)}
                    {item.approvedAt ? ` · sonuç ${formatDate(item.approvedAt)}` : ""}
                  </Text>
                </View>
                <Touchable feedback="card" haptic="selection" onPress={() => void copy()} style={styles.code} accessibilityRole="button" accessibilityLabel={`Açıklama kodunu kopyala: ${item.referenceCode}`}>
                  <Text style={styles.codeText} {...textScale.badge}>
                    {item.referenceCode}
                  </Text>
                  <Ionicons name="copy-outline" size={13} color={colors.brandAccent} />
                </Touchable>
              </View>
              {item.paymentDescription ? (
                <Text style={styles.period} numberOfLines={1} {...textScale.dense}>
                  Ödeme: {item.paymentDescription}
                </Text>
              ) : null}
            </RequestCard>
          );
        }}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.md },
  grow: { flex: 1, minWidth: 0 },
  money: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    marginTop: space.xxs,
  },
  amount: { ...type.scoreMd, color: colors.textPrimary },
  period: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
  code: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  codeText: { ...type.numSmStrong, color: colors.brandAccent, letterSpacing: 1 },
});
