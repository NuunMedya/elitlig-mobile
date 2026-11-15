/**
 * PENALTI — Lig Yolu oyun modülü (bölümlü seri penaltı, WebView).
 * Bölüm tablosu lib/puzzle/levels/penalti.ts (games/penalti.js ile aynı).
 * Güçlendirici anahtarları: nisan (canlı ya da bölüm öncesi), ek_sut (bölüm öncesi).
 */

import { goalSummary } from "@/lib/puzzle/levels/penalti";
import type { PuzzleGameModule } from "@/lib/puzzle/types";

import { PenaltiGame } from "./PenaltiGame";

export const penaltiModule: PuzzleGameModule = {
  key: "penalti",
  title: "Penaltı",
  tagline: "Bölüm bölüm kalecileri, barajı ve rüzgârı geç",
  icon: "football",
  tone: "win",
  boosters: [
    {
      key: "ek_sut",
      title: "Ek Şut",
      description: "+1 şut. Seri penaltıda kaçırdığın ilk atışı yeniden atarsın.",
      icon: "add-circle",
      kind: "pre",
    },
    {
      key: "nisan",
      title: "Nişan Dürbünü",
      description: "Bu bölümde yeşil bölge genişler, topun rüzgârlı gerçek yolu görünür; gece ve sis perdesi kalkar.",
      icon: "locate",
      kind: "live",
    },
  ],
  goalSummary,
  Game: PenaltiGame,
  fullBleed: true,
};
