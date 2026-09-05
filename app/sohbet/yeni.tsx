/**
 * MESAJ OLUŞTUR — kime yazılacağını seçme ekranı.
 *
 * Sekmeler: Tümü / Yönetim / Takım / Yöneticiler / Oyuncular / Grup kur.
 * Rehber sunucudan (GET /api/chat/directory?q=) gelir; seçim yapılınca
 * konuşma açılır (varsa mevcut olan döner) ve sohbet ekranına geçilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Avatar,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SectionHeader,
  SkeletonListRow,
  Touchable,
  errorMessage,
  useToast,
} from "@/components/ui";
import { getDirectory, openConversation, type ChatUser, type OpenConversationInput } from "@/lib/api/chat";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, space, textScale, type } from "@/theme";

type Tab = "all" | "management" | "team" | "managers" | "players" | "group";

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "all", label: "Tümü", icon: "apps" },
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

export default function ComposeScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: queryKeys.chatDirectory(debounced),
    queryFn: () => getDirectory(debounced),
    enabled: Boolean(auth.user),
    staleTime: 15_000,
    retry: false,
  });

  const open = useMutation({
    mutationFn: (input: OpenConversationInput) => openConversation(input),
    onSuccess: ({ conversation }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
      router.replace(`/sohbet/${conversation.id}` as never);
    },
    onError: (error) => toast.show({ message: errorMessage(error), tone: "danger" }),
  });

  const people = useMemo(() => {
    const map = new Map<number, ChatUser>();
    [...(query.data?.managers ?? []), ...(query.data?.players ?? [])].forEach((user) => {
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
    if ((tab === "all" || tab === "management") && data.management) {
      out.push({ kind: "section", key: "s-management", title: "Yönetim" });
      out.push({ kind: "management", key: "management", name: data.management.name, subtitle: data.management.subtitle });
    }
    if ((tab === "all" || tab === "team") && data.teams.length) {
      out.push({ kind: "section", key: "s-team", title: "Takım grubum" });
      data.teams.forEach((team) =>
        out.push({ kind: "team", key: `t-${team.team_id}`, teamId: team.team_id, name: team.name, subtitle: team.subtitle, avatar: team.avatar }),
      );
    }
    if ((tab === "all" || tab === "managers") && data.managers.length) {
      out.push({ kind: "section", key: "s-managers", title: "Takım yöneticileri" });
      data.managers.forEach((user) => out.push({ kind: "user", key: `m-${user.user_id}`, user }));
    }
    if ((tab === "all" || tab === "players") && data.players.length) {
      out.push({ kind: "section", key: "s-players", title: "Oyuncular" });
      data.players.forEach((user) => out.push({ kind: "user", key: `p-${user.user_id}`, user }));
    }
    return out;
  }, [people, query.data, tab]);

  const toggle = useCallback((id: number) => {
    setSelected((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
  }, []);

  const createGroup = useCallback(() => {
    if (!title.trim() || !selected.length) return;
    open.mutate({ type: "group", title: title.trim(), user_ids: selected });
  }, [open, selected, title]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === "section") return <SectionHeader title={item.title} />;
      if (item.kind === "management") {
        return (
          <DirectoryRow
            name={item.name}
            subtitle={item.subtitle}
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
          selected={tab === "group" ? picked : undefined}
          onPress={() => (tab === "group" ? toggle(item.user.user_id) : open.mutate({ type: "direct", user_id: item.user.user_id }))}
          disabled={open.isPending}
        />
      );
    },
    [open, selected, tab, toggle],
  );

  if (!auth.user) return <Redirect href="/giris" />;

  const groupMode = tab === "group";
  const canCreate = groupMode && title.trim().length >= 2 && selected.length > 0 && !open.isPending;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScreenHeader
        title="Mesaj oluştur"
        subtitle="Kime yazmak istiyorsun?"
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
                placeholder="Yönetim, takım veya oyuncu ara"
                variant="search"
                size="sm"
                leadingIcon="search"
                accessibilityLabel="Rehberde ara"
              />
            </View>
          </View>
        }
      />

      {groupMode ? (
        <View style={styles.groupForm}>
          <Input
            label="Grup adı"
            value={title}
            onChangeText={setTitle}
            placeholder="Örn. Antrenman planı"
            maxLength={120}
            hint={`${selected.length} üye seçildi`}
          />
        </View>
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
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={debounced ? "Kimse bulunamadı" : groupMode ? "Gruba eklenecek üye yok" : "Rehber boş"}
              body={
                debounced
                  ? "Adı farklı yazmayı dene."
                  : "Takım yöneticileri ve hesabı bağlı oyuncular burada listelenir."
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

const DirectoryRow = memo(function DirectoryRow({
  name,
  subtitle,
  avatar,
  icon,
  selected,
  disabled,
  onPress,
}: {
  name: string;
  subtitle: string;
  avatar?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      style={[styles.row, selected ? styles.rowSelected : null]}
    >
      {icon && !avatar ? (
        <View style={styles.iconBubble}>
          <Ionicons name={icon} size={20} color={colors.textOnBrand} />
        </View>
      ) : (
        <Avatar name={name} image={avatar ?? null} size={44} />
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {name}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1} {...textScale.dense}>
          {subtitle}
        </Text>
      </View>
      <Ionicons
        name={selected === undefined ? "chevron-forward" : selected ? "checkmark-circle" : "ellipse-outline"}
        size={selected === undefined ? 16 : 22}
        color={selected ? colors.brand : colors.textTertiary}
      />
    </Touchable>
  );
});

const ICON_BUBBLE = 44;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBottom: { gap: space.sm, paddingBottom: space.sm },
  searchWrap: { paddingHorizontal: layout.screenPadding },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  list: { flexGrow: 1, paddingBottom: space.huge },
  groupForm: { paddingHorizontal: layout.screenPadding, paddingTop: space.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.m,
    minHeight: layout.listRowHeightTwoLine,
  },
  rowSelected: { backgroundColor: colors.brandDim },
  iconBubble: {
    width: ICON_BUBBLE,
    height: ICON_BUBBLE,
    borderRadius: ICON_BUBBLE / 2,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0, gap: space.xxs },
  rowTitle: { ...type.h4, color: colors.textPrimary },
  rowSubtitle: { ...type.caption, color: colors.textSecondary },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    backgroundColor: colors.surface1,
  },
});
