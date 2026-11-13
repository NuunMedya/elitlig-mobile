import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAdminMutation } from "@/components/admin";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

import { cityKeys, puzzleKeys } from "./api";
import {
  advanceCity2Step,
  buildCity2Stage,
  buyCity2Landmark,
  buyCity2Lock,
  city2Keys,
  getCity2,
  placeCity2Landmark,
  type City2Response,
  type City2State,
} from "./city2";

/**
 * Kulüp Şehri 2.0 durumu. `legacy` true ise sunucu /city2'yi tanımıyor (404):
 * ekran eski şehre düşer.
 */
export function useCity2() {
  const auth = useAuth();
  const query = useQuery({ queryKey: city2Keys.me(), queryFn: getCity2, enabled: Boolean(auth.user), staleTime: 20_000, retry: false });
  const legacy = query.error instanceof ApiError && query.error.status === 404;
  return { query, city2: query.data?.city2, legacy };
}

/** Yazma yanıtındaki yeni durumu önbelleğe yazar; bağlı tabloları tazeler. */
export function useCity2Write() {
  const queryClient = useQueryClient();
  return useCallback(
    (next: City2State) => {
      queryClient.setQueryData<City2Response>(city2Keys.me(), (current) => (current ? { ...current, city2: next } : { city2: next }));
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.me() });
      // Eski /city izdüşümü (günlük ödül kartı ve eski ekranlar) ve sıralamalar.
      void queryClient.invalidateQueries({ queryKey: cityKeys.me(), exact: true });
      void queryClient.invalidateQueries({ queryKey: cityKeys.leaderboard("all").slice(0, 3) });
    },
    [queryClient],
  );
}

/**
 * Bütün Şehir 2.0 eylemleri. Hata mesajları sunucudan (Türkçe) toast olarak
 * gösterilir (useAdminMutation → errorText). Başarı geri çağrıları ekranın
 * sahne komutlarını (inşaat, kutlama, odak) yollaması içindir.
 */
export function useCity2Actions(callbacks: {
  onLock?: (building: string) => void;
  onStage?: (building: string, title: string) => void;
  onStep?: (res: Awaited<ReturnType<typeof advanceCity2Step>>) => void;
  onLandmark?: (res: Awaited<ReturnType<typeof buyCity2Landmark>>) => void;
  onPlace?: (res: Awaited<ReturnType<typeof placeCity2Landmark>>, slot: string | null) => void;
} = {}) {
  const write = useCity2Write();
  const lock = useAdminMutation((v: { building: string; lock: string }) => buyCity2Lock(v.building, v.lock), {
    success: (res) => `${res.lock.title} açıldı`,
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onLock?.(res.building);
    },
  });
  const stage = useAdminMutation((building: string) => buildCity2Stage(building), {
    success: (res) => `${res.stage.title} hazır!`,
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onStage?.(res.building, res.stage.title);
    },
  });
  const step = useAdminMutation((pay?: boolean) => advanceCity2Step(pay), {
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onStep?.(res);
    },
  });
  const landmark = useAdminMutation((key: string) => buyCity2Landmark(key), {
    success: "Sembol yapı depona eklendi",
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onLandmark?.(res);
    },
  });
  const place = useAdminMutation((body: { id?: string; key?: string; slot: string | null }) => placeCity2Landmark(body), {
    success: (_res, vars) => (vars.slot ? "Yerleştirildi" : "Depoya kaldırıldı"),
    onSuccess: (res, vars) => {
      write(res.city2);
      callbacks.onPlace?.(res, vars.slot);
    },
  });
  const busy = lock.isPending || stage.isPending || step.isPending || landmark.isPending || place.isPending;
  return { lock, stage, step, landmark, place, busy };
}
