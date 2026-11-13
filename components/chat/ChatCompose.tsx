/**
 * MESAJ OLUŞTUR — kime yazılacağını seçme ekranı.
 *
 * Sekmeler: Tümü / Yönetim / Takım / Yöneticiler / Takım arkadaşları / Grup kur.
 * Üye rehberinde yalnız takım arkadaşları gelir (sunucu kuralı). Yönetim
 * modunda "Yönetim ekibi" sekmesi diğer yönetim hesaplarını listeler; ekip
 * sohbeti birebir açılır ve sesli aranabilir.
 * Rehber sunucudan (GET /api/chat/directory?q=) gelir; seçim yapılınca
 * konuşma açılır (varsa mevcut olan döner) ve sohbet ekranına geçilir.
 *
 * GECE DİLİ (ikinci tur): "Tümü"nde üstte iki kısayol karosu (Yeni grup ·
 * Yönetime yaz). Rehber bölümleri mor işaretli başlık + tek kart içinde
 * girintili ayraçlı satırlardır; takım ve yönetim degrade karolu avatarla
 * çizilir. Grup kurarken seçilenler üstte yatay "seçilenler" şeridinde
 * avatar olarak birikir (dokununca çıkar); seçili satır mor zemin + şerit.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar, Button, Chip, ChipGroup, EmptyState, ErrorState, Input, ListRow, SkeletonListRow, Touchable, WaHeader, errorMessage } from "@/components/chat/kit";
import { InboxAvatar } from "@/components/chat/AvatarArt";
import { IconTile, Reveal, useToast, type IconTileTone } from "@/components/ui";
import { LinearGradient } from "expo-linear-gradient";
import { adminChat, getDirectory, openConversation, updateGroup, type ChatUser, type OpenConversationInput } from "@/lib/api/chat";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors } from "@/lib/chatPalette";
import { glowStyle, hairline, layout, palette, radius, space, textScale, type } from "@/theme";

type CardPosition = "single" | "first" | "middle" | "last";

type Tab = "all" | "staff" | "management" | "team" | "managers" | "players" | "group";

const ALL_TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "all", label: "Tümü", icon: "apps" },
  { key: "staff", label: "Yönetim ekibi", icon: "briefcase-outline" },
  { key: "management", label: "Yönetim", icon: "shield-checkmark" },
  { key: "team", label: "Takım", icon: "people" },
  { key: "managers", label: "Yöneticiler", icon: "briefcase" },
  { key: "players", label: "Oyuncular", icon: "shirt" },
  { key: "group", label: "Grup kur", icon: "people-circle" },
];

type Row =
  | { kind: "section"; key: string; title: string }
  | { kind: "management"; key: string; name: string; subtitle: string }
  | { kind: "team"; key: string; teamId: number; name: string; subtitle: string; avatar: string | null }
  | { kind: "user"; key: string; user: ChatUser };

export interface ChatComposeProps {
  admin?: boolean;
  /** Açılışta seçili sekme ("Yeni grup" kısayolu doğrudan grup kurmaya iner). */
  initialTab?: "group";
}

export function ChatCompose({ admin = false, initialTab }: ChatComposeProps) {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialTab ?? "all");
  const [description, setDescription] = useState("");
  const [onlyAdminsSend, setOnlyAdminsSend] = useState(false);
  const [onlyAdminsEdit, setOnlyAdminsEdit] = useState(false);
  // Yönetim hesabının KİŞİSEL rehberi (/api/chat/directory): yönetim ekibi, takım
  // başkanları, oyuncular ve (aramayla) üyeler — masaüstü "Yeni sohbet" ile aynı.
  const staffSelf = !admin && auth.isManagement;
  const TABS = admin
    ? ALL_TABS.filter((item) => item.key !== "management")
    : staffSelf
      ? ALL_TABS.filter((item) => item.key !== "management" && item.key !== "team")
      : ALL_TABS.filter((item) => item.key !== "staff").map((item) => (item.key === "players" ? { ...item, label: "Takım arkadaşları" } : item));
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const basePath = admin ? "/yonetim/sohbet" : "/sohbet";
  const query = useQuery({
    queryKey: [...queryKeys.chatDirectory(debounced), admin ? "admin" : "member"] as const,
    queryFn: () => (admin ? adminChat.getDirectory(debounced) : getDirectory(debounced)),
    enabled: Boolean(auth.user),
    staleTime: 15_000,
    retry: false,
  });

  const open = useMutation({
    mutationFn: (input: OpenConversationInput) => (admin ? adminChat.openConversation(input) : openConversation(input)),
    onSuccess: ({ conversation }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
      if (admin) void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
      if (conversation.skipped_members?.length) {
        toast.show({ message: `Mesaj tercihi nedeniyle gruba eklenemeyenler: ${conversation.skipped_members.map((item) => item.name).join(", ")}`, tone: "warn" });
      }
      // Katılımcısı olduğum sohbet (birebir, kurduğum grup) kişisel sohbettir:
      // tepki, yıldız, sabitleme gibi özelliklerin tamamı üye odasındadır.
      const mine = conversation.participants.some((item) => item.is_me);
      const go = () => router.replace((admin && !mine ? `/yonetim/sohbet/${conversation.id}` : `/sohbet/${conversation.id}`) as never);
      // Grup kurulurken girilen açıklama ve izinler (masaüstü "Yeni grup" ile aynı alanlar).
      const extra = conversation.type === "group" && mine
        ? { ...(description.trim() ? { description: description.trim() } : {}), ...(onlyAdminsSend ? { only_admins_send: true } : {}), ...(onlyAdminsEdit ? { only_admins_edit: true } : {}) }
        : {};
      if (Object.keys(extra).length) void updateGroup(conversation.id, extra).catch(() => {}).finally(go);
      else go();
    },
    onError: (error) => toast.show({ message: errorMessage(error), tone: "danger" }),
  });

  const people = useMemo(() => {
    const map = new Map<number, ChatUser>();
    [...(query.data?.staff ?? []), ...(query.data?.managers ?? []), ...(query.data?.players ?? []), ...(query.data?.members ?? [])].forEach((user) => {
      if (!map.has(user.user_id)) map.set(user.user_id, user);
    });
    return [...map.values()];
  }, [query.data]);

  const rows = useMemo<Row[]>(() => {
    const data = query.data;
    if (!data) return [];
    const out: Row[] = [];
    if (tab === "group") {
      people.forEach((user) => out.push({ kind: "user", key: `u-${user.user_id}`, user }));
      return out;
    }
    if ((tab === "all" || tab === "staff") && data.staff?.length) {
      out.push({ kind: "section", key: "s-staff", title: "Yönetim ekibi" });
      data.staff.forEach((user) => out.push({ kind: "user", key: `s-${user.user_id}`, user }));
    }
    if ((tab === "all" || tab === "management") && data.management) {
      out.push({ kind: "section", key: "s-management", title: "Yönetim" });
      out.push({ kind: "management", key: "management", name: data.management.name, subtitle: data.management.subtitle });
    }
    if ((tab === "all" || tab === "team") && data.teams.length) {
      out.push({ kind: "section", key: "s-team", title: admin ? "Takım grupları" : "Takım grubum" });
      data.teams.forEach((team) =>
        out.push({ kind: "team", key: `t-${team.team_id}`, teamId: team.team_id, name: team.name, subtitle: team.subtitle, avatar: team.avatar }),
      );
    }
    if ((tab === "all" || tab === "managers") && data.managers.length) {
      out.push({ kind: "section", key: "s-managers", title: "Takım yöneticileri" });
      data.managers.forEach((user) => out.push({ kind: "user", key: `m-${user.user_id}`, user }));
    }
    if ((tab === "all" || tab === "players") && data.players.length) {
      out.push({ kind: "section", key: "s-players", title: admin || staffSelf ? "Oyuncular" : "Takım arkadaşlarım" });
      data.players.forEach((user) => out.push({ kind: "user", key: `p-${user.user_id}`, user }));
    }
    if (tab === "all" && data.members?.length) {
      out.push({ kind: "section", key: "s-members", title: "Üyeler" });
      data.members.forEach((user) => out.push({ kind: "user", key: `u-${user.user_id}`, user }));
    }
    return out;
  }, [admin, people, query.data, staffSelf, tab]);

  const toggle = useCallback((id: number) => {
    setSelected((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
  }, []);

  const createGroup = useCallback(() => {
    if (!title.trim() || !selected.length) return;
    open.mutate({ type: "group", title: title.trim(), user_ids: selected });
  }, [open, selected, title]);

  const renderItem = useCallback(
    ({ item, index }: { item: Row; index: number }) => {
      if (item.kind === "section") {
        return (
          <View style={styles.sectionRow} accessibilityRole="header">
            <View style={styles.sectionMark} />
            <Text style={styles.section} {...textScale.dense}>{item.title.toLocaleUpperCase("tr-TR")}</Text>
          </View>
        );
      }
      // Ardışık satırlar tek kart: ilk / son satır köşeleri yuvarlar.
      const prev = rows[index - 1];
      const next = rows[index + 1];
      const joinedPrev = Boolean(prev && prev.kind !== "section");
      const joinedNext = Boolean(next && next.kind !== "section");
      const position: CardPosition = joinedPrev ? (joinedNext ? "middle" : "last") : joinedNext ? "first" : "single";
      if (item.kind === "management") {
        return (
          <DirectoryRow
            name={item.name}
            subtitle={item.subtitle}
            kind="management"
            position={position}
            icon="shield-checkmark"
            onPress={() => open.mutate({ type: "management" })}
            disabled={open.isPending}
          />
        );
      }
      if (item.kind === "team") {
        return (
          <DirectoryRow
            name={item.name}
            subtitle={item.subtitle}
            avatar={item.avatar}
            kind="team"
            position={position}
            icon="people"
            onPress={() => open.mutate({ type: "team", team_id: item.teamId })}
            disabled={open.isPending}
          />
        );
      }
      const picked = selected.includes(item.user.user_id);
      return (
        <DirectoryRow
          name={item.user.name}
          subtitle={item.user.subtitle}
          avatar={item.user.avatar}
          position={position}
          selected={tab === "group" ? picked : undefined}
          onPress={() =>
            tab === "group"
              ? toggle(item.user.user_id)
              : open.mutate(admin && item.user.kind !== "staff" ? { type: "member", user_id: item.user.user_id } : { type: "direct", user_id: item.user.user_id })
          }
          disabled={open.isPending}
        />
      );
    },
    [admin, open, rows, selected, tab, toggle],
  );

  if (!auth.user) return <Redirect href="/giris" />;

  const groupMode = tab === "group";
  const canCreate = groupMode && title.trim().length >= 2 && selected.length > 0 && !open.isPending;

  // Grup formu listenin başında kayar: üye listesine yer kalır, klavye açıkken de erişilir.
  const pickedPeople = selected.map((id) => people.find((user) => user.user_id === id)).filter(Boolean) as ChatUser[];
  const groupForm = (
    <View style={styles.groupForm}>
          {/* Seçilenler şeridi: dokununca kişi seçimden çıkar. */}
          <View style={styles.pickedCard}>
            <View style={styles.pickedHead}>
              <Text style={styles.pickedTitle} {...textScale.badge}>SEÇİLENLER</Text>
              <View style={styles.pickedCount}>
                <Text style={styles.pickedCountText} {...textScale.badge}>{selected.length}</Text>
              </View>
            </View>
            {pickedPeople.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickedTrack}>
                {pickedPeople.map((user) => (
                  <Touchable key={user.user_id} feedback="chip" haptic="selection" onPress={() => toggle(user.user_id)} accessibilityRole="button" accessibilityLabel={`${user.name} seçimini kaldır`} style={styles.pickedItem}>
                    <View>
                      <InboxAvatar type="person" title={user.name} image={user.avatar} size={44} ring />
                      <View style={styles.pickedRemove}>
                        <Ionicons name="close" size={10} color={colors.textPrimary} />
                      </View>
                    </View>
                    <Text style={styles.pickedName} numberOfLines={1} {...textScale.badge}>{user.name.split(" ")[0]}</Text>
                  </Touchable>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.pickedEmpty} {...textScale.dense}>Aşağıdan en az bir kişi seç.</Text>
            )}
          </View>
          <Input
            label="Grup adı"
            value={title}
            onChangeText={setTitle}
            placeholder="Örn. Antrenman planı"
            maxLength={120}
            hint={`${selected.length} üye seçildi`}
          />
          <Input label="Açıklama (isteğe bağlı)" value={description} onChangeText={setDescription} placeholder="Grubun amacı" maxLength={2000} size="sm" />
          <ListRow title="Yalnız yöneticiler mesaj göndersin" subtitle="Duyuru grubu: üyeler yalnız okur" toggle={{ value: onlyAdminsSend, onValueChange: setOnlyAdminsSend }} position="first" />
          <ListRow title="Grup bilgisini yalnız yöneticiler düzenlesin" subtitle="Ad, fotoğraf, üye ekleme ve sabitleme" toggle={{ value: onlyAdminsEdit, onValueChange: setOnlyAdminsEdit }} position="last" />
        </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <WaHeader
        title={groupMode ? "Yeni grup" : "Yeni sohbet"}
        subtitle={admin ? "ElitLig Yönetimi adına: kime yazacaksın?" : "Kime yazmak istiyorsun?"}
        back
        bottom={
          <View style={styles.headerBottom}>
            <ChipGroup>
              {TABS.map((item) => (
                <Chip key={item.key} label={item.label} icon={item.icon} selected={tab === item.key} onPress={() => setTab(item.key)} />
              ))}
            </ChipGroup>
            <View style={styles.searchWrap}>
              <Input
                value={search}
                onChangeText={setSearch}
                placeholder={admin ? "Yönetici, takım veya oyuncu ara" : staffSelf ? "Kişi ara (üyeler için en az 2 harf)" : "Yönetim, takım veya takım arkadaşı ara"}
                variant="search"
                size="sm"
                leadingIcon="search"
                accessibilityLabel="Rehberde ara"
              />
            </View>
          </View>
        }
      />

      {!groupMode && tab === "all" && !debounced ? (
        <Reveal distance={10} style={styles.shortcuts}>
          <Shortcut icon="people-circle" tone="cyan" title="Yeni grup" body="Kişileri seç, adını ver" onPress={() => setTab("group")} />
          {query.data?.management && !admin ? (
            <Shortcut icon="shield-checkmark" tone="violet" title="Yönetime yaz" body="Resmî destek hattı" onPress={() => open.mutate({ type: "management" })} />
          ) : (
            <Shortcut icon="people" tone="mint" title={admin ? "Takım grupları" : "Takımım"} body="Takım grubunu aç" onPress={() => setTab("team")} />
          )}
        </Reveal>
      ) : null}

      {query.isLoading ? (
        <View style={styles.skeleton}>
          <SkeletonListRow count={8} avatar />
        </View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={16}
          ListHeaderComponent={groupMode ? groupForm : null}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={debounced ? "Kimse bulunamadı" : groupMode ? "Gruba eklenecek üye yok" : "Rehber boş"}
              body={
                debounced
                  ? "Adı farklı yazmayı dene."
                  : admin || staffSelf
                    ? "Yönetim ekibi, takım yöneticileri ve hesabı bağlı oyuncular burada listelenir."
                    : "Yalnızca kendi takım arkadaşlarınla ve yönetimle mesajlaşabilirsin."
              }
            />
          }
        />
      )}

      {groupMode ? (
        <View style={styles.footer}>
          <Button label="Grubu kur" icon="people-circle" onPress={createGroup} disabled={!canCreate} loading={open.isPending} fullWidth />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/** Kısayol karosu: degrade ikon + başlık + kısa açıklama. */
function Shortcut({ icon, tone, title, body, onPress }: { icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone; title: string; body: string; onPress: () => void }) {
  return (
    <Touchable feedback="card" haptic="selection" onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${body}`} style={styles.shortcut}>
      <IconTile icon={icon} tone={tone} size={36} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>{title}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1} {...textScale.dense}>{body}</Text>
      </View>
    </Touchable>
  );
}

const DirectoryRow = memo(function DirectoryRow({
  name,
  subtitle,
  avatar,
  icon,
  kind,
  position = "single",
  selected,
  disabled,
  onPress,
}: {
  name: string;
  subtitle: string;
  avatar?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Avatar türü: yönetim / takım degrade karolu çizilir. */
  kind?: "management" | "team";
  position?: CardPosition;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const corners = position === "single" ? styles.cardSingle : position === "first" ? styles.cardFirst : position === "last" ? styles.cardLast : null;
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      style={[styles.row, corners, selected ? styles.rowSelected : null]}
    >
      {selected ? <View style={styles.selectedStrip} /> : null}
      {position === "middle" || position === "last" ? <View style={styles.divider} /> : null}
      {icon && !avatar ? (
        <InboxAvatar type={kind ?? "group"} title={name} size={40} />
      ) : (
        <InboxAvatar type={kind ?? "person"} title={name} image={avatar ?? null} size={40} />
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {name}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1} {...textScale.dense}>
          {subtitle}
        </Text>
      </View>
      {selected === undefined ? (
        <View style={styles.go}>
          <Ionicons name="chatbubble-outline" size={14} color={colors.brandAccent} />
        </View>
      ) : selected ? (
        <View style={[styles.check, glowStyle(colors.glow, 1)]}>
          <LinearGradient colors={colors.gradientBrand} start={{ x: 1, y: 0.5 }} end={{ x: 0, y: 0.5 }} style={[StyleSheet.absoluteFill, styles.checkFill]} />
          <Ionicons name="checkmark" size={14} color={palette.textOnBrand} />
        </View>
      ) : (
        <View style={[styles.check, styles.checkIdle]} />
      )}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBottom: { gap: space.sm, paddingBottom: space.sm },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: layout.screenPadding, paddingTop: space.xl, paddingBottom: space.sm },
  sectionMark: { width: 3, height: 12, borderRadius: radius.pill, backgroundColor: colors.brand },
  section: { ...type.overline, color: colors.textSecondary },
  shortcuts: { flexDirection: "row", gap: space.sm, paddingHorizontal: layout.screenPadding, paddingTop: space.md },
  shortcut: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  pickedCard: { padding: space.md, gap: space.sm, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border, marginBottom: space.sm },
  pickedHead: { flexDirection: "row", alignItems: "center", gap: space.s },
  pickedTitle: { ...type.overline, color: colors.textSecondary },
  pickedCount: { minWidth: 20, height: 18, paddingHorizontal: space.xs, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  pickedCountText: { ...type.nano, color: colors.brandAccent },
  pickedTrack: { gap: space.sm },
  pickedItem: { width: 58, alignItems: "center", gap: space.xs },
  pickedRemove: { position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3, borderWidth: 2, borderColor: colors.surface1 },
  pickedName: { ...type.caption, color: colors.textSecondary },
  pickedEmpty: { ...type.bodySm, color: colors.textTertiary },
  searchWrap: { paddingHorizontal: layout.screenPadding },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  list: { flexGrow: 1, paddingBottom: space.huge },
  groupForm: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, gap: space.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginHorizontal: layout.screenPadding,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    minHeight: 62,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  cardSingle: { borderRadius: radius.xl },
  cardFirst: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  cardLast: { borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  divider: { position: "absolute", top: 0, right: 0, left: space.md + 46 + space.md, height: hairline, backgroundColor: colors.border },
  rowSelected: { backgroundColor: colors.brandDim },
  selectedStrip: { position: "absolute", left: 0, top: space.sm, bottom: space.sm, width: 3, borderTopRightRadius: radius.xs, borderBottomRightRadius: radius.xs, backgroundColor: colors.brand },
  go: { width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  check: { width: 24, height: 24, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  checkFill: { borderRadius: radius.pill },
  checkIdle: { borderWidth: 1.5, borderColor: colors.borderStrong },
  rowBody: { flex: 1, minWidth: 0, gap: space.xxs },
  rowTitle: { ...type.h3, color: colors.textPrimary },
  rowSubtitle: { ...type.caption, color: colors.textSecondary },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.glassLine,
    backgroundColor: colors.glass,
  },
});
