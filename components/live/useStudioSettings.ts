/**
 * Stüdyo ayarlarını cihazdan yükler ve değişince (kısa gecikmeyle) geri yazar.
 * Yükleme bitene kadar varsayılanlar geçerlidir; `ready` true olmadan yazılmaz
 * (varsayılanlar kayıtlı ayarın üstüne binmesin).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_SETTINGS, loadStudioSettings, saveStudioSettings, type StudioSettings } from "@/lib/live/studioSettings";

export function useStudioSettings() {
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<StudioSettings | null>(null);

  useEffect(() => {
    let alive = true;
    void loadStudioSettings().then((loaded) => {
      if (!alive) return;
      // Yükleme sürerken yapılan değişiklikler korunur.
      setSettings((current) => (current === DEFAULT_SETTINGS ? loaded : { ...loaded, ...diff(current) }));
      setReady(true);
    });
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) void saveStudioSettings(pending.current);
    };
  }, []);

  const change = useCallback((patch: Partial<StudioSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (pending.current) void saveStudioSettings(pending.current);
        pending.current = null;
      }, 500);
      return next;
    });
  }, []);

  return { settings, change, ready };
}

/** Varsayılandan farklı alanlar (yükleme bitmeden yapılan değişiklikler). */
function diff(current: StudioSettings): Partial<StudioSettings> {
  const out: Partial<StudioSettings> = {};
  for (const key of Object.keys(current) as (keyof StudioSettings)[]) {
    if (current[key] !== DEFAULT_SETTINGS[key]) Object.assign(out, { [key]: current[key] });
  }
  return out;
}
