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

import { Avatar, Button, EmptyState, ErrorState, ListRow, ScreenHeader, SkeletonListRow, errorMessage, useToast } from "@/components/ui";
import { getBlockedUsers, unblockUser, type BlockedUser } from "@/lib/api/chat";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space, textScale, type } from "@/theme";

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

  const header = <ScreenHeader title="Engellediğim üyeler" back />;

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
            <Text style={styles.lede} {...textScale.long}>
              Engellenen üye sana mesaj yazamaz ve seni arayamaz; sen de ona yazamazsın. Takım ve grup sohbetleri etkilenmez.
            </Text>
          }
          renderItem={({ item, index }) => (
            <ListRow
              title={item.name}
              subtitle={[item.subtitle, item.blocked_at ? `Engellendi: ${formatDateShort(item.blocked_at)}` : null].filter(Boolean).join(" · ")}
              leading={<Avatar name={item.name} image={mediaUrl(item.avatar)} size={40} />}
              position={blocks.length === 1 ? "single" : index === 0 ? "first" : index === blocks.length - 1 ? "last" : "middle"}
              trailing={<Button label="Kaldır" variant="secondary" size="sm" onPress={() => confirmUnblock(item)} loading={busyId === item.user_id} />}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant },
  lede: { ...type.bodySm, color: colors.textSecondary, lineHeight: 19, marginBottom: space.md },
});
