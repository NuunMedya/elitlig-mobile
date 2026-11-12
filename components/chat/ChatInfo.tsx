/**
 * KİŞİ / GRUP BİLGİSİ — WhatsApp'ın bilgi ekranı (masaüstü ContactPanel,
 * GroupPanel ve MediaPanel'in mobil karşılığı).
 *
 *   Genel       kimlik (avatar, ad, çevrimiçi / son görülme ya da üye sayısı,
 *               grup açıklaması), yıldızlı mesajlar, sessize al, sabitle,
 *               arşivle; grupta ayarlar (yalnız yöneticiler yazsın / düzenlesin),
 *               üyeler (yönetici yap, çıkar, mesaj gönder), üye ekle; birebirde
 *               ortak gruplar; engelle, şikayet et, gruptan çık, sohbeti sil.
 *   Medya       sohbetteki fotoğraflar (ızgara → tam ekran görüntüleyici)
 *   Belgeler    gönderilen dosyalar
 *   Bağlantılar mesajlardaki adresler
 *
 * Takım grupları (type "team") sunucuda grup yönetimi uçlarına kapalıdır
 * (üyelik takım kadrosundan eşitlenir); üyeler salt okunur listelenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Image, Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ImageViewer, type ViewerImage } from "@/components/chat/ImageViewer";
import { ActionMenu, ChatAvatar, type MessageMenuItem } from "@/components/chat/MessageSheets";
import { ReportSheet, type ReportTarget } from "@/components/chat/ReportSheet";
import { useConversationActions } from "@/components/chat/useConversationActions";
import { Avatar, BottomSheet, Button, EmptyState, ErrorState, Input, ListRow, SegmentedControl, SkeletonListRow, Touchable, WaHeader, errorMessage } from "@/components/chat/kit";
import { useToast } from "@/components/ui";
import { patchConversationCache, useConversations, usePresence } from "@/hooks/useChat";
import {
  addGroupMembers,
  getConversation,
  getConversationMedia,
  getDirectory,
  getGroupInfo,
  openConversation,
  removeGroupMember,
  setGroupMemberRole,
  updateGroup,
  uploadFile,
  type ChatConversation,
  type ChatUser,
  type GroupMember,
  type GroupPatch,
} from "@/lib/api/chat";
import { pickFromLibrary } from "@/lib/chatMedia";
import { formatBytes, isGroupChat, lastSeenLabel, listTime, shortUrl } from "@/lib/chatUtils";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useCall } from "@/providers/CallProvider";
import { colors } from "@/lib/chatPalette";
import { hairline, layout, radius, space, textScale, type } from "@/theme";

type Section = "genel" | "medya" | "belgeler" | "baglantilar";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "genel", label: "Genel" },
  { key: "medya", label: "Medya" },
  { key: "belgeler", label: "Belgeler" },
  { key: "baglantilar", label: "Bağlantılar" },
];

export interface ChatInfoProps {
  conversationId: number;
  initialSection?: string;
}

export function ChatInfo({ conversationId, initialSection }: ChatInfoProps) {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const call = useCall();
  const queryClient = useQueryClient();
  const actions = useConversationActions();
  const { width } = useWindowDimensions();
  const [section, setSection] = useState<Section>(SECTIONS.some((item) => item.key === initialSection) ? (initialSection as Section) : "genel");
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [memberMenu, setMemberMenu] = useState<GroupMember | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);

  const list = useConversations();
  const listed = list.data?.conversations.find((item) => item.id === conversationId) ?? null;
  const single = useQuery({
    queryKey: ["chat", "conversation", conversationId] as const,
    queryFn: () => getConversation(conversationId).then((data) => data.conversation),
    enabled: Boolean(auth.user) && conversationId > 0 && !listed,
    staleTime: 10_000,
    retry: false,
  });
  // Liste önbelleği soketle güncel kalır; orada yoksa (arşiv dışı, yeni açılmış) tekil istek.
  const conversation = listed ?? single.data ?? null;
  const isGroup = conversation?.type === "group";
  const grouped = isGroupChat(conversation);
  const other = conversation?.type === "direct" ? conversation.other_user : null;

  const group = useQuery({
    queryKey: ["chat", "group", conversationId] as const,
    queryFn: () => getGroupInfo(conversationId),
    enabled: Boolean(auth.user) && isGroup,
    staleTime: 10_000,
    retry: false,
  });
  const media = useQuery({
    queryKey: ["chat", "media", conversationId] as const,
    queryFn: () => getConversationMedia(conversationId),
    enabled: Boolean(auth.user) && Boolean(conversation) && section !== "genel",
    staleTime: 20_000,
    retry: false,
  });
  const presence = usePresence(useMemo(() => (other ? [other.user_id] : []), [other]));
  const otherPresence = other ? presence[String(other.user_id)] : undefined;

  const isAdmin = Boolean(group.data?.is_admin);
  const canEditGroup = isGroup && (isAdmin || !group.data?.only_admins_edit);
  const members: GroupMember[] = useMemo(() => {
    if (group.data) return group.data.members;
    return (conversation?.participants ?? []).map((p) => ({ user_id: p.user_id, role: p.role, name: p.name, subtitle: p.subtitle, avatar: p.avatar, joined_at: null, is_me: p.is_me }));
  }, [conversation?.participants, group.data]);

  /** Birebir: karşı tarafla ortak olduğum gruplar. */
  const commonGroups = useMemo(
    () => (other ? (list.data?.conversations ?? []).filter((item) => isGroupChat(item) && item.participants.some((p) => p.user_id === other.user_id)) : []),
    [list.data, other],
  );

  const refreshGroup = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["chat", "group", conversationId] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
  }, [conversationId, queryClient]);
  const fail = useCallback((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }), [toast]);

  const patchGroup = useMutation({
    mutationFn: (body: GroupPatch) => updateGroup(conversationId, body),
    onSuccess: (info) => {
      queryClient.setQueryData(["chat", "group", conversationId], info);
      patchConversationCache(queryClient, conversationId, { title: info.conversation.title, avatar: info.conversation.avatar, description: info.description, only_admins_send: info.only_admins_send, only_admins_edit: info.only_admins_edit });
    },
    onError: fail,
  });

  const changePhoto = useCallback(() => {
    void pickFromLibrary("images")
      .then(async (files) => {
        const file = files[0];
        if (!file) return;
        const uploaded = await uploadFile({ uri: file.uri, name: file.name, type: file.type });
        patchGroup.mutate({ avatar_url: uploaded.url });
      })
      .catch(fail);
  }, [fail, patchGroup]);

  const openDirect = useCallback(
    (userId: number) => {
      const existing = (list.data?.conversations ?? []).find((item) => item.type === "direct" && item.other_user?.user_id === userId);
      if (existing) {
        router.push({ pathname: "/sohbet/[id]", params: { id: String(existing.id) } });
        return;
      }
      void openConversation({ type: "direct", user_id: userId })
        .then(({ conversation: opened }) => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
          router.push({ pathname: "/sohbet/[id]", params: { id: String(opened.id) } });
        })
        .catch(fail);
    },
    [fail, list.data, queryClient, router],
  );

  const memberItems = useMemo<MessageMenuItem[]>(() => {
    const member = memberMenu;
    if (!member || member.is_me) return [];
    const items: (MessageMenuItem | false)[] = [
      { key: "message", label: `${member.name} kişisine mesaj gönder`, icon: "chatbubble-outline", onPress: () => openDirect(member.user_id) },
      isGroup && isAdmin && {
        key: "role",
        label: member.role === "admin" ? "Yöneticiliği kaldır" : "Grup yöneticisi yap",
        icon: "shield-checkmark-outline",
        onPress: () => void setGroupMemberRole(conversationId, member.user_id, member.role === "admin" ? "member" : "admin").then(refreshGroup).catch(fail),
      },
      isGroup && isAdmin && {
        key: "remove",
        label: "Gruptan çıkar",
        icon: "person-remove-outline",
        danger: true,
        onPress: () =>
          Alert.alert("Gruptan çıkar", `${member.name} gruptan çıkarılsın mı?`, [
            { text: "Vazgeç", style: "cancel" },
            { text: "Çıkar", style: "destructive", onPress: () => void removeGroupMember(conversationId, member.user_id).then(refreshGroup).catch(fail) },
          ]),
      },
    ];
    return items.filter(Boolean) as MessageMenuItem[];
  }, [conversationId, fail, isAdmin, isGroup, memberMenu, openDirect, refreshGroup]);

  const images = useMemo<ViewerImage[]>(
    () => (media.data?.images ?? []).filter((item) => item.url).map((item) => ({ key: String(item.id), uri: item.url, created_at: item.created_at, messageId: item.id })),
    [media.data],
  );
  const goToMessage = useCallback(
    (messageId: number) => router.push({ pathname: "/sohbet/[id]", params: { id: String(conversationId), mesaj: String(messageId) } }),
    [conversationId, router],
  );
  const leaveToList = useCallback(() => router.replace("/(tabs)/mesajlar"), [router]);

  if (!auth.user) return <Redirect href="/giris" />;

  const header = <WaHeader title={grouped ? "Grup bilgisi" : "Kişi bilgisi"} back />;
  if (!conversation) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        {single.isError ? <ErrorState error={single.error} onRetry={() => void single.refetch()} /> : list.isLoading || single.isLoading ? <View style={styles.pad}><SkeletonListRow count={6} avatar /></View> : <EmptyState icon="chatbubble-ellipses-outline" title="Sohbet bulunamadı" body="Bu sohbet silinmiş ya da erişiminin dışında olabilir." />}
      </SafeAreaView>
    );
  }

  const description = group.data?.description ?? conversation.description ?? null;
  const statusLine = grouped
    ? `${conversation.type === "team" ? "Takım grubu" : "Grup"} · ${members.length} üye`
    : lastSeenLabel(otherPresence) || conversation.subtitle;
  const cell = Math.floor((width - layout.screenPadding * 2 - space.xs * 2) / 3);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.identity}>
          <Touchable feedback="none" haptic="light" onPress={canEditGroup ? changePhoto : undefined} disabled={!canEditGroup} accessibilityRole={canEditGroup ? "button" : "image"} accessibilityLabel={canEditGroup ? "Grup fotoğrafını değiştir" : conversation.title}>
            <ChatAvatar conversation={conversation} size={96} online={Boolean(otherPresence?.online)} />
            {canEditGroup ? (
              <View style={styles.photoBadge}><Ionicons name="camera" size={14} color={colors.textOnBrand} /></View>
            ) : null}
          </Touchable>
          <Text style={styles.name} {...textScale.dense}>{conversation.title}</Text>
          <Text style={styles.status} {...textScale.dense}>{statusLine}</Text>
          {other?.team_name && other.team_name !== conversation.title ? <Text style={styles.status} {...textScale.dense}>{other.team_name}</Text> : null}
          {description ? <Text style={styles.description} {...textScale.long}>{description}</Text> : null}
          <View style={styles.quick}>
            <QuickAction icon="chatbubble" label="Mesaj" onPress={() => router.back()} />
            {conversation.can_call ? <QuickAction icon="call" label="Ara" onPress={() => void call.startCall(conversation)} /> : null}
            <QuickAction icon={conversation.muted ? "notifications" : "notifications-off"} label={conversation.muted ? "Sesi aç" : "Sessize al"} onPress={() => actions.mute(conversation)} />
            {canEditGroup ? <QuickAction icon="create" label="Düzenle" onPress={() => setEditOpen(true)} /> : null}
          </View>
        </View>

        <View style={styles.pad}>
          <SegmentedControl items={SECTIONS} value={section} onChange={setSection} stretch size="sm" />
        </View>

        {section === "genel" ? (
          <>
            <View style={styles.group}>
              <ListRow leading={{ icon: "star", tone: "warn" }} title="Yıldızlı mesajlar" chevron onPress={() => router.push({ pathname: "/sohbet/yildizli", params: { sohbet: String(conversationId) } })} position="first" />
              <ListRow leading={{ icon: "notifications-off", tone: "neutral" }} title="Sessize al" subtitle="Bu sohbetten bildirim gelmez" toggle={{ value: conversation.muted, onValueChange: () => actions.mute(conversation) }} position="middle" />
              <ListRow leading={{ icon: "pin", tone: "brand" }} title="Sohbeti sabitle" subtitle="Listenin başında durur (en çok 3 sohbet)" toggle={{ value: Boolean(conversation.pinned), onValueChange: () => actions.pin(conversation), disabled: Boolean(conversation.archived) }} position="middle" />
              <ListRow leading={{ icon: "archive", tone: "neutral" }} title={conversation.archived ? "Arşivden çıkar" : "Arşivle"} onPress={() => actions.archive(conversation)} position="last" />
            </View>

            {isGroup && isAdmin ? (
              <>
                <Text style={styles.sectionTitle} {...textScale.badge}>GRUP AYARLARI</Text>
                <View style={styles.group}>
                  <ListRow title="Yalnız yöneticiler mesaj göndersin" subtitle="Duyuru grubu: üyeler yalnız okur" toggle={{ value: Boolean(group.data?.only_admins_send), onValueChange: (value) => patchGroup.mutate({ only_admins_send: value }), disabled: patchGroup.isPending }} position="first" />
                  <ListRow title="Grup bilgisini yalnız yöneticiler düzenlesin" subtitle="Ad, fotoğraf, üye ekleme ve mesaj sabitleme" toggle={{ value: Boolean(group.data?.only_admins_edit), onValueChange: (value) => patchGroup.mutate({ only_admins_edit: value }), disabled: patchGroup.isPending }} position="last" />
                </View>
              </>
            ) : null}

            {grouped ? (
              <>
                <Text style={styles.sectionTitle} {...textScale.badge}>{members.length} ÜYE</Text>
                {group.isError ? <View style={styles.pad}><ErrorState error={group.error} onRetry={() => void group.refetch()} variant="banner" /></View> : null}
                {canEditGroup ? (
                  <Touchable feedback="row" haptic="selection" onPress={() => setAddOpen(true)} accessibilityRole="button" accessibilityLabel="Üye ekle" style={styles.member}>
                    <View style={styles.addIcon}><Ionicons name="person-add" size={18} color={colors.textOnBrand} /></View>
                    <Text style={styles.addLabel} {...textScale.dense}>Üye ekle</Text>
                  </Touchable>
                ) : null}
                {members.map((member) => <MemberRow key={member.user_id} member={member} onPress={setMemberMenu} />)}
              </>
            ) : null}

            {other && commonGroups.length ? (
              <>
                <Text style={styles.sectionTitle} {...textScale.badge}>{commonGroups.length} ORTAK GRUP</Text>
                {commonGroups.map((item) => (
                  <Touchable key={item.id} feedback="row" haptic="selection" onPress={() => router.push({ pathname: "/sohbet/[id]", params: { id: String(item.id) } })} accessibilityRole="button" accessibilityLabel={`${item.title} grubunu aç`} style={styles.member}>
                    <ChatAvatar conversation={item} size={40} />
                    <View style={styles.memberBody}>
                      <Text style={styles.memberName} numberOfLines={1} {...textScale.dense}>{item.title}</Text>
                      <Text style={styles.memberSub} numberOfLines={1} {...textScale.dense}>{item.subtitle}</Text>
                    </View>
                  </Touchable>
                ))}
              </>
            ) : null}

            <View style={[styles.group, styles.dangerGroup]}>
              {other && other.kind !== "staff" ? (
                <ListRow leading={{ icon: "ban", tone: "danger" }} title={conversation.blocked_by_me ? "Engeli kaldır" : `${other.name} kişisini engelle`} destructive={!conversation.blocked_by_me} onPress={() => actions.block(conversation)} position="first" />
              ) : null}
              {!conversation.is_management && !conversation.is_admin_feed && other?.kind !== "staff" ? (
                <ListRow leading={{ icon: "flag", tone: "danger" }} title="Şikayet et" destructive onPress={() => setReport({ userId: other?.user_id ?? null, userName: other?.name ?? null, conversationId })} position="middle" />
              ) : null}
              {isGroup ? <ListRow leading={{ icon: "exit", tone: "danger" }} title="Gruptan çık" destructive onPress={() => actions.leave(conversation, leaveToList)} position="middle" /> : null}
              {!conversation.is_admin_feed ? <ListRow leading={{ icon: "trash", tone: "danger" }} title="Sohbeti sil" destructive onPress={() => actions.remove(conversation, leaveToList)} position="last" /> : null}
            </View>
          </>
        ) : media.isLoading ? (
          <View style={styles.pad}><SkeletonListRow count={5} avatar={false} /></View>
        ) : media.isError ? (
          <ErrorState error={media.error} onRetry={() => void media.refetch()} />
        ) : section === "medya" ? (
          images.length ? (
            <View style={styles.grid}>
              {images.map((image, index) => (
                <Touchable key={image.key} feedback="none" haptic="light" onPress={() => setViewer(index)} accessibilityRole="imagebutton" accessibilityLabel="Fotoğraf. Tam ekran görmek için dokun">
                  <Image source={{ uri: image.uri }} style={[styles.gridImage, { width: cell, height: cell }]} resizeMode="cover" />
                </Touchable>
              ))}
            </View>
          ) : (
            <EmptyState icon="images-outline" title="Fotoğraf yok" body="Bu sohbette gönderilen fotoğraflar burada toplanır." />
          )
        ) : section === "belgeler" ? (
          (media.data?.files ?? []).length ? (
            (media.data?.files ?? []).map((file) => (
              <Touchable key={file.id} feedback="row" haptic="selection" onPress={() => void Linking.openURL(file.url).catch(() => toast.show({ message: "Dosya açılamadı. Bağlantını kontrol edip tekrar dene.", tone: "danger" }))} onLongPress={() => goToMessage(file.id)} accessibilityRole="link" accessibilityLabel={`${file.name}. Açmak için dokun, mesaja gitmek için basılı tut`} style={styles.member}>
                <View style={styles.fileIcon}><Ionicons name="document-text" size={20} color={colors.textOnBrand} /></View>
                <View style={styles.memberBody}>
                  <Text style={styles.memberName} numberOfLines={1} {...textScale.dense}>{file.name}</Text>
                  <Text style={styles.memberSub} numberOfLines={1} {...textScale.dense}>{[formatBytes(file.size), listTime(file.created_at)].filter(Boolean).join(" · ")}</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={colors.textTertiary} />
              </Touchable>
            ))
          ) : (
            <EmptyState icon="document-text-outline" title="Belge yok" body="Bu sohbette gönderilen dosyalar burada toplanır." />
          )
        ) : (media.data?.links ?? []).length ? (
          (media.data?.links ?? []).flatMap((link) =>
            link.urls.map((url, index) => (
              <Touchable key={`${link.id}-${index}`} feedback="row" haptic="selection" onPress={() => void Linking.openURL(url).catch(() => toast.show({ message: "Bağlantı açılamadı.", tone: "danger" }))} onLongPress={() => goToMessage(link.id)} accessibilityRole="link" accessibilityLabel={`${shortUrl(url)}. Açmak için dokun, mesaja gitmek için basılı tut`} style={styles.member}>
                <View style={[styles.fileIcon, styles.linkIcon]}><Ionicons name="link" size={20} color={colors.textSecondary} /></View>
                <View style={styles.memberBody}>
                  <Text style={styles.linkText} numberOfLines={1} {...textScale.dense}>{shortUrl(url)}</Text>
                  <Text style={styles.memberSub} numberOfLines={1} {...textScale.dense}>{[listTime(link.created_at), link.body?.replace(/\s+/g, " ")].filter(Boolean).join(" · ")}</Text>
                </View>
              </Touchable>
            )),
          )
        ) : (
          <EmptyState icon="link-outline" title="Bağlantı yok" body="Mesajlarda paylaşılan adresler burada toplanır." />
        )}
      </ScrollView>

      <ActionMenu visible={Boolean(memberMenu) && memberItems.length > 0} title={memberMenu?.name} items={memberItems} onClose={() => setMemberMenu(null)} />
      <GroupEditSheet visible={editOpen} title={conversation.title} description={description} busy={patchGroup.isPending} onClose={() => setEditOpen(false)} onSave={(body) => patchGroup.mutate(body, { onSuccess: () => setEditOpen(false) })} />
      <AddMembersSheet visible={addOpen} conversationId={conversationId} exclude={members.map((member) => member.user_id)} onClose={() => setAddOpen(false)} onAdded={refreshGroup} />
      <ImageViewer images={images} index={viewer} onClose={() => setViewer(null)} />
      <ReportSheet
        target={report}
        onClose={() => setReport(null)}
        onBlocked={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.chatBlocks() });
        }}
      />
    </SafeAreaView>
  );
}

/* ---------- parçalar ---------- */

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Touchable feedback="chip" haptic="selection" onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.quickItem}>
      <Ionicons name={icon} size={20} color={colors.brandAccent} />
      <Text style={styles.quickLabel} numberOfLines={1} {...textScale.dense}>{label}</Text>
    </Touchable>
  );
}

const MemberRow = memo(function MemberRow({ member, onPress }: { member: GroupMember; onPress: (member: GroupMember) => void }) {
  return (
    <Touchable feedback="row" haptic="selection" onPress={() => onPress(member)} disabled={member.is_me} accessibilityRole="button" accessibilityLabel={`${member.is_me ? "Sen" : member.name}${member.role === "admin" ? ", grup yöneticisi" : ""}`} style={styles.member}>
      <Avatar name={member.name} image={member.avatar} size={40} />
      <View style={styles.memberBody}>
        <Text style={styles.memberName} numberOfLines={1} {...textScale.dense}>{member.is_me ? "Sen" : member.name}</Text>
        {member.subtitle ? <Text style={styles.memberSub} numberOfLines={1} {...textScale.dense}>{member.subtitle}</Text> : null}
      </View>
      {member.role === "admin" ? (
        <View style={styles.role}><Text style={styles.roleText} {...textScale.badge}>Yönetici</Text></View>
      ) : null}
    </Touchable>
  );
});

function GroupEditSheet({ visible, title, description, busy, onClose, onSave }: { visible: boolean; title: string; description: string | null; busy: boolean; onClose: () => void; onSave: (body: GroupPatch) => void }) {
  const [name, setName] = useState(title);
  const [about, setAbout] = useState(description ?? "");
  useEffect(() => {
    if (visible) {
      setName(title);
      setAbout(description ?? "");
    }
  }, [description, title, visible]);
  const changed = name.trim() !== title || about.trim() !== (description ?? "");
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Grubu düzenle"
      snap="content"
      footer={
        <Button
          label="Kaydet"
          icon="checkmark"
          onPress={() => onSave({ ...(name.trim() !== title ? { title: name.trim() } : {}), ...(about.trim() !== (description ?? "") ? { description: about.trim() } : {}) })}
          disabled={!changed || name.trim().length < 2}
          loading={busy}
          fullWidth
        />
      }
    >
      <View style={styles.sheet}>
        <Input label="Grup adı" value={name} onChangeText={setName} maxLength={120} />
        <Input label="Açıklama" value={about} onChangeText={setAbout} placeholder="Grubun amacı, kurallar…" maxLength={2000} multiline />
      </View>
    </BottomSheet>
  );
}

function AddMembersSheet({ visible, conversationId, exclude, onClose, onAdded }: { visible: boolean; conversationId: number; exclude: number[]; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const directory = useQuery({ queryKey: [...queryKeys.chatDirectory(q), "member"] as const, queryFn: () => getDirectory(q), enabled: visible, staleTime: 15_000, retry: false });
  const people = useMemo(() => {
    const skip = new Set(exclude);
    const map = new Map<number, ChatUser>();
    [...(directory.data?.staff ?? []), ...(directory.data?.managers ?? []), ...(directory.data?.players ?? []), ...(directory.data?.members ?? [])].forEach((user) => {
      if (!skip.has(user.user_id) && !map.has(user.user_id)) map.set(user.user_id, user);
    });
    return [...map.values()];
  }, [directory.data, exclude]);
  const close = () => {
    setPicked([]);
    setSearch("");
    onClose();
  };
  const submit = () => {
    setBusy(true);
    void addGroupMembers(conversationId, picked)
      .then((result) => {
        toast.show({ message: result.skipped.length ? `${result.added.length} kişi eklendi; ${result.skipped.length} kişi mesaj tercihi nedeniyle eklenemedi.` : `${result.added.length} kişi eklendi.`, tone: result.skipped.length ? "warn" : "success" });
        onAdded();
        close();
      })
      .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }))
      .finally(() => setBusy(false));
  };
  return (
    <BottomSheet visible={visible} onClose={close} title="Üye ekle" snap="full" scrollable={false} footer={<Button label={picked.length ? `${picked.length} kişiyi ekle` : "Kişi seç"} icon="person-add" onPress={submit} disabled={!picked.length} loading={busy} fullWidth />}>
      <View style={styles.sheetSearch}>
        <Input value={search} onChangeText={setSearch} placeholder="Kişi ara (üyeler için en az 2 harf)" variant="search" size="sm" leadingIcon="search" accessibilityLabel="Eklenecek kişiyi ara" />
      </View>
      <FlatList
        data={people}
        keyExtractor={(item) => String(item.user_id)}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        renderItem={({ item }) => {
          const on = picked.includes(item.user_id);
          return (
            <Touchable feedback="row" haptic="selection" onPress={() => setPicked((current) => (on ? current.filter((id) => id !== item.user_id) : [...current, item.user_id]))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={item.name} style={styles.member}>
              <Avatar name={item.name} image={item.avatar} size={40} />
              <View style={styles.memberBody}>
                <Text style={styles.memberName} numberOfLines={1} {...textScale.dense}>{item.name}</Text>
                <Text style={styles.memberSub} numberOfLines={1} {...textScale.dense}>{item.subtitle}</Text>
              </View>
              <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={24} color={on ? colors.brand : colors.textTertiary} />
            </Touchable>
          );
        }}
        ListEmptyComponent={directory.isLoading ? <SkeletonListRow count={6} avatar /> : <EmptyState icon="search-outline" title="Eklenecek kişi yok" body="Rehberindeki herkes zaten grupta ya da aramayla eşleşen yok." />}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.giant },
  pad: { paddingHorizontal: layout.screenPadding, paddingVertical: space.sm },
  identity: { alignItems: "center", gap: space.xs, paddingHorizontal: layout.screenPadding, paddingTop: space.lg, paddingBottom: space.md },
  photoBadge: { position: "absolute", right: 0, bottom: 0, width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg },
  name: { ...type.display, color: colors.textPrimary, textAlign: "center", marginTop: space.sm },
  status: { ...type.body, color: colors.textSecondary, textAlign: "center" },
  description: { ...type.body, color: colors.textPrimary, textAlign: "center", marginTop: space.xs },
  quick: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  quickItem: { minWidth: 76, alignItems: "center", gap: space.xs, paddingVertical: space.m, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  quickLabel: { ...type.labelXs, color: colors.textSecondary },

  group: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  dangerGroup: { paddingTop: space.xl },
  sectionTitle: { ...type.overline, color: colors.textTertiary, paddingHorizontal: layout.screenPadding, paddingTop: space.xl, paddingBottom: space.xs },

  member: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingHorizontal: layout.screenPadding, paddingVertical: space.s },
  memberBody: { flex: 1, minWidth: 0 },
  memberName: { ...type.h3, color: colors.textPrimary },
  memberSub: { ...type.caption, color: colors.textSecondary },
  role: { paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.xs, backgroundColor: colors.brandDim },
  roleText: { ...type.labelXs, color: colors.brandAccent },
  addIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  addLabel: { ...type.h3, color: colors.brandAccent },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  gridImage: { borderRadius: radius.xs, backgroundColor: colors.surface3 },
  fileIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  linkIcon: { backgroundColor: colors.surface3 },
  linkText: { ...type.h3, color: colors.brandAccent },

  sheet: { paddingHorizontal: layout.screenPadding, paddingBottom: space.md, gap: space.sm },
  sheetSearch: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
});
