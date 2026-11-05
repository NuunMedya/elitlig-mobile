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
import { StyleSheet, View } from "react-native";

import { AdminList, AdminScreen, confirmAction, RecordCard, useAdminMutation, type FilterOption } from "@/components/admin";
import { Button, useToast } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/admin/format";
import { decidePremiumOrder, listPremiumOrders, ORDER_STATUS_LABELS, PLAN_LABELS, type PremiumOrder } from "@/lib/api/admin/users";
import { REVIEW_TONE } from "@/components/admin/members/RequestParts";
import { space } from "@/theme";

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
        filters={FILTERS.map((f) => (f.key === status && query.data ? { ...f, count: query.data.length } : f))}
        filter={status}
        onFilter={setStatus}
        summary={query.data ? `${items.length} sipariş` : null}
        keyExtractor={(o) => String(o.id)}
        emptyIcon="diamond-outline"
        emptyTitle="Bu durumda sipariş yok"
        renderItem={({ item }) => (
          <RecordCard
            title={item.user?.fullName || item.user?.username || `Üye #${item.user?.id ?? "?"}`}
            subtitle={[PLAN_LABELS[item.plan] ?? item.plan, `${item.months} ay`, item.user?.teamName || item.user?.phone || item.user?.email].filter(Boolean).join(" · ")}
            meta={`Kod ${item.referenceCode} · ${formatDate(item.createdAt)}${item.approvedAt ? ` · Sonuç ${formatDate(item.approvedAt)}` : ""}`}
            icon="diamond-outline"
            iconTone={item.status === "pending" ? "brand" : "neutral"}
            value={formatMoney(item.amount)}
            valueTone={item.status === "approved" ? "win" : "neutral"}
            badges={[{ label: ORDER_STATUS_LABELS[item.status] ?? item.status, tone: REVIEW_TONE[item.status] }]}
            onPress={item.user?.id ? () => router.push(`/yonetim/uyeler/${item.user!.id}` as Href) : undefined}
            onLongPress={async () => {
              await Clipboard.setStringAsync(item.referenceCode);
              toast.show({ message: "Açıklama kodu kopyalandı.", tone: "success" });
            }}
          >
            {item.status === "pending" ? (
              <View style={styles.actions}>
                <Button label="Reddet" variant="danger" size="sm" onPress={() => void ask(item, "reject")} disabled={busyId === item.id} />
                <Button label="Onayla" icon="checkmark" size="sm" onPress={() => void ask(item, "approve")} loading={busyId === item.id && decide.variables?.action === "approve"} disabled={busyId === item.id} style={styles.grow} />
              </View>
            ) : null}
          </RecordCard>
        )}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  grow: { flex: 1 },
});
