/**
 * Rehber → KİŞİLERİM sekmesi: kişisel kişi / cari kartları (manuel kayıtlar)
 * ve üyelere eklenmiş kişisel notlar. Kayıtlar yalnız sahibine görünür.
 *
 * Liste tek seferde gelir (en çok 3000); arama, süzgeç ve sıralama cihazda.
 * Manuel kişiye dokununca alt sayfada kişi kartı açılır (ara, WhatsApp, SMS,
 * e-posta, kopyala, düzenle, favori, sil). Telefonu bir üyeyle eşleşirse
 * kartta ipucu çıkar (users.view yetkisi olanlarda).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, InfoLine, OptionSheet, Panel, RecordCard, useAdminMutation, type BadgeSpec } from "@/components/admin";
import { Avatar, Badge, BottomSheet, Button, Chip, ChipGroup, Touchable } from "@/components/ui";
import { formatDate, timeAgo } from "@/lib/admin/format";
import {
  contactsCsv,
  contactsVcard,
  digitsOf,
  exportFileName,
  listDirectory,
  MEMBER_SORTS,
  prettyPhone,
  updateContact,
  type ExportRow,
  type MemberSort,
  type PersonalContact,
} from "@/lib/api/admin/contacts";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { shareCsv, shareVcard } from "../sheets/shareFile";
import { ContactButtons } from "./ContactButtons";
import { ContactFormSheet } from "./ContactFormSheet";
import type { ContactActions } from "./useContactActions";

type Filter = "all" | "manual" | "members" | "favorites";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "manual", label: "Manuel kayıt" },
  { key: "members", label: "Üye notları" },
  { key: "favorites", label: "Favoriler" },
];

const lower = (s: string) => s.toLocaleLowerCase("tr-TR");

const matches = (c: PersonalContact, q: string) => {
  if (!q) return true;
  const needle = lower(q);
  const digits = digitsOf(q);
  const hay = lower([c.name, c.email, c.city, c.company, c.title, c.note, ...(c.tags || [])].filter(Boolean).join(" "));
  return hay.includes(needle) || (digits.length >= 4 && digitsOf(c.phone).includes(digits.slice(-7)));
};

const compare = (sort: MemberSort) => (a: PersonalContact, b: PersonalContact) => {
  if (sort === "name" || sort === "name_desc") {
    const cmp = (a.name || "").localeCompare(b.name || "", "tr", { sensitivity: "base" });
    return sort === "name" ? cmp : -cmp;
  }
  const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
  const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
  return sort === "oldest" ? ta - tb : tb - ta;
};

export interface MyContactsTabHandle {
  exportAs: (kind: "csv" | "vcf" | "phones" | "emails") => Promise<void>;
  create: () => void;
}

export const MyContactsTab = forwardRef<
  MyContactsTabHandle,
  { actions: ContactActions; query: UseQueryResult<{ items: PersonalContact[] }>; memberAccess: boolean }
>(function MyContactsTab({ actions, query, memberAccess }, ref) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<MemberSort>("name");
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<PersonalContact | "new" | null>(null);

  const all = useMemo(() => query.data?.items ?? [], [query.data]);
  const allTags = useMemo(() => [...new Set(all.flatMap((c) => c.tags || []))].sort((a, b) => a.localeCompare(b, "tr")), [all]);

  const rows = useMemo(() => {
    const list = all.filter((c) => {
      if (filter === "manual" && c.member_user_id) return false;
      if (filter === "members" && !c.member_user_id) return false;
      if (filter === "favorites" && !c.favorite) return false;
      if (tag && !(c.tags || []).includes(tag)) return false;
      return matches(c, q);
    });
    return [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite) || compare(sort)(a, b));
  }, [all, filter, tag, q, sort]);

  const selected = all.find((c) => c.id === selectedId) ?? null;

  useImperativeHandle(ref, () => ({
    create: () => setEditing("new"),
    exportAs: async (kind) => {
      const list: ExportRow[] = rows.map((c) => ({
        name: c.name,
        username: null,
        categories: [c.member_user_id ? "uye" : "manual"],
        phone: c.phone,
        email: c.email,
        city: c.city,
        org: c.company,
        status: null,
        createdAt: c.createdAt,
        note: c.note,
      }));
      const name = `${exportFileName("rehber-kisilerim")}-${new Date().toISOString().slice(0, 10)}`;
      if (kind === "csv") await shareCsv(name, contactsCsv(list));
      if (kind === "vcf") await shareVcard(name, contactsVcard(list));
      if (kind === "phones") {
        const phones = [...new Set(list.map((r) => prettyPhone(r.phone)).filter(Boolean))];
        await actions.copy(phones.join("\n"), `${phones.length} telefon numarası kopyalandı.`);
      }
      if (kind === "emails") {
        const emails = [...new Set(list.map((r) => r.email).filter(Boolean))];
        await actions.copy(emails.join(", "), `${emails.length} e-posta adresi kopyalandı.`);
      }
    },
  }));

  const countOf = (key: Filter) =>
    key === "all" ? all.length : key === "manual" ? all.filter((c) => !c.member_user_id).length : key === "members" ? all.filter((c) => c.member_user_id).length : all.filter((c) => c.favorite).length;

  const open = (c: PersonalContact) => {
    if (c.member_user_id) router.push(`/yonetim/araclar/rehber/uye/${c.member_user_id}` as never);
    else setSelectedId(c.id);
  };

  const header = (
    <View style={styles.extra}>
      <ChipGroup scrollable contentPadding={0}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} count={countOf(f.key)} size="sm" selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ChipGroup>
      <ChipGroup scrollable contentPadding={0}>
        <Chip label={MEMBER_SORTS.find((s) => s.key === sort)?.label ?? "Sıralama"} icon="swap-vertical" size="sm" onPress={() => setSortOpen(true)} />
        {allTags.map((t) => (
          <Chip key={t} label={t} icon="pricetag-outline" size="sm" selected={tag === t} onPress={() => setTag(tag === t ? null : t)} />
        ))}
      </ChipGroup>
    </View>
  );

  return (
    <>
      <AdminList<PersonalContact>
        data={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Ad, telefon, e-posta, kurum, etiket"
        extraHeader={header}
        summary={`${rows.length} / ${all.length} kayıt`}
        emptyIcon="person-add-outline"
        emptyTitle={q || tag ? "Aramaya uyan kişi yok" : filter === "favorites" ? "Henüz favori yok" : "Kişi kaydı yok"}
        emptyBody={filter === "favorites" ? "Kişi kartındaki yıldızla favorilere ekleyebilirsin." : "Hakem, sponsor, saha yetkilisi gibi kişileri ekle."}
        emptyAction={!q && filter !== "favorites" ? { label: "Yeni kişi", onPress: () => setEditing("new") } : undefined}
        keyExtractor={(c) => String(c.id)}
        renderItem={({ item }) => <ContactRow contact={item} actions={actions} onPress={() => open(item)} />}
      />

      <OptionSheet<MemberSort>
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        title="Sıralama"
        options={MEMBER_SORTS.map((s) => ({ value: s.key, label: s.label }))}
        value={sort}
        onSelect={(v) => v && setSort(v as MemberSort)}
      />

      <ContactDetailSheet
        contact={selected}
        onClose={() => setSelectedId(null)}
        actions={actions}
        memberAccess={memberAccess}
        onEdit={(c) => {
          setSelectedId(null);
          setTimeout(() => setEditing(c), 250);
        }}
      />

      <ContactFormSheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        contact={editing && editing !== "new" ? editing : null}
        knownTags={allTags}
        onSaved={(item) => {
          setEditing(null);
          if (!item.member_user_id) setSelectedId(item.id);
        }}
      />
    </>
  );
});

/** Kişi kartı: favori halkalı avatar, ad, unvan · kurum, etiketler; sağda Ara / WhatsApp. */
const ContactRow = React.memo(function ContactRow({ contact, actions, onPress }: { contact: PersonalContact; actions: ContactActions; onPress: () => void }) {
  const sub = contact.member_user_id
    ? "Üyeye eklenmiş kişisel not"
    : [contact.title, contact.company].filter(Boolean).join(" · ") || prettyPhone(contact.phone) || contact.email || null;
  const tags = (contact.tags || []).slice(0, 3);
  return (
    <Touchable feedback="card" onPress={onPress} style={rowStyles.card} accessibilityRole="button" accessibilityLabel={[contact.name, sub, contact.city, contact.favorite ? "favori" : null].filter(Boolean).join(", ")}>
      <View>
        <Avatar name={contact.name} size={44} ring={contact.favorite ? "brand" : "none"} />
        {contact.favorite ? (
          <View style={rowStyles.star}>
            <Ionicons name="star" size={10} color={colors.onDark} />
          </View>
        ) : null}
      </View>
      <View style={rowStyles.body}>
        <Text style={rowStyles.name} numberOfLines={1} {...textScale.dense}>
          {contact.name}
        </Text>
        {sub ? (
          <Text style={rowStyles.sub} numberOfLines={1} {...textScale.dense}>
            {sub}
          </Text>
        ) : null}
        <View style={rowStyles.tags}>
          {contact.member_user_id ? <Badge label="Üye" tone="info" icon="person-outline" size="xs" /> : null}
          {contact.city ? (
            <View style={rowStyles.city}>
              <Ionicons name="location-outline" size={11} color={colors.textTertiary} />
              <Text style={rowStyles.cityText} {...textScale.badge}>
                {contact.city}
              </Text>
            </View>
          ) : null}
          {tags.map((t) => (
            <Text key={t} style={rowStyles.tag} numberOfLines={1} {...textScale.badge}>
              #{t}
            </Text>
          ))}
        </View>
      </View>
      {contact.member_user_id ? (
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      ) : (
        <ContactButtons name={contact.name} phone={contact.phone} email={contact.email} actions={actions} only={["tel", "wa"]} />
      )}
    </Touchable>
  );
});

const rowStyles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1 },
  star: { position: "absolute", right: -2, bottom: -2, width: 18, height: 18, borderRadius: radius.pill, backgroundColor: colors.warn, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface1 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.h4, color: colors.textPrimary },
  sub: { ...type.bodySm, color: colors.textSecondary },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs, marginTop: space.xxs },
  city: { flexDirection: "row", alignItems: "center", gap: 2 },
  cityText: { ...type.caption, color: colors.textTertiary },
  tag: { ...type.labelXs, color: colors.brandAccent },
});

function ContactDetailSheet({
  contact,
  onClose,
  actions,
  memberAccess,
  onEdit,
}: {
  contact: PersonalContact | null;
  onClose: () => void;
  actions: ContactActions;
  memberAccess: boolean;
  onEdit: (c: PersonalContact) => void;
}) {
  const router = useRouter();
  const digits = digitsOf(contact?.phone);
  // Manuel kişinin telefonu bir üyeyle eşleşiyorsa ipucu (web "dupe").
  const dupe = useQuery({
    queryKey: ["admin", "contacts", "dupe", digits],
    queryFn: () => listDirectory({ q: digits, page_size: 1 }),
    enabled: Boolean(contact && memberAccess && digits.length >= 7),
    staleTime: 60_000,
    retry: false,
  });
  const match = dupe.data?.items?.[0];

  const fav = useAdminMutation((c: PersonalContact) => updateContact(c.id, { favorite: !c.favorite }), {
    success: (_r, c) => (c.favorite ? "Favorilerden çıkarıldı." : "Favorilere eklendi."),
    invalidate: [["admin", "contacts"]],
  });

  return (
    <BottomSheet visible={contact != null} onClose={onClose} title={contact?.name ?? "Kişi"} snap="full">
      {contact ? (
        <View style={styles.sheet}>
          <View style={styles.hero}>
            <Avatar name={contact.name} size={64} />
            <Text style={styles.heroName} {...textScale.dense}>
              {contact.name}
            </Text>
            {contact.title || contact.company ? (
              <Text style={styles.heroSub} {...textScale.dense}>
                {[contact.title, contact.company].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
            {contact.favorite ? <Badge label="Favori" tone="accent" icon="star" size="sm" /> : null}
            <ContactButtons name={contact.name} phone={contact.phone} email={contact.email} actions={actions} size="large" copyable />
          </View>

          <Panel title="BİLGİLER">
            {contact.phone ? <CopyLine label="Telefon" value={prettyPhone(contact.phone)} onCopy={() => actions.copy(contact.phone!, "Telefon kopyalandı.")} /> : null}
            {contact.email ? <CopyLine label="E-posta" value={contact.email} onCopy={() => actions.copy(contact.email!, "E-posta kopyalandı.")} /> : null}
            {contact.city ? <InfoLine label="Şehir" value={contact.city} /> : null}
            {contact.company ? <InfoLine label="Kurum" value={contact.company} /> : null}
            {contact.title ? <InfoLine label="Görevi" value={contact.title} /> : null}
            {contact.createdAt ? <InfoLine label="Eklenme" value={`${formatDate(contact.createdAt)} · ${timeAgo(contact.createdAt)}`} /> : null}
            {contact.tags?.length ? (
              <InfoLine
                label="Etiketler"
                value={
                  <View style={styles.tags}>
                    {contact.tags.map((t) => (
                      <Badge key={t} label={t} size="xs" />
                    ))}
                  </View>
                }
              />
            ) : null}
          </Panel>

          {contact.note ? (
            <Panel title="NOT">
              <Text style={styles.note} selectable {...textScale.long}>
                {contact.note}
              </Text>
            </Panel>
          ) : null}

          {match ? (
            <Touchable
              style={styles.dupe}
              onPress={() => {
                onClose();
                router.push(`/yonetim/araclar/rehber/uye/${match.id}` as never);
              }}
              accessibilityLabel={`${match.name} üye kartını aç`}
            >
              <Ionicons name="link-outline" size={16} color={colors.info} />
              <Text style={styles.dupeText} {...textScale.dense}>
                Bu numara siteye üye {match.name} (@{match.username}) ile eşleşiyor.
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
            </Touchable>
          ) : null}

          <View style={styles.footer}>
            <Button
              label={contact.favorite ? "Favorilerden çıkar" : "Favorilere ekle"}
              icon={contact.favorite ? "star" : "star-outline"}
              variant="secondary"
              onPress={() => fav.mutate(contact)}
              loading={fav.isPending}
              style={styles.flex}
            />
            <Button label="Düzenle" icon="create-outline" onPress={() => onEdit(contact)} style={styles.flex} />
          </View>
        </View>
      ) : (
        <View />
      )}
    </BottomSheet>
  );
}

export function CopyLine({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <InfoLine
      label={label}
      value={
        <Touchable onPress={onCopy} style={styles.copyLine} accessibilityLabel={`${label} kopyala`} feedback="none">
          <Text style={styles.copyValue} selectable {...textScale.dense}>
            {value}
          </Text>
          <Ionicons name="copy-outline" size={14} color={colors.textTertiary} />
        </Touchable>
      }
    />
  );
}

const styles = StyleSheet.create({
  extra: { gap: space.sm },
  sheet: { gap: space.md, paddingBottom: space.lg },
  hero: { alignItems: "center", gap: space.s, paddingVertical: space.sm },
  heroName: { ...type.h1, color: colors.textPrimary, textAlign: "center" },
  heroSub: { ...type.bodySm, color: colors.textSecondary, textAlign: "center" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, flex: 1 },
  note: { ...type.body, color: colors.textPrimary },
  dupe: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, backgroundColor: colors.infoDim, borderRadius: radius.md },
  dupeText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  footer: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  copyLine: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.xs },
  copyValue: { ...type.bodySm, color: colors.textPrimary, flexShrink: 1 },
});
