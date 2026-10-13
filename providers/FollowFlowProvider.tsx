/**
 * TAKİP = BİLDİRİM — "Takip et" düğmesinin tek davranışı.
 *
 * NE: takım, maç ve lig (sezon, il de) takip edildiği anda bir alt sayfa
 * açılır ve o takibin bildirim türlerini sorar: "Hangi anlarda?" — gol,
 * sonuç, maç başladı, haber… Ayarlar takip bildirimleri ekranındakiyle
 * AYNIDIR (`FollowEventEditor` + `useFollowSettings`); yalnız kapsamı tek
 * takiptir.
 *
 * NEDEN: eskiden takip etmek yıldıza dokunmaktı, bildirim türleri ise Profil
 * → Ayarlar → Takip bildirimleri'nin üç basamak altındaydı; üyelerin çoğu
 * varsayılanla kalıyor ve "bu takımdan neden gol bildirimi gelmiyor"
 * soruları geliyordu. Takip anı, tercihin sorulacağı en doğal andır.
 *
 * KULLANIM:
 *   const flow = useFollowFlow();
 *   flow.toggle({ type: "team", id, name, logo }) // takip et → alt sayfa; bırak → bildirim
 *   flow.openSettings({ type: "team", id, name }) // zil: yalnız alt sayfa
 *
 * SIRA: alt sayfa takibin sunucuda var olmasını bekler (`follow()` sözü),
 * sonra takip listesini tazeleyip o takibi bulur. Misafirde takip cihazda
 * tutulur; bildirim türleri hesaba bağlı olduğu için alt sayfa giriş çağrısı
 * gösterir.
 *
 * Tek örnek app/_layout.tsx'te FavoriteProvider'ın altında mount edilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import { FollowEventEditor } from "@/components/FollowEventEditor";
import { BottomSheet, Button, SkeletonListRow, TeamLogo, useToast } from "@/components/ui";
import { useFollowSettings } from "@/hooks/useFollowSettings";
import { queryKeys } from "@/lib/queryKeys";
import { useFavorite, type FollowTarget } from "@/providers/FavoriteProvider";
import { colors, layout, radius, space, textScale, type } from "@/theme";

interface FollowFlowValue {
  /** Takip ediliyorsa bırakır; edilmiyorsa takip eder ve alt sayfayı açar. */
  toggle: (target: FollowTarget) => void;
  /** Takip eder (zaten ediliyorsa yalnız) ve alt sayfayı açar. */
  follow: (target: FollowTarget) => void;
  /** Takip edilen bir öğenin bildirim türleri (zil düğmesi). */
  openSettings: (target: FollowTarget) => void;
}

const FollowFlowContext = createContext<FollowFlowValue | null>(null);

const TYPE_ICON: Record<FollowTarget["type"], keyof typeof Ionicons.glyphMap> = {
  team: "shield-outline",
  league: "trophy-outline",
  season: "calendar-outline",
  city: "location-outline",
  match: "football-outline",
};

const TYPE_NOUN: Record<FollowTarget["type"], string> = {
  team: "takım",
  league: "lig",
  season: "sezon",
  city: "il",
  match: "maç",
};

export function FollowFlowProvider({ children }: { children: ReactNode }) {
  const favorite = useFavorite();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [target, setTarget] = useState<FollowTarget | null>(null);
  /** Takip yazımı sürerken alt sayfa iskelet gösterir. */
  const [syncing, setSyncing] = useState(false);
  /** Bu açılış yeni bir takiple mi başladı (başlıkta "Takip edildi")? */
  const [fresh, setFresh] = useState(false);

  const { follow: followEntity, unfollow, isFollowing } = favorite;

  const refreshFollows = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.followNotifications() }),
    [queryClient]
  );

  const follow = useCallback(
    (next: FollowTarget) => {
      const already = isFollowing(next.type, next.id);
      setTarget(next);
      setFresh(!already);
      if (already) return;
      setSyncing(true);
      followEntity(next)
        .then(refreshFollows)
        .finally(() => setSyncing(false));
    },
    [followEntity, isFollowing, refreshFollows]
  );

  const toggle = useCallback(
    (next: FollowTarget) => {
      if (isFollowing(next.type, next.id)) {
        void unfollow(next.type, next.id).then(refreshFollows);
        toast.show({ message: `${next.name} takipten çıkarıldı.`, tone: "neutral" });
        return;
      }
      follow(next);
    },
    [follow, isFollowing, refreshFollows, toast, unfollow]
  );

  const openSettings = useCallback((next: FollowTarget) => {
    setFresh(false);
    setSyncing(false);
    setTarget(next);
  }, []);

  const close = useCallback(() => setTarget(null), []);

  const value = useMemo(() => ({ toggle, follow, openSettings }), [toggle, follow, openSettings]);

  return (
    <FollowFlowContext.Provider value={value}>
      {children}
      <FollowSheet target={target} fresh={fresh} syncing={syncing} onClose={close} />
    </FollowFlowContext.Provider>
  );
}

export function useFollowFlow(): FollowFlowValue {
  const context = useContext(FollowFlowContext);
  if (!context) throw new Error("useFollowFlow, FollowFlowProvider içinde kullanılmalıdır.");
  return context;
}

/* ═════════════════════════════ ALT SAYFA ═════════════════════════════ */

function FollowSheet({
  target,
  fresh,
  syncing,
  onClose,
}: {
  target: FollowTarget | null;
  fresh: boolean;
  syncing: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const settings = useFollowSettings({ enabled: Boolean(target) });
  const item = target ? settings.find(target.type, target.id) : undefined;
  const loading = syncing || settings.query.isLoading || (settings.query.isFetching && !item);

  const goSignIn = useCallback(() => {
    onClose();
    router.push("/giris");
  }, [onClose, router]);

  const goAll = useCallback(() => {
    if (!target) return;
    onClose();
    router.push(`/takip-bildirimleri?odak=${target.type}:${target.id}`);
  }, [onClose, router, target]);

  const noun = target ? TYPE_NOUN[target.type] : "";

  return (
    <BottomSheet
      visible={Boolean(target)}
      onClose={onClose}
      title={fresh ? "Takip edildi" : "Bildirimler"}
      snap="content"
      footer={<Button label="Tamam" onPress={onClose} fullWidth haptic="light" />}
    >
      {target ? (
        <View style={styles.body}>
          <View style={styles.identity}>
            {target.type === "team" ? (
              <TeamLogo name={target.name} logo={target.logo} size={40} />
            ) : (
              <View style={styles.typeIcon}>
                <Ionicons name={TYPE_ICON[target.type]} size={20} color={colors.brandAccent} />
              </View>
            )}
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                {target.name}
              </Text>
              <Text style={styles.caption} numberOfLines={2} {...textScale.long}>
                {settings.signedIn
                  ? `Bu ${noun} için hangi anlarda bildirim almak istersin?`
                  : "Takip bu cihazda saklandı. Bildirim almak için giriş yap."}
              </Text>
            </View>
          </View>

          {!settings.signedIn ? (
            <Button label="Giriş yap" icon="log-in-outline" variant="secondary" onPress={goSignIn} fullWidth />
          ) : loading ? (
            <SkeletonListRow count={2} avatar={false} />
          ) : item ? (
            <>
              {settings.data?.enabled === false ? (
                <View style={styles.notice}>
                  <Ionicons name="notifications-off-outline" size={16} color={colors.warn} />
                  <Text style={styles.noticeText} {...textScale.long}>
                    Takip bildirimleri genel olarak kapalı; buradaki seçimler açtığında geçerli olur.
                  </Text>
                </View>
              ) : null}
              <FollowEventEditor item={item} eventInfo={settings.eventInfo} onChange={settings.change} />
            </>
          ) : (
            <View style={styles.notice}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.noticeText} {...textScale.long}>
                Bildirim ayarları şu an yüklenemedi. Takip bildirimleri ekranından tekrar deneyebilirsin.
              </Text>
            </View>
          )}

          {settings.signedIn ? (
            <Button label="Tüm takip bildirimleri" variant="ghost" size="sm" icon="options-outline" onPress={goAll} />
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.lg,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  identityText: { flex: 1, gap: 2 },
  name: { ...type.h3, color: colors.textPrimary },
  caption: { ...type.bodySm, color: colors.textSecondary },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  noticeText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
});
