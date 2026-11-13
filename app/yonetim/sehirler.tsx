/**
 * ŞEHİRLER — ElitLig'in faaliyet gösterdiği iller (web pages/management/CitiesManagement.js).
 *
 * NE: kayıtlı şehirler (plaka, ad), sayaç şeridi, yeni il ekleme (81 il
 * listesinden; İstanbul Avrupa ve Anadolu iki ayrı şehir). Şehre dokununca
 * o ilin sayfaları açılır: iletişim alanları (uygulama içi), sitedeki şehir
 * ve iletişim sayfası, il yöneticisi tanımlama kısayolu.
 *
 * NEDEN DÜZENLEME YOK: sunucu (routes/Cities.js) yalnız listeleme ve ekleme
 * ucu sunar; il adı kanonik yazımla kaydedilir ve harita eşleşmesi bu ada
 * bağlıdır. İl sayfasının içerikleri (iletişim, sosyal medya, WhatsApp)
 * "Şehir iletişim sayfaları" ekranından düzenlenir.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, AdminList, AdminScreen, FormSheet, useAdminMutation } from "@/components/admin";
import { OpsRecord, StatusTiles } from "@/components/admin/matches/opsKit";
import { FAB, GradientBar } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { createCity, getCities, getProvinces, systemKeys, type City } from "@/lib/api/admin/system";
import { WEB_BASE_URL } from "@/lib/config";
import { openLink } from "@/lib/links";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["city_pages.manage"];

export default function CitiesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const canManage = hasAnyPermission(auth.user, PERMS);
  const canContacts = hasAnyPermission(auth.user, ["city_pages.contacts"]);
  const canUsers = hasAnyPermission(auth.user, ["management_users.view"]);

  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [active, setActive] = useState<City | null>(null);

  const cities = useQuery({ queryKey: systemKeys.cities, queryFn: getCities });
  const provinces = useQuery({ queryKey: systemKeys.provinces, queryFn: getProvinces, enabled: canManage });

  const available = useMemo(
    () => (provinces.data?.provinces ?? []).filter((p) => !p.added).sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [provinces.data]
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    const list = [...(cities.data ?? [])].sort((a, b) => a.city_name.localeCompare(b.city_name, "tr"));
    return needle ? list.filter((c) => `${c.city_name} ${c.plate_code ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle)) : list;
  }, [cities.data, q]);

  const coveredProvinces = useMemo(
    () => new Set((cities.data ?? []).map((c) => c.plate_code).filter(Boolean)).size,
    [cities.data]
  );

  const add = useAdminMutation((name: string) => createCity(name), {
    success: (r) => r.message || "Şehir eklendi.",
    invalidate: [systemKeys.cities, ["meta"]],
    silentError: true,
  });

  return (
    <AdminScreen
      title="Şehirler"
      permission={PERMS}
      scroll={false}
      overlay={
        canManage ? (
          <FAB icon="add" label="Şehir ekle" extended onPress={() => setAdding(true)} accessibilityLabel="Yeni şehir ekle" />
        ) : null
      }
    >
      <AdminList
        data={visible}
        loading={cities.isLoading}
        error={cities.error}
        onRetry={cities.refetch}
        refreshing={cities.isRefetching}
        onRefresh={() => {
          void cities.refetch();
          if (canManage) void provinces.refetch();
        }}
        search={q}
        onSearch={setQ}
        searchPlaceholder="İl ya da plaka ara"
        extraHeader={
          <View style={styles.header}>
            <StatusTiles
              items={[
                { key: "added", label: "Kayıtlı şehir", value: cities.data?.length ?? 0, tone: "brand", icon: "location-outline" },
                ...(canManage ? [{ key: "free", label: "Eklenebilir il", value: available.length, tone: "info" as const, icon: "add-circle-outline" as const }] : []),
              ]}
            />
            {/* Kapsama: 81 ilin kaçında ElitLig var — plakası benzersiz il sayısı. */}
            <View style={styles.coverage}>
              <View style={styles.coverageHead}>
                <Text style={styles.coverageLabel} {...textScale.badge}>
                  TÜRKİYE KAPSAMI
                </Text>
                <Text style={styles.coverageValue} {...textScale.badge}>
                  {coveredProvinces}/81 il
                </Text>
              </View>
              <GradientBar value={coveredProvinces / 81} height={6} />
            </View>
            <Text style={styles.hint} {...textScale.long}>
              Eklenen şehir ana sayfadaki haritada işaretlenir, yönetim kullanıcılarına atanabilir ve lig/sezon ekranlarında seçilebilir. Lig
              tanımlanana kadar şehir sayfası “yakında” ekranıyla açılır; iletişim sayfası hemen çalışır.
            </Text>
          </View>
        }
        keyExtractor={(c) => String(c.id)}
        emptyIcon="map-outline"
        emptyTitle={cities.data?.length ? "Eşleşen il yok" : "Henüz şehir eklenmemiş"}
        renderItem={({ item }) => (
          <OpsRecord
            title={item.city_name}
            subtitle={item.plate_code ? "Şehir sayfası · iletişim sayfası" : "Plaka kodu yok"}
            leading={<Plate code={item.plate_code} />}
            onPress={() => setActive(item)}
          />
        )}
      />

      <ActionSheet
        visible={active != null}
        onClose={() => setActive(null)}
        title={active?.city_name}
        actions={
          active
            ? [
                {
                  label: "İletişim alanları",
                  hint: "Telefon, WhatsApp, e-posta, sosyal medya",
                  icon: "call-outline",
                  hidden: !canContacts,
                  onPress: () => router.push(`/yonetim/sehir-iletisim?il=${active.id}` as never),
                },
                {
                  label: "Yönetim kullanıcısı tanımla",
                  icon: "person-add-outline",
                  hidden: !canUsers,
                  onPress: () => router.push("/yonetim/yonetim-kullanicilari" as never),
                },
                { label: "Sitede şehir sayfasını aç", icon: "open-outline", onPress: () => void openLink(`${WEB_BASE_URL}/sehir/${active.id}`) },
                {
                  label: "Sitede iletişim sayfasını aç",
                  icon: "mail-open-outline",
                  onPress: () => void openLink(`${WEB_BASE_URL}/sehir/${active.id}/iletisim`),
                },
              ]
            : []
        }
      />

      <FormSheet
        visible={adding}
        onClose={() => setAdding(false)}
        title="Yeni şehir ekle"
        intro={available.length ? "İl, 81 il listesinden seçilir; sunucu adı kanonik yazımıyla kaydeder." : "Tüm iller eklenmiş."}
        snap="content"
        fields={[
          {
            key: "province",
            label: "İl",
            kind: "select",
            required: true,
            icon: "map-outline",
            options: available.map((p) => ({ value: p.slug, label: p.name, hint: `Plaka ${p.code}` })),
            disabled: !available.length,
          },
        ]}
        initial={{}}
        submitLabel="Şehri ekle"
        onSubmit={async (values) => {
          const province = available.find((p) => p.slug === values.province);
          await add.mutateAsync(province?.name ?? String(values.province));
          void provinces.refetch();
        }}
      />
    </AdminScreen>
  );
}

/** Plaka pulu: solda "TR" şeridi, sağda Archivo plaka kodu — liste satırının öndeki görseli. */
function Plate({ code }: { code?: string | null }) {
  return (
    <View style={styles.plate} accessibilityLabel={code ? `Plaka ${code}` : "Plaka yok"}>
      <View style={styles.plateStrip}>
        <Text style={styles.plateTr} {...textScale.badge}>
          TR
        </Text>
      </View>
      <Text style={styles.plateCode} {...textScale.badge}>
        {code || "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.md },
  hint: { ...type.caption, color: colors.textTertiary },
  coverage: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  coverageHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  coverageLabel: { ...type.overline, color: colors.textTertiary },
  coverageValue: { ...type.numSmStrong, color: colors.textPrimary },
  plate: {
    width: 58,
    height: 34,
    flexDirection: "row",
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  plateStrip: { width: 14, backgroundColor: colors.info, alignItems: "center", justifyContent: "flex-end", paddingBottom: 3 },
  plateTr: { ...type.nano, color: colors.onDark },
  plateCode: { ...type.scoreXs, color: colors.textPrimary, flex: 1, textAlign: "center", alignSelf: "center" },
});
