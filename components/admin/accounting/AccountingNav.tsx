/**
 * MUHASEBE İÇİ GEZİNME — Özet · Hesaplar · Ön muhasebe · Maç · Türkiye.
 *
 * Muhasebe telefonda tek uygulamadır; bölümler derin bir listeye değil,
 * başlığın altındaki sekmelere bağlıdır. Sekme değişimi `replace` ile yapılır:
 * geri oku bölümler arasında dolaştırmaz, uygulamadan çıkarır.
 *
 * Görünürlük web AccountingHub.visibleSections ile aynıdır (Maç Muhasebesi
 * accounting.*, Türkiye Geneli national_accounting.* + Türkiye geneli rol).
 */

import { useRouter } from "expo-router";
import React, { useMemo } from "react";

import { ToolTabs, type ToolTabItem } from "@/components/admin/tools/ToolApp";
import { hasAnyPermission } from "@/lib/admin/access";
import { visibleSections, type SectionKey } from "@/lib/api/admin/accounting";
import { useAuth } from "@/providers/AuthProvider";

export type AccountingTab = "ozet" | SectionKey;

const SHORT: Record<SectionKey, string> = { hesaplar: "Hesaplar", "on-muhasebe": "Ön muhasebe", mac: "Maç", turkiye: "Türkiye" };
const HOME = "/yonetim/araclar/muhasebe";

export function AccountingNav({ current }: { current: AccountingTab }) {
  const auth = useAuth();
  const router = useRouter();
  const sections = useMemo(() => visibleSections(auth.user, (perms) => hasAnyPermission(auth.user, perms)), [auth.user]);
  const items: ToolTabItem<AccountingTab>[] = [
    { key: "ozet", label: "Özet", icon: "speedometer-outline" },
    ...sections.map((s) => ({ key: s.key as AccountingTab, label: SHORT[s.key], icon: s.icon })),
  ];
  return (
    <ToolTabs
      app="muhasebe"
      items={items}
      value={current}
      onChange={(key) => {
        if (key === current) return;
        const route = key === "ozet" ? HOME : sections.find((s) => s.key === key)?.route;
        if (route) router.replace(route as never);
      }}
    />
  );
}
