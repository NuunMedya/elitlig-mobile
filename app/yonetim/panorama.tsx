/**
 * ELİTLİG PANORAMA — YouTube programının yayın kaplamasını telefondan sür.
 *
 * Web: pages/management/panorama/PanoramaAdmin.js. Liste → yayına dokununca
 * reji kumandası (components/admin/broadcast/PanoramaControl): sahne seç,
 * gereken kaydı seç, YAYINA VER. Yeni yayın alt sayfadan açılır; Türkiye
 * geneli yönetici yayının ilini seçer, il yetkilisi kendi iline açar.
 * Ayrıntı 15 sn'de bir tazelenir: başka bir rejinin bastığı sahne görünür.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AdminList, AdminScreen, FormSheet, RecordCard, useAdminMutation, type FieldDef } from "@/components/admin";
import { PanoramaControl } from "@/components/admin/broadcast/PanoramaControl";
import { EmptyState, FAB, SkeletonCard } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { timeAgo } from "@/lib/admin/format";
import { createBroadcast, getPanoramaCatalog, listBroadcasts } from "@/lib/api/admin/broadcast";
import { isNationwideUser } from "@/lib/api/admin/staff";
import { getCities } from "@/lib/api/meta";
import { useAuth } from "@/providers/AuthProvider";

const PERMS = ["panorama.view", "panorama.broadcast"] as const;

export default function PanoramaScreen() {
  const auth = useAuth();
  const canCreate = hasAnyPermission(auth.user, ["panorama.create"]);
  const nationwide = isNationwideUser(auth.user);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const catalog = useQuery({ queryKey: ["admin", "panorama", "catalog"], queryFn: getPanoramaCatalog, staleTime: 600_000 });
  const list = useQuery({ queryKey: ["admin", "panorama", "list"], queryFn: () => listBroadcasts() });
  const cities = useQuery({ queryKey: ["admin", "panorama", "cities"], queryFn: getCities, enabled: nationwide, staleTime: 300_000 });

  const create = useAdminMutation((body: Parameters<typeof createBroadcast>[0]) => createBroadcast(body), {
    success: (b) => `“${b.name}” yayını oluşturuldu.`,
    invalidate: [["admin", "panorama", "list"]],
    onSuccess: (b) => setOpenId(b.id),
  });

  const sceneLabel = (key: string) => catalog.data?.scenes.find((s) => s.key === key)?.label ?? key;
  const items = (list.data ?? []).filter((b) => !q.trim() || [b.name, b.episodeTitle].join(" ").toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR")));

  const fields: FieldDef[] = [
    { key: "name", label: "Yayın adı", kind: "text", required: true, placeholder: "Örn. Elitlig Panorama" },
    { key: "episodeTitle", label: "Bölüm başlığı", kind: "text" },
    ...(nationwide
      ? [{ key: "cityId", label: "İl", kind: "select" as const, required: true, options: (cities.data ?? []).map((c) => ({ value: c.id, label: c.label })) }]
      : []),
    {
      key: "layout",
      label: "Düzen",
      kind: "segment",
      options: (catalog.data?.layouts ?? [{ value: "duo", label: "İkili" }]).map((l) => ({ value: l.value, label: l.label })),
    },
  ];

  if (openId != null) {
    return (
      <AdminScreen title="Panorama reji" subtitle="Yayın ekranı ve sahneler" permission={PERMS}>
        {catalog.data ? <PanoramaControl id={openId} catalog={catalog.data} onClose={() => setOpenId(null)} /> : catalog.isLoading ? <SkeletonCard /> : <EmptyState icon="tv-outline" title="Sahne kataloğu alınamadı" action={{ label: "Tekrar dene", onPress: () => void catalog.refetch() }} variant="inline" />}
      </AdminScreen>
    );
  }

  return (
    <AdminScreen
      title="Elitlig Panorama"
      subtitle="Yayın ekranı ve sahneler"
      permission={PERMS}
      scroll={false}
      overlay={canCreate ? <FAB icon="add" label="Yeni yayın" extended onPress={() => setCreating(true)} accessibilityLabel="Yeni yayın" /> : null}
    >
      <AdminList
        data={items}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        refreshing={list.isRefetching}
        onRefresh={list.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Yayın ara"
        emptyIcon="tv-outline"
        emptyTitle="Henüz yayın yok"
        emptyBody="Programın yayın kaplamasını buradan kur ve sahneleri telefondan yönet."
        keyExtractor={(b) => String(b.id)}
        renderItem={({ item }) => (
          <RecordCard
            title={item.name}
            subtitle={item.episodeTitle || null}
            meta={`Yayında: ${sceneLabel(item.scene.type)}${item.updatedAt ? ` · ${timeAgo(item.updatedAt)}` : ""}`}
            icon="tv-outline"
            iconTone={item.isLive ? "live" : "neutral"}
            badges={[
              item.isLive ? { label: "Yayın açık", tone: "live" } : { label: "Kapalı", tone: "neutral" },
              { label: catalog.data?.layouts.find((l) => l.value === item.layout)?.label ?? item.layout, tone: "brand" },
              nationwide ? { label: cities.data?.find((c) => c.id === item.cityId)?.label ?? `İl #${item.cityId}` } : null,
            ]}
            onPress={() => setOpenId(item.id)}
          />
        )}
      />
      <FormSheet
        visible={creating}
        onClose={() => setCreating(false)}
        title="Yeni yayın"
        submitLabel="Oluştur"
        fields={fields}
        initial={{ layout: "duo" }}
        onSubmit={(v) =>
          create.mutateAsync({
            name: String(v.name ?? "").trim(),
            episodeTitle: String(v.episodeTitle ?? ""),
            layout: (v.layout as "solo" | "duo" | "trio") ?? "duo",
            ...(nationwide && v.cityId ? { cityId: Number(v.cityId) } : {}),
          })
        }
      />
    </AdminScreen>
  );
}
