/**
 * ŞEHİR İLETİŞİM SAYFALARI — il iletişim kanalları ve gelen iletişim talepleri
 * (web pages/management/CityContactsManagement.js, city_pages.contacts).
 *
 * İKİ SEKME:
 *   ALANLAR   her il için bir ya da birden çok iletişim alanı (bayilik; ör.
 *             İstanbul → ASYA / AVRUPA): telefon, WhatsApp, e-posta, adres,
 *             Facebook / Instagram / YouTube / TikTok, harita. Ekle, düzenle,
 *             yayından kaldır (pasif), sil.
 *   TALEPLER  sitedeki iletişim kutusundan gelen mesajlar: durum ve il
 *             süzgeci, arama, sonsuz sayfa. Talebe dokununca ayrıntı açılır:
 *             okundu/okunmadı, arşivle/arşivden çıkar, ara, e-posta, sil.
 *
 * İl kısıtlı yönetici yalnız kendi ilini görür; kapsam sunucuda uygulanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import {
  ActionSheet,
  AdminList,
  AdminScreen,
  FormSheet,
  SelectField,
  confirmAction,
  useAdminMutation,
  type FieldDef,
  type FormValues,
} from "@/components/admin";
import { Avatar, Badge, BottomSheet, Button, FAB, IconTile, Tabs, Touchable } from "@/components/ui";
import { formatDateTime, intlPhone } from "@/lib/admin/format";
import {
  CONTACT_REQUEST_STATUS_LABELS,
  createContactSection,
  deleteContactRequest,
  deleteContactSection,
  getCities,
  getContactRequests,
  getContactSections,
  getContactUnreadCount,
  markContactRequestRead,
  setContactRequestStatus,
  systemKeys,
  updateContactSection,
  type ContactRequest,
  type ContactRequestStatus,
  type ContactSection,
  type ContactSectionInput,
} from "@/lib/api/admin/system";
import { openLink } from "@/lib/links";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["city_pages.contacts"];
type Tab = "sections" | "requests";

const SECTION_FIELDS: FieldDef[] = [
  { key: "label", label: "Bölge etiketi", kind: "text", placeholder: "Merkez (ör. ASYA / AVRUPA)" },
  { key: "phone", label: "Telefon", kind: "phone", placeholder: "0212 000 00 00", icon: "call-outline" },
  { key: "whatsapp", label: "WhatsApp", kind: "phone", placeholder: "905xxxxxxxxx", icon: "logo-whatsapp" },
  { key: "email", label: "E-posta", kind: "email", placeholder: "info@ornek.com", icon: "mail-outline" },
  { key: "facebook_url", label: "Facebook adresi", kind: "url", placeholder: "https://facebook.com/…", icon: "logo-facebook" },
  { key: "instagram_url", label: "Instagram adresi", kind: "url", placeholder: "https://instagram.com/…", icon: "logo-instagram" },
  { key: "youtube_url", label: "YouTube adresi", kind: "url", placeholder: "https://youtube.com/…", icon: "logo-youtube" },
  { key: "tiktok_url", label: "TikTok adresi", kind: "url", placeholder: "https://tiktok.com/@…", icon: "logo-tiktok" },
  { key: "map_embed_url", label: "Harita yerleştirme adresi (isteğe bağlı)", kind: "url", placeholder: "https://www.google.com/maps/embed?…", icon: "map-outline" },
  { key: "address", label: "Adres", kind: "multiline" },
  { key: "sort_order", label: "Sıra", kind: "number", hint: "Küçük sayı önce gösterilir." },
  { key: "is_active", label: "Aktif (yayında)", kind: "toggle" },
];

const STATUS_FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "new", label: "Yeni" },
  { key: "read", label: "Okundu" },
  { key: "archived", label: "Arşiv" },
];

const STATUS_TONE: Record<ContactRequestStatus, "warn" | "neutral" | "info"> = { new: "warn", read: "neutral", archived: "info" };

const firstParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const blank = (v: unknown) => {
  const text = String(v ?? "").trim();
  return text ? text : null;
};

export default function CityContactsScreen() {
  const params = useLocalSearchParams<{ il?: string; sekme?: string }>();
  const initialCity = Number(firstParam(params.il)) || null;
  const [tab, setTab] = useState<Tab>(firstParam(params.sekme) === "talepler" ? "requests" : "sections");
  const [cityId, setCityId] = useState<number | null>(initialCity);

  const cities = useQuery({ queryKey: systemKeys.cities, queryFn: getCities, staleTime: 5 * 60_000 });
  const unread = useQuery({ queryKey: [...systemKeys.contactRequests, "unread"], queryFn: getContactUnreadCount, retry: false });
  const cityName = (id: number | null | undefined) =>
    (id != null && cities.data?.find((c) => c.id === Number(id))?.city_name) || (id ? `Şehir #${id}` : "—");
  const cityOptions = useMemo(
    () => [...(cities.data ?? [])].sort((a, b) => a.city_name.localeCompare(b.city_name, "tr")).map((c) => ({ value: c.id, label: c.city_name })),
    [cities.data]
  );

  return (
    <AdminScreen
      title="Şehir iletişim sayfaları"
      permission={PERMS}
      scroll={false}
      bottom={
        <Tabs
          items={[
            { key: "sections" as Tab, label: "İletişim alanları" },
            { key: "requests" as Tab, label: "Talepler", badge: unread.data?.count || undefined },
          ]}
          value={tab}
          onChange={setTab}
          distribute="equal"
        />
      }
    >
      {tab === "sections" ? (
        <SectionsTab cityId={cityId} onCity={setCityId} cityOptions={cityOptions} cityName={cityName} />
      ) : (
        <RequestsTab cityId={cityId} onCity={setCityId} cityOptions={cityOptions} cityName={cityName} />
      )}
    </AdminScreen>
  );
}

interface TabProps {
  cityId: number | null;
  onCity: (id: number | null) => void;
  cityOptions: { value: number; label: string }[];
  cityName: (id: number | null | undefined) => string;
}

/* ═══════════════════════════ ALANLAR ═══════════════════════════ */

function SectionsTab({ cityId, onCity, cityOptions, cityName }: TabProps) {
  const [editing, setEditing] = useState<ContactSection | "new" | null>(null);
  const [active, setActive] = useState<ContactSection | null>(null);
  const sections = useQuery({ queryKey: systemKeys.contactSections(cityId), queryFn: () => getContactSections(cityId) });

  const invalidate = [["admin", "city-contacts", "sections"]];
  const save = useAdminMutation(
    (values: FormValues) => {
      const body: ContactSectionInput = {
        city_id: Number(values.city_id),
        label: blank(values.label),
        sort_order: Number(values.sort_order) || 0,
        phone: blank(values.phone),
        whatsapp: blank(values.whatsapp),
        email: blank(values.email),
        facebook_url: blank(values.facebook_url),
        instagram_url: blank(values.instagram_url),
        youtube_url: blank(values.youtube_url),
        tiktok_url: blank(values.tiktok_url),
        map_embed_url: blank(values.map_embed_url),
        address: blank(values.address),
        is_active: Boolean(values.is_active),
      };
      return editing && editing !== "new" ? updateContactSection(editing.id, body) : createContactSection(body);
    },
    { success: "İletişim alanı kaydedildi.", invalidate, silentError: true }
  );
  const toggleActive = useAdminMutation(
    (s: ContactSection) => updateContactSection(s.id, { ...stripSection(s), is_active: !s.is_active }),
    { success: (_r, s) => (s.is_active ? "İletişim alanı yayından kaldırıldı." : "İletişim alanı yayında."), invalidate }
  );
  const remove = useAdminMutation((s: ContactSection) => deleteContactSection(s.id), { success: "İletişim alanı silindi.", invalidate });

  const rows = useMemo(
    () => [...(sections.data ?? [])].sort((a, b) => cityName(a.city_id).localeCompare(cityName(b.city_id), "tr") || a.sort_order - b.sort_order),
    [sections.data, cityName]
  );

  const fields: FieldDef[] = [{ key: "city_id", label: "Şehir", kind: "select", required: true, options: cityOptions, icon: "location-outline" }, ...SECTION_FIELDS];

  const askDelete = async (s: ContactSection) => {
    const ok = await confirmAction({
      title: "İletişim alanı silinsin mi?",
      message: `“${s.label || "Merkez"}” (${cityName(s.city_id)}) kalıcı olarak silinecek.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate(s);
  };

  return (
    <>
      <AdminList
        data={rows}
        loading={sections.isLoading}
        error={sections.error}
        onRetry={sections.refetch}
        refreshing={sections.isRefetching}
        onRefresh={sections.refetch}
        extraHeader={
          <SelectField<number> label="Şehir" value={cityId} options={cityOptions} onChange={onCity} placeholder="Tüm şehirler" clearable icon="map-outline" />
        }
        summary={sections.data ? `${rows.length} iletişim alanı` : null}
        keyExtractor={(s) => String(s.id)}
        emptyIcon="call-outline"
        emptyTitle="Kayıtlı iletişim alanı yok"
        emptyBody="Bir şehir için iletişim kanallarını ekle."
        emptyAction={{ label: "Yeni iletişim alanı", onPress: () => setEditing("new") }}
        renderItem={({ item }) => (
          <Touchable feedback="card" onPress={() => setActive(item)} style={[styles.sectionCard, !item.is_active ? styles.muted : null]} accessibilityRole="button" accessibilityLabel={`${cityName(item.city_id)} ${item.label || "Merkez"}`}>
            <View style={styles.sectionHead}>
              <IconTile icon="business" tone={item.is_active ? "cyan" : "neutral"} size={42} />
              <View style={styles.flex}>
                <Text style={styles.kicker} numberOfLines={1} {...textScale.badge}>
                  {(cityName(item.city_id) || "İl").toLocaleUpperCase("tr-TR")}
                </Text>
                <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
                  {item.label || "Merkez"}
                </Text>
                {item.address ? (
                  <Text style={styles.cardMeta} numberOfLines={1} {...textScale.dense}>
                    {item.address}
                  </Text>
                ) : null}
              </View>
              <Badge label={item.is_active ? "Yayında" : "Pasif"} tone={item.is_active ? "win" : "neutral"} dot={item.is_active} size="xs" />
            </View>
            {/* Kanal ızgarası: dolu kanal renkli, boş kanal soluk. */}
            <View style={styles.channels}>
              {CHANNELS.map((c) => {
                const on = Boolean(item[c.key]);
                return (
                  <View key={c.key} style={[styles.channel, on ? styles.channelOn : null]} accessible accessibilityLabel={`${c.label}: ${on ? "var" : "yok"}`}>
                    <Ionicons name={c.icon} size={15} color={on ? colors.brandAccent : colors.textDisabled} />
                  </View>
                );
              })}
            </View>
            <Text style={styles.cardMeta} numberOfLines={1} {...textScale.dense}>
              {[item.phone, item.email].filter(Boolean).join(" · ") || "İletişim bilgisi girilmemiş"}
            </Text>
          </Touchable>
        )}
      />
      <FAB icon="add" label="Yeni alan" extended onPress={() => setEditing("new")} accessibilityLabel="Yeni iletişim alanı" />

      <ActionSheet
        visible={active != null}
        onClose={() => setActive(null)}
        title={active ? `${active.label || "Merkez"} · ${cityName(active.city_id)}` : undefined}
        actions={
          active
            ? [
                { label: "Düzenle", icon: "create-outline", onPress: () => setEditing(active) },
                { label: active.is_active ? "Yayından kaldır" : "Yayına al", icon: active.is_active ? "eye-off-outline" : "eye-outline", onPress: () => toggleActive.mutate(active) },
                { label: `Ara (${active.phone})`, icon: "call-outline", hidden: !active.phone, onPress: () => void Linking.openURL(`tel:${active.phone}`) },
                {
                  label: "WhatsApp'ta aç",
                  icon: "logo-whatsapp",
                  hidden: !active.whatsapp,
                  onPress: () => void openLink(`https://wa.me/${intlPhone(active.whatsapp) ?? ""}`),
                },
                { label: "E-posta yaz", icon: "mail-outline", hidden: !active.email, onPress: () => void Linking.openURL(`mailto:${active.email}`) },
                { label: "Sil", icon: "trash-outline", danger: true, onPress: () => void askDelete(active) },
              ]
            : []
        }
      />

      <FormSheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Yeni iletişim alanı" : "İletişim alanını düzenle"}
        intro="Bir şehirde birden fazla bayilik varsa (ör. İstanbul → ASYA / AVRUPA) her biri için ayrı alan ekle."
        fields={fields}
        initial={
          editing && editing !== "new"
            ? { ...editing, sort_order: String(editing.sort_order ?? 0) }
            : { city_id: cityId ?? cityOptions[0]?.value ?? null, sort_order: "0", is_active: true }
        }
        onSubmit={(values) => save.mutateAsync(values)}
      />
    </>
  );
}

function stripSection(s: ContactSection): ContactSectionInput {
  const { id: _id, public_id: _p, createdAt: _c, updatedAt: _u, ...rest } = s;
  return rest;
}

/* ═══════════════════════════ TALEPLER ═══════════════════════════ */

function RequestsTab({ cityId, onCity, cityOptions, cityName }: TabProps) {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ContactRequest | null>(null);

  const query = useInfiniteQuery({
    queryKey: [...systemKeys.contactRequests, "list", status, cityId, q],
    queryFn: ({ pageParam }) => getContactRequests({ page: pageParam, status, cityId, q }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const totalItems = query.data?.pages[0]?.totalItems;

  const invalidate = [systemKeys.contactRequests];
  const markRead = useAdminMutation((r: ContactRequest) => markContactRequestRead(r.id, !r.is_read), {
    success: (_x, r) => (r.is_read ? "Okunmadı olarak işaretlendi." : "Okundu olarak işaretlendi."),
    invalidate,
    onSuccess: (_x, r) => setOpen((cur) => (cur && cur.id === r.id ? { ...cur, is_read: !r.is_read, status: !r.is_read ? "read" : "new" } : cur)),
  });
  const changeStatus = useAdminMutation(
    (v: { r: ContactRequest; status: ContactRequestStatus }) => setContactRequestStatus(v.r.id, v.status),
    {
      success: (_x, v) => (v.status === "archived" ? "Talep arşivlendi." : "Talep arşivden çıkarıldı."),
      invalidate,
      onSuccess: () => setOpen(null),
    }
  );
  // Açılınca sessizce okundu işaretler (toast yok; gelen kutusu alışkanlığı).
  const autoRead = useAdminMutation((r: ContactRequest) => markContactRequestRead(r.id, true), { invalidate, silentError: true });
  const remove = useAdminMutation((r: ContactRequest) => deleteContactRequest(r.id), {
    success: "İletişim talebi silindi.",
    invalidate,
    onSuccess: () => setOpen(null),
  });

  const openRequest = (r: ContactRequest) => {
    if (!r.is_read) {
      autoRead.mutate(r);
      setOpen({ ...r, is_read: true, status: r.status === "new" ? "read" : r.status });
    } else setOpen(r);
  };

  const askDelete = async (r: ContactRequest) => {
    const ok = await confirmAction({
      title: "Talep silinsin mi?",
      message: "Bu iletişim talebi kalıcı olarak silinecek.",
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate(r);
  };

  return (
    <>
      <AdminList
        data={items}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={query.refetch}
        onEndReached={() => void query.fetchNextPage()}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        search={q}
        onSearch={setQ}
        searchPlaceholder="İsim, e-posta, mesaj ara"
        filters={STATUS_FILTERS}
        filter={status}
        onFilter={setStatus}
        extraHeader={
          <SelectField<number> label="Şehir" value={cityId} options={cityOptions} onChange={onCity} placeholder="Tüm şehirler" clearable icon="map-outline" />
        }
        summary={totalItems != null ? `${totalItems} talep` : null}
        keyExtractor={(r) => String(r.id)}
        emptyIcon="mail-open-outline"
        emptyTitle="İletişim talebi bulunamadı"
        renderItem={({ item }) => (
          <Touchable feedback="card" onPress={() => openRequest(item)} style={[styles.reqCard, !item.is_read ? styles.reqUnread : null]} accessibilityRole="button" accessibilityLabel={`${item.name}${item.is_read ? "" : ", okunmadı"}: ${item.subject || item.message}`}>
            {!item.is_read ? <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.reqStripe} /> : null}
            <Avatar name={item.name} size={40} />
            <View style={styles.flex}>
              <View style={styles.reqTop}>
                <Text style={[styles.reqName, !item.is_read ? styles.reqNameUnread : null]} numberOfLines={1} {...textScale.dense}>
                  {item.name}
                </Text>
                <Text style={styles.reqTime} {...textScale.badge}>
                  {formatDateTime(item.createdAt)}
                </Text>
              </View>
              {item.subject ? (
                <Text style={styles.reqSubject} numberOfLines={1} {...textScale.dense}>
                  {item.subject}
                </Text>
              ) : null}
              <Text style={styles.cardMeta} numberOfLines={2} {...textScale.dense}>
                {item.message}
              </Text>
              <View style={styles.reqFoot}>
                <Badge label={CONTACT_REQUEST_STATUS_LABELS[item.status] ?? item.status} tone={STATUS_TONE[item.status] ?? "neutral"} size="xs" />
                <Text style={styles.reqTime} numberOfLines={1} {...textScale.badge}>
                  {[cityName(item.city_id), item.section_label].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </View>
          </Touchable>
        )}
      />

      <BottomSheet
        visible={open != null}
        onClose={() => setOpen(null)}
        title={open?.name}
        snap="half"
        footer={
          open ? (
            <View style={styles.footer}>
              <Button label="Sil" variant="danger" size="sm" icon="trash-outline" onPress={() => void askDelete(open)} />
              <Button
                label={open.status === "archived" ? "Arşivden çıkar" : "Arşivle"}
                variant="secondary"
                size="sm"
                icon="archive-outline"
                loading={changeStatus.isPending}
                onPress={() => changeStatus.mutate({ r: open, status: open.status === "archived" ? "read" : "archived" })}
              />
              <Button
                label={open.is_read ? "Okunmadı yap" : "Okundu yap"}
                variant="ghost"
                size="sm"
                onPress={() => markRead.mutate(open)}
                style={styles.grow}
              />
            </View>
          ) : null
        }
      >
        {open ? (
          <View style={styles.detail}>
            <Text style={styles.meta} {...textScale.dense}>
              {[cityName(open.city_id), open.section_label, formatDateTime(open.createdAt)].filter(Boolean).join(" · ")}
            </Text>
            {open.subject ? (
              <Text style={styles.subject} {...textScale.dense}>
                {open.subject}
              </Text>
            ) : null}
            <Text style={styles.message} selectable {...textScale.long}>
              {open.message}
            </Text>
            <View style={styles.contacts}>
              {open.email ? (
                <Button label={open.email} icon="mail-outline" variant="secondary" size="sm" onPress={() => void Linking.openURL(`mailto:${open.email}`)} />
              ) : null}
              {open.phone ? (
                <Button label={open.phone} icon="call-outline" variant="secondary" size="sm" onPress={() => void Linking.openURL(`tel:${open.phone}`)} />
              ) : null}
              {open.phone && intlPhone(open.phone) ? (
                <Button label="WhatsApp" icon="logo-whatsapp" variant="secondary" size="sm" onPress={() => void openLink(`https://wa.me/${intlPhone(open.phone)}`)} />
              ) : null}
            </View>
            {!open.email && !open.phone ? (
              <View style={styles.row}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.textTertiary} />
                <Text style={styles.meta} {...textScale.dense}>
                  Gönderen iletişim bilgisi bırakmamış.
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
}

/** İletişim alanının kanalları — kartta dolu/boş ikon ızgarası. */
const CHANNELS: { key: keyof ContactSection; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "phone", label: "Telefon", icon: "call" },
  { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp" },
  { key: "email", label: "E-posta", icon: "mail" },
  { key: "map_embed_url", label: "Harita", icon: "map" },
  { key: "instagram_url", label: "Instagram", icon: "logo-instagram" },
  { key: "facebook_url", label: "Facebook", icon: "logo-facebook" },
  { key: "youtube_url", label: "YouTube", icon: "logo-youtube" },
  { key: "tiktok_url", label: "TikTok", icon: "logo-tiktok" },
];

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  muted: { opacity: 0.7 },
  sectionCard: { gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  kicker: { ...type.overline, color: colors.textTertiary },
  cardTitle: { ...type.h4, color: colors.textPrimary },
  cardMeta: { ...type.caption, color: colors.textTertiary },
  channels: { flexDirection: "row", gap: space.xs },
  channel: { flex: 1, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  channelOn: { backgroundColor: colors.brandDim },
  reqCard: { flexDirection: "row", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border, overflow: "hidden" },
  reqUnread: { borderColor: colors.brand },
  reqStripe: { position: "absolute", left: 0, top: space.md, bottom: space.md, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  reqTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  reqName: { ...type.label, color: colors.textSecondary, flex: 1 },
  reqNameUnread: { ...type.h4, color: colors.textPrimary },
  reqSubject: { ...type.labelSm, color: colors.textPrimary },
  reqTime: { ...type.micro, color: colors.textTertiary, flexShrink: 1 },
  reqFoot: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 2 },
  footer: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  grow: { flexGrow: 1 },
  detail: { gap: space.md },
  meta: { ...type.caption, color: colors.textTertiary },
  subject: { ...type.h4, color: colors.textPrimary },
  message: { ...type.body, color: colors.textPrimary },
  contacts: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
