/**
 * ENGELLEDİĞİM ÜYELER — GET /api/chat/blocks, DELETE /api/chat/blocks/:userId
 *
 * NEDEN VAR: App Store (1.2) ve Google Play, kötüye kullanan üyeyi engelleme
 * yolu ister; engelin geri alınabilir olması ve listelenebilmesi de bu
 * şartın parçasıdır. Engel sohbet odasından ("⋯" menüsü) ya da şikayet
 * sayfasından konur; burada görülür ve kaldırılır.
 *
 * Engel iki yönlüdür: engellenen sana yazamaz ve seni arayamaz, sen de ona
 * yazamazsın. Takım ve grup sohbetlerine dokunmaz (sunucu:
 * services/chat/safetyService.js).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar, Button, EmptyState, ErrorState, IconTile, Reveal, ScreenHeader, SkeletonListRow, errorMessage, useToast } from "@/components/ui";
import { getBlockedUsers, unblockUser, type BlockedUser } from "@/lib/api/chat";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

export default function BlockedUsersScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const signedIn = Boolean(auth.user);
  const [busyId, setBusyId] = useState<number | null>(null);

  const query = useQuery({ queryKey: queryKeys.chatBlocks(), queryFn: getBlockedUsers, enabled: signedIn });

  const unblock = useMutation({
    mutationFn: (userId: number) => unblockUser(userId),
    onMutate: (userId) => setBusyId(userId),
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<{ blocks: BlockedUser[] }>(queryKeys.chatBlocks(), (previous) =>
        previous ? { blocks: previous.blocks.filter((item) => item.user_id !== userId) } : previous,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
      toast.show({ message: "Engel kaldırıldı.", tone: "success" });
    },
    onError: (error) => toast.show({ message: errorMessage(error), tone: "danger" }),
    onSettled: () => setBusyId(null),
  });

  const confirmUnblock = useCallback(
    (item: BlockedUser) => {
      Alert.alert(`${item.name} için engel kaldırılsın mı?`, "Tekrar mesaj yazabilir ve seni arayabilir.", [
        { text: "Vazgeç", style: "cancel" },
        { text: "Engeli kaldır", onPress: () => unblock.mutate(item.user_id) },
      ]);
    },
    [unblock],
  );

  const count = query.data?.blocks.length ?? 0;
  const header = (
    <ScreenHeader
      title="Engellediğim üyeler"
      subtitle={signedIn && query.data ? (count ? `${count} üye engelli` : "Engel listen boş") : undefined}
      back
    />
  );

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState icon="person-outline" title="Önce giriş yap" body="Engel listeni görmek için giriş yapman gerekiyor." action={{ label: "Giriş yap", onPress: () => router.push("/giris") }} />
      </SafeAreaView>
    );
  }

  const blocks = query.data?.blocks ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}
      {query.isLoading ? (
        <View style={styles.content}><SkeletonListRow count={4} /></View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : blocks.length === 0 ? (
        <EmptyState icon="shield-checkmark-outline" title="Engellediğin üye yok" body="Bir üyeyi sohbet odasındaki ⋯ menüsünden ya da şikayet ederken engelleyebilirsin. Engellenen üye sana yazamaz ve seni arayamaz." />
      ) : (
        <FlatList
          data={blocks}
          keyExtractor={(item) => String(item.user_id)}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.info}>
              <IconTile icon="ban" tone="red" size={44} />
              <View style={styles.infoBody}>
                <View style={styles.infoHead}>
                  <Text style={styles.infoCount} {...textScale.badge}>
                    {count}
                  </Text>
                  <Text style={styles.infoTitle} {...textScale.dense}>
                    üye engelli
                  </Text>
                </View>
                <Text style={styles.lede} {...textScale.long}>
                  Engellenen üye sana yazamaz ve seni arayamaz; sen de ona yazamazsın. Takım ve grup sohbetleri etkilenmez.
                </Text>
              </View>
            </View>
          }
          renderItem={({ item, index }) => (
            <Reveal index={index} limit={8} distance={8}>
              <View
                style={[
                  styles.row,
                  index === 0 ? styles.rowFirst : null,
                  index === blocks.length - 1 ? styles.rowLast : styles.rowDivided,
                ]}
              >
                <Avatar name={item.name} image={mediaUrl(item.avatar)} size={40} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
                    {[item.subtitle, item.blocked_at ? formatDateShort(item.blocked_at) : null].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Button
                  label="Kaldır"
                  icon="lock-open-outline"
                  variant="secondary"
                  size="sm"
                  onPress={() => confirmUnblock(item)}
                  loading={busyId === item.user_id}
                  accessibilityLabel={`${item.name} için engeli kaldır`}
                />
              </View>
            </Reveal>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant },
  info: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.lg,
    marginBottom: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.dangerDim,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  infoBody: { flex: 1, minWidth: 0, gap: space.xs },
  infoHead: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  infoCount: { ...type.scoreMd, color: colors.textPrimary },
  infoTitle: { ...type.h3, color: colors.textPrimary },
  lede: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    backgroundColor: colors.surface1,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
  },
  rowFirst: { borderTopWidth: hairline, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  rowLast: { borderBottomWidth: hairline, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  rowDivided: { borderBottomWidth: hairline, borderBottomColor: colors.separator },
  rowBody: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { ...type.h3, color: colors.textPrimary },
  rowMeta: { ...type.bodySm, color: colors.textTertiary },
});
