/**
 * useFollowSettings — takip başına bildirim ayarlarının TEK kaynağı.
 *
 * Takip bildirimleri ekranı (app/takip-bildirimleri.tsx), Ayarlar ekranı ve
 * "Takip et" sonrası açılan alt sayfa (providers/FollowFlowProvider.tsx)
 * aynı sorguyu ve aynı iyimser yazımı kullanır; üç yerde aynı ayar aynı
 * değerle görünür.
 *
 * VERİ: `GET /api/favorites/notifications` (takip listesi + olay kataloğu),
 * `PATCH /api/favorites/:kind/:id/notifications` (tek takip).
 *
 * NEDEN İYİMSER: anahtar/çip dokunulduğu anda dönmeli; hata olursa önceki
 * değere dönülür ve kısa bir uyarı gösterilir.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useToast } from "@/components/ui";
import {
  getFollowNotifications,
  updateFollowNotifications,
  type FollowEventInfo,
  type FollowItem,
  type FollowNotifications,
  type FollowSettingsPatch,
} from "@/lib/api/favorites";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";

export const FOLLOW_MUTATION_KEY = ["favorites", "follow-settings"] as const;

export const followKey = (item: Pick<FollowItem, "type" | "id">) => `${item.type}:${item.id}`;

/** Kaç olayın açık olduğunu anlatan kısa özet: "5 / 9 bildirim açık". */
export function followSummary(item: FollowItem): string {
  if (item.muted) return "Sessizde — bildirim gelmez";
  const on = item.events.filter((event) => item.prefs[event]).length;
  if (on === 0) return "Tüm bildirimler kapalı";
  if (on === item.events.length) return "Tüm bildirimler açık";
  return `${on} / ${item.events.length} bildirim açık`;
}

export function useFollowSettings(options: { enabled?: boolean } = {}) {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const signedIn = Boolean(auth.user);

  const query = useQuery({
    queryKey: queryKeys.followNotifications(),
    queryFn: getFollowNotifications,
    enabled: signedIn && options.enabled !== false,
    staleTime: 30_000,
  });

  const { mutate } = useMutation({
    mutationKey: FOLLOW_MUTATION_KEY,
    mutationFn: ({ item, patch }: { item: FollowItem; patch: FollowSettingsPatch }) =>
      updateFollowNotifications(item.kind, item.id, patch),

    onMutate: async ({ item, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.followNotifications() });
      const previous = queryClient.getQueryData<FollowNotifications>(queryKeys.followNotifications());
      if (previous) {
        queryClient.setQueryData<FollowNotifications>(queryKeys.followNotifications(), {
          ...previous,
          follows: previous.follows.map((follow) =>
            followKey(follow) === followKey(item)
              ? {
                  ...follow,
                  muted: patch.muted ?? follow.muted,
                  prefs: patch.prefs ? { ...follow.prefs, ...patch.prefs } : follow.prefs,
                  customized: patch.reset ? false : patch.prefs ? true : follow.customized,
                }
              : follow
          ),
        });
      }
      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.followNotifications(), context.previous);
      toast.show({ message: "Ayar kaydedilemedi. Bağlantını kontrol edip tekrar dene.", tone: "danger" });
    },

    // Yalnız son istek bitince tazele: art arda dokunuşlarda ara yanıtlar
    // iyimser değeri geri sarmasın.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: FOLLOW_MUTATION_KEY }) === 1) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.followNotifications() });
      }
    },
  });

  const change = useCallback(
    (item: FollowItem, patch: FollowSettingsPatch) => mutate({ item, patch }),
    [mutate]
  );

  const eventInfo = useMemo(() => {
    const map = new Map<string, FollowEventInfo>();
    query.data?.catalog.events.forEach((event) => map.set(event.key, event));
    return map;
  }, [query.data]);

  /** Tek takibin güncel kaydı (yoksa undefined). */
  const find = useCallback(
    (type: FollowItem["type"], id: number) =>
      query.data?.follows.find((item) => item.type === type && item.id === id),
    [query.data]
  );

  return { signedIn, query, data: query.data, change, eventInfo, find };
}
