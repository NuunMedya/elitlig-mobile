/**
 * HeaderTone — başlık bloğunun yüzeyini içindeki denetimlere bildirir.
 *
 * Arena dilinde sekme kökleri KÂĞIT başlıkla (açık zemin, koyu metin), kimlik
 * taşıyan detay sayfaları SAHNE başlıkla (grafit zemin, beyaz metin) açılır.
 * Başlığın içine verilen `Tabs` ve `ScopeChip` hangi yüzeyde durduklarını
 * buradan okur; ekranların tek tek `tone` geçmesi gerekmez.
 */

import { createContext, useContext } from "react";

export type HeaderTone = "ink" | "paper";

export const HeaderToneContext = createContext<HeaderTone | null>(null);

/** Bağlam yoksa (başlık dışında) `fallback` döner. */
export function useHeaderTone(fallback: HeaderTone): HeaderTone {
  return useContext(HeaderToneContext) ?? fallback;
}
