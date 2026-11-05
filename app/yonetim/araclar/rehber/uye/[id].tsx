/**
 * REHBER → ÜYE KARTI (web Contacts.js seçili üye ayrıntısı)
 *
 * Üye kaydı canlı gelir (GET /api/tools/contacts/directory/:id; users.view
 * + il kapsamı). Üstte kimlik ve tek dokunuşla ara / WhatsApp / SMS /
 * e-posta / uygulama içi mesaj; altta bilgiler (dokununca kopyalanır).
 * Kişisel not, etiket ve favori üyeye bağlı kişisel kartta tutulur
 * (POST/PATCH/DELETE /api/tools/contacts, member_user_id).
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, InfoLine, Panel, useAdminMutation } from "@/components/admin";
import { ContactButtons } from "@/components/admin/contacts/ContactButtons";
import { ContactFormSheet } from "@/components/admin/contacts/ContactFormSheet";
import { CopyLine } from "@/components/admin/contacts/MyContactsTab";
import { useContactActions } from "@/components/admin/contacts/useContactActions";
import { Avatar, Badge, Button, ErrorState, SkeletonCard, SkeletonListRow } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDate, timeAgo } from "@/lib/admin/format";
import {
  CATEGORY_LABELS,
  createContact,
  getDirectoryMember,
  listContacts,
  memberTeam,
  prettyPhone,
  STATUS_LABELS,
  updateContact,
  type MemberStatus,
} from "@/lib/api/admin/contacts";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

export default function MemberCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const memberId = Number(id);
  const router = useRouter();
  const auth = useAuth();
  const actions = useContactActions();
  const [editing, setEditing] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "contacts", "member", memberId],
    queryFn: () => getDirectoryMember(memberId),
    enabled: Number.isFinite(memberId),
  });
  const contacts = useQuery({ queryKey: ["admin", "contacts", "mine"], queryFn: listContacts });
  const card = useMemo(() => (contacts.data?.items ?? []).find((c) => Number(c.member_user_id) === memberId) ?? null, [contacts.data, memberId]);
  const allTags = useMemo(() => [...new Set((contacts.data?.items ?? []).flatMap((c) => c.tags || []))], [contacts.data]);
  const m = query.data?.item;
  const team = memberTeam(m);

  const fav = useAdminMutation(
    () => (card ? updateContact(card.id, { favorite: !card.favorite }) : createContact({ name: m!.name, member_user_id: m!.id, favorite: true })),
    { success: () => (card?.favorite ? "Favorilerden çıkarıldı." : "Favorilere eklendi."), invalidate: [["admin", "contacts"]] }
  );

  return (
    <AdminScreen title={m?.name ?? "Üye kartı"} subtitle="Rehber" onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      {query.isLoading ? (
        <>
          <SkeletonCard />
          <SkeletonListRow count={4} />
        </>
      ) : query.error || !m ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} variant="inline" />
      ) : (
        <>
          <View style={styles.hero}>
            <Avatar name={m.name} size={72} />
            <Text style={styles.name} {...textScale.dense}>
              {m.name}
            </Text>
            <Text style={styles.sub} {...textScale.dense}>
              @{m.username}
              {m.city ? ` · ${m.city}` : ""}
            </Text>
            <View style={styles.badges}>
              {team ? (
                <Badge label={`${team.name}${team.captain ? " · Başkan" : ""}`} tone={team.captain ? "brand" : "info"} icon="shield-half-outline" size="sm" />
              ) : null}
              {m.categories.map((c) => (
                <Badge key={c} label={CATEGORY_LABELS[c] ?? c} size="sm" />
              ))}
              {m.isNew ? <Badge label="Yeni" tone="win" size="sm" /> : null}
              {m.status && m.status !== "approved" ? <Badge label={STATUS_LABELS[m.status as MemberStatus] ?? m.status} tone="warn" size="sm" /> : null}
              {card?.favorite ? <Badge label="Favori" tone="accent" icon="star" size="sm" /> : null}
            </View>
            <ContactButtons
              name={m.name}
              phone={m.phone}
              email={m.email}
              userId={m.id}
              staff={m.categories.includes("yonetim")}
              actions={actions}
              size="large"
              copyable
            />
          </View>

          <Panel title="BİLGİLER">
            {m.phone ? <CopyLine label="Telefon" value={prettyPhone(m.phone)} onCopy={() => actions.copy(m.phone!, "Telefon kopyalandı.")} /> : null}
            {m.email ? <CopyLine label="E-posta" value={m.email} onCopy={() => actions.copy(m.email!, "E-posta kopyalandı.")} /> : null}
            <CopyLine label="Kullanıcı adı" value={`@${m.username}`} onCopy={() => actions.copy(m.username, "Kullanıcı adı kopyalandı.")} />
            {m.city ? <InfoLine label="Şehir" value={m.city} /> : null}
            {m.team?.name ? <InfoLine label="Takım (başkan)" value={m.team.name} /> : null}
            {m.player ? <InfoLine label="Oyuncu profili" value={`${m.player.name || `#${m.player.id}`}${m.player.team ? ` · ${m.player.team}` : ""}`} /> : null}
            {m.status ? <InfoLine label="Üyelik durumu" value={STATUS_LABELS[m.status as MemberStatus] ?? m.status} /> : null}
            {m.createdAt ? <InfoLine label="Kayıt tarihi" value={`${formatDate(m.createdAt)} · ${timeAgo(m.createdAt)}`} /> : null}
          </Panel>

          <Panel
            title="KİŞİSEL NOTUN"
            action={{ label: card ? "Düzenle" : "Not ekle", onPress: () => setEditing(true) }}
          >
            {card?.tags?.length ? (
              <View style={styles.tags}>
                {card.tags.map((t) => (
                  <Badge key={t} label={t} size="xs" />
                ))}
              </View>
            ) : null}
            <Text style={card?.note ? styles.note : styles.muted} selectable {...textScale.long}>
              {card?.note || "Bu üyeye yalnız senin göreceğin bir not, etiket ya da favori ekleyebilirsin."}
            </Text>
          </Panel>

          <View style={styles.footer}>
            <Button
              label={card?.favorite ? "Favorilerden çıkar" : "Favorilere ekle"}
              icon={card?.favorite ? "star" : "star-outline"}
              variant="secondary"
              onPress={() => fav.mutate(undefined)}
              loading={fav.isPending}
              style={styles.flex}
            />
            {team?.captain && m.team?.id ? (
              <Button
                label="Takım kartı"
                icon="shield-half-outline"
                variant="secondary"
                onPress={() => router.push(`/yonetim/araclar/rehber/takim/${m.team!.id}` as never)}
                style={styles.flex}
              />
            ) : null}
          </View>
          {hasAnyPermission(auth.user, ["users.view"]) ? (
            <Button
              label="Üye yönetiminde aç"
              icon="person-circle-outline"
              variant="ghost"
              onPress={() => router.push({ pathname: "/yonetim/uyeler", params: { q: m.username } } as never)}
            />
          ) : null}

          <ContactFormSheet
            visible={editing}
            onClose={() => setEditing(false)}
            contact={card}
            member={{ id: m.id, name: m.name }}
            knownTags={allTags}
            onSaved={() => setEditing(false)}
          />
        </>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space.s, paddingVertical: space.sm },
  name: { ...type.display, color: colors.textPrimary, textAlign: "center" },
  sub: { ...type.bodySm, color: colors.textSecondary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, justifyContent: "center", marginBottom: space.sm },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  note: { ...type.body, color: colors.textPrimary },
  muted: { ...type.bodySm, color: colors.textTertiary },
  footer: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
});
