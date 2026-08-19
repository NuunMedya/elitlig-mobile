/**
 * Refresh — projedeki TÜM listelerin ortak "aşağı çekip yenile" yapılandırması (§5.7).
 *
 * NEDEN ORTAK DOSYA: `RefreshControl` renkleri prop olarak verilir; her ekranda
 * elle yazıldığında biri `tintColor` (iOS), diğeri `colors` (Android) unutur ve
 * spinner platformun varsayılan mavisinde kalır. Burada tek yapılandırma var:
 * marka moru, Android'de `surface2` üstünde.
 *
 * MİNİMUM GÖRÜNÜRLÜK: önbellek sıcakken `refetch` 80ms'de döner ve spinner
 * kırpışır — kullanıcı "yenilendi mi?" diye tereddüt eder. `useMinimumVisible`
 * göstergeyi en az 450ms ekranda tutar; iş bitmiş olsa bile kullanıcı gördüğü
 * hareketle ikna olur.
 *
 * HAPTİK: yenilemeyi kullanıcı BAŞLATTIĞI için `select()` çalar; BAŞARILI
 * bitişte titreşim YOKTUR (sessiz başarı). Hata olursa liste yerinde kalır ve
 * üstte `ErrorState variant="banner"` gösterilir — bu kararı ekran verir.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, type RefreshControlProps } from "react-native";
import { colors, haptics } from "@/theme";

/** Tek doğru renk yapılandırması — iOS `tintColor`, Android `colors` ister. */
export const refreshTheme = {
  tintColor: colors.brandAccent,
  colors: [colors.brandAccent],
  progressBackgroundColor: colors.surface2,
  progressViewOffset: 0,
} as const;

/** Varsayılan en kısa görünürlük süresi (ms). */
const MIN_VISIBLE_MS = 450;

/**
 * Bir bayrağı en az `ms` boyunca açık tutar.
 * Hızlı dönen isteklerde göstergenin tek karelik yanıp sönmesini engeller.
 */
export function useMinimumVisible(active: boolean, ms: number = MIN_VISIBLE_MS): boolean {
  const [visible, setVisible] = useState(active);
  const startedAt = useRef(0);

  useEffect(() => {
    if (active) {
      startedAt.current = Date.now();
      setVisible(true);
      return undefined;
    }
    if (!visible) return undefined;

    const remaining = Math.max(0, ms - (Date.now() - startedAt.current));
    if (remaining === 0) {
      setVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [active, ms, visible]);

  return visible;
}

export interface RefreshProps {
  refreshing: boolean;
  onRefresh: () => void;
  /** Sabit başlık/bant altına kaydırmak için (px). */
  progressViewOffset?: number;
}

/** Hazır yapılandırılmış RefreshControl — doğrudan `refreshControl` prop'una verilir. */
export const Refresh = React.memo(function Refresh({
  refreshing,
  onRefresh,
  progressViewOffset = 0,
}: RefreshProps) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      progressViewOffset={progressViewOffset}
      tintColor={refreshTheme.tintColor}
      colors={[...refreshTheme.colors]}
      progressBackgroundColor={refreshTheme.progressBackgroundColor}
    />
  );
});

export interface UseRefreshOptions {
  /**
   * Dışarıdan yönetilen yenileme durumu (`query.isRefetching`). Verilirse
   * gösterge bunu izler; verilmezse kanca `onRefresh` sözünü kendisi bekler.
   */
  refreshing?: boolean;
  /** En kısa görünürlük — varsayılan 450ms. */
  minVisible?: number;
  /** Kullanıcı yenilemeyi başlattığında hafif seçim titreşimi (varsayılan açık). */
  haptic?: boolean;
  progressViewOffset?: number;
}

/**
 * Liste ekranlarının tek satırlık yenileme bağlantısı:
 *
 *   const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
 *   <FlatList refreshControl={refresh.control} … />
 */
export function useRefresh(
  onRefresh: () => unknown,
  options: UseRefreshOptions = {},
): { refreshing: boolean; onRefresh: () => void; control: React.ReactElement } {
  const { refreshing: controlled, minVisible = MIN_VISIBLE_MS, haptic = true, progressViewOffset = 0 } = options;

  const [internal, setInternal] = useState(false);
  const busy = useMinimumVisible(controlled ?? internal, minVisible);

  const handleRefresh = useCallback(() => {
    if (haptic) haptics.select();
    const result = onRefresh();
    // Dışarıdan durum yönetiliyorsa (react-query) kendi bayrağımızı açmayız.
    if (controlled !== undefined) return;
    setInternal(true);
    void Promise.resolve(result)
      .catch(() => {
        // Hata gösterimi ekranın işi (ErrorState banner); burada yutulur.
      })
      .finally(() => setInternal(false));
  }, [controlled, haptic, onRefresh]);

  const control = useMemo(
    () => (
      <Refresh
        refreshing={busy}
        onRefresh={handleRefresh}
        progressViewOffset={progressViewOffset}
      />
    ),
    [busy, handleRefresh, progressViewOffset],
  );

  return { refreshing: busy, onRefresh: handleRefresh, control };
}

/** Doğrudan `RefreshControl` yazmak isteyen ekranlar için hazır prop demeti. */
export function refreshControlProps(
  refreshing: boolean,
  onRefresh: () => void,
): Pick<
  RefreshControlProps,
  "refreshing" | "onRefresh" | "tintColor" | "colors" | "progressBackgroundColor"
> {
  return {
    refreshing,
    onRefresh,
    tintColor: refreshTheme.tintColor,
    colors: [...refreshTheme.colors],
    progressBackgroundColor: refreshTheme.progressBackgroundColor,
  };
}
