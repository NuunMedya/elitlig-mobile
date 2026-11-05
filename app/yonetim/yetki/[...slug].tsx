/**
 * YETKİ AYRINTISI — Kullanıcı yetkilendirme ekranının alt sayfaları.
 *
 *   /yonetim/yetki/kisi/:id          tek kişinin yetkileri ve ünvanı
 *   /yonetim/yetki/rol/:key          rol ayarları ve yetki şablonu
 *   /yonetim/yetki/toplu?ids=1,2,3   işaretlenen kişilere toplu yetki
 *
 * NEDEN AYRI SAYFA: yetki düzenleyici 150'ye yakın anahtar taşır; listenin
 * üstünde alt sayfa (BottomSheet) olarak açılsa kaydırma ve klavye çakışır.
 * Tam ekran sayfa + altta sabit kaydet çubuğu telefonda en rahat düzen.
 */

import { useLocalSearchParams, useRouter } from "expo-router";

import { AdminScreen } from "@/components/admin";
import { BulkAccessView, PersonAccessView, RoleTemplateView } from "@/components/admin/system/AccessViews";
import { EmptyState } from "@/components/ui";

const PERMS = ["permissions.view", "permissions.manage"];
const ROLE_PERMS = ["permissions.view", "permissions.manage", "permissions.roles"];

export default function PermissionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string | string[]; ids?: string }>();
  const slug = Array.isArray(params.slug) ? params.slug : params.slug ? [params.slug] : [];
  const [kind, value] = slug;

  if (kind === "kisi" && value) {
    return (
      <AdminScreen title="Kişi yetkileri" permission={PERMS} scroll={false}>
        <PersonAccessView id={Number(value)} />
      </AdminScreen>
    );
  }

  if (kind === "rol" && value) {
    return (
      <AdminScreen title="Rol ve şablon" permission={ROLE_PERMS} scroll={false}>
        <RoleTemplateView roleKey={decodeURIComponent(value)} />
      </AdminScreen>
    );
  }

  if (kind === "toplu") {
    const ids = String(params.ids ?? "")
      .split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    return (
      <AdminScreen title="Toplu yetkilendirme" permission={["permissions.manage"]} scroll={false}>
        <BulkAccessView ids={ids} onIdsChange={(next) => router.setParams({ ids: next.join(",") })} />
      </AdminScreen>
    );
  }

  return (
    <AdminScreen title="Yetkilendirme" permission={PERMS}>
      <EmptyState
        icon="key-outline"
        title="Sayfa bulunamadı"
        body="Yetkilendirme ekranından bir kişi ya da rol seç."
        action={{ label: "Yetkilendirmeye dön", onPress: () => router.replace("/yonetim/yetkilendirme" as never) }}
        variant="inline"
      />
    </AdminScreen>
  );
}
