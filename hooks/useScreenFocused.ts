/**
 * Ekran şu an odakta mı (görünen sekme / yığının tepesi)?
 *
 * NEDEN: sekme ekranları başka sekmeye geçildiğinde de MOUNT kalır
 * (app/(tabs)/_layout.tsx); içlerindeki refetchInterval'lar kimse bakmazken
 * sunucuya istek atmaya devam ediyordu. Yoklama aralıkları bu bayrakla
 * kapatılır. expo-router `useIsFocused` dışa vermediği için kodda zaten
 * kullanılan `useFocusEffect` üstüne kurulur.
 */

import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useState } from "react";

export function useScreenFocused(): boolean {
  const navigation = useNavigation();
  // İlk değer gezginden okunur: odak dışında mount edilen ekran yoklama başlatmaz.
  const [focused, setFocused] = useState(() => navigation.isFocused());

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  return focused;
}
