import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { toIsoDate } from "@/components/scores/scoreUtils";

/**
 * Bugünün "YYYY-MM-DD" anahtarı; gece yarısı ve uygulama ön plana dönünce
 * yenilenir. Eskiden ekran ömründe bir kez hesaplanıyordu: gece açık kalan
 * ya da günlerce arka planda bekleyen uygulamada "Bugün" dünü gösteriyordu.
 */
export function useTodayIso(): string {
  const [today, setToday] = useState(() => toIsoDate(new Date()));

  useEffect(() => {
    const refresh = () => setToday((prev) => {
      const next = toIsoDate(new Date());
      return next === prev ? prev : next;
    });
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime());
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [today]);

  return today;
}
