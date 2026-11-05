/**
 * MUHASEBE MERKEZİ — web /yonetim/araclar/muhasebe (AccountingHub).
 *
 * Dört bölüm tek yerde; her biri ayrı ekranda düzenlenir:
 *   Hesaplar ve Virman · Ön Muhasebe · Maç Muhasebesi · Türkiye Geneli
 *
 * GÖRÜNÜRLÜK web visibleSections ile birebir: Maç Muhasebesi accounting.*
 * yetkisiyle, Türkiye Geneli national_accounting.* yetkisi + Türkiye geneli
 * rolle görünür; Hesaplar ve Ön Muhasebe her yönetim kullanıcısına açık.
 *
 * ÖZET: hesapların toplam bakiyesi ve kapsam toplamları üstte; virman
 * düğmesi en az iki yönetilebilir hesap varsa açılır (web "Virman").
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, Panel, useAdminMutation } from "@/components/admin";
import { TransferSheet } from "@/components/admin/accounting/financeSheets";
import { Note } from "@/components/admin/accounting/parts";
import { HubGrid, HubTile, MetricGrid, MetricTile, SkeletonCard, type HubTone } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import {
  SCOPES,
  SCOPE_BOOK,
  SCOPE_LABEL,
  canManageAccount,
  createTransfer,
  listAccounts,
  money,
  visibleSections,
} from "@/lib/api/admin/accounting";
import { errorText } from "@/lib/admin/errors";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const TONES: Record<string, HubTone> = { hesaplar: "brand", "on-muhasebe": "win", mac: "accent", turkiye: "info" };

export default function AccountingHubScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [transfer, setTransfer] = useState(false);
  const sections = visibleSections(auth.user, (perms) => hasAnyPermission(auth.user, perms));
  const finance = useQuery({ queryKey: ["admin", "finance", "accounts"], queryFn: () => listAccounts() });
  const accounts = (finance.data?.items || []).filter((a) => !a.archived);
  const canTransfer = accounts.filter(canManageAccount).length >= 2;
  const scopes = SCOPES.filter((s) => finance.data?.access?.[s]?.view || accounts.some((a) => a.scope === s));

  const save = useAdminMutation((args: { body: Parameters<typeof createTransfer>[0]; message: string }) => createTransfer(args.body), {
    success: (_r, v) => v.message,
    invalidate: [["admin", "finance"]],
    silentError: true,
  });

  const financeError =
    finance.error instanceof ApiError && finance.error.status === 404
      ? "Hesaplar ve Virman için sunucu güncellemesi henüz yayında değil."
      : finance.error
        ? errorText(finance.error)
        : null;

  return (
    <AdminScreen
      title="Muhasebe"
      subtitle="Hesaplar, ön muhasebe, maç muhasebesi, Türkiye geneli"
      onRefresh={finance.refetch}
      refreshing={finance.isRefetching}
      actions={canTransfer ? [{ icon: "swap-horizontal", accessibilityLabel: "Virman yap", onPress: () => setTransfer(true) }] : undefined}
    >
      <Text style={styles.lead} {...textScale.long}>
        Her bölüm ayrı düzenlenir; hesaplar arasında virman yapılır. Bir hesap bir defterin ödeme yöntemine bağlanırsa ödenmiş kayıtlar bakiyeye kendiliğinden yansır.
      </Text>

      {finance.isLoading ? (
        <SkeletonCard />
      ) : financeError ? (
        <Note tone="danger" text={financeError} icon="alert-circle-outline" />
      ) : (
        <MetricGrid columns={2}>
          <MetricTile label="Toplam bakiye" value={money(finance.data?.totals?.all || 0)} hint={`${accounts.length} hesap · görebildikleriniz`} icon="business-outline" tone="brand" onPress={() => router.push("/yonetim/araclar/muhasebe/hesaplar" as never)} />
          {scopes.map((s) => (
            <MetricTile
              key={s}
              label={`${SCOPE_LABEL[s]} hesaplar`}
              value={money(finance.data?.totals?.[s] ?? accounts.filter((a) => a.scope === s).reduce((n, a) => n + (Number(a.balance) || 0), 0))}
              hint={SCOPE_BOOK[s]}
            />
          ))}
        </MetricGrid>
      )}

      <Panel title="Bölümler">
        <HubGrid inset="flush">
          {sections.map((s) => (
            <HubTile
              key={s.key}
              icon={s.icon}
              title={s.label}
              subtitle={s.key === "hesaplar" && finance.data ? money(finance.data.totals?.all || 0) : s.hint}
              tone={TONES[s.key]}
              onPress={() => router.push(s.route as never)}
            />
          ))}
        </HubGrid>
      </Panel>

      {sections.length < 4 ? (
        <View style={styles.hint}>
          <Text style={styles.hintText} {...textScale.long}>
            Maç Muhasebesi il muhasebe yetkisiyle, Türkiye Geneli ise Türkiye geneli muhasebe yetkisi ve Türkiye geneli rolle görünür.
          </Text>
        </View>
      ) : null}

      <TransferSheet
        visible={transfer}
        onClose={() => setTransfer(false)}
        accounts={accounts}
        onSubmit={(body, message) => save.mutateAsync({ body, message })}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  lead: { ...type.bodySm, color: colors.textSecondary },
  hint: { paddingHorizontal: space.xs },
  hintText: { ...type.caption, color: colors.textTertiary },
});
