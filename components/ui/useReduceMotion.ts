/**
 * Sistem "Hareketi azalt" ayarı — animasyonlu her bileşenin tek kaynağı.
 *
 * `LiveBadge.tsx` geriye dönük uyum için bunu yeniden dışa aktarır; yeni kod
 * `@/components/ui` üzerinden `useReduceMotion` alır.
 */

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setOn(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return on;
}
