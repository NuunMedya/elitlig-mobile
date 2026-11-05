/**
 * STADYUM KANTİNİ — Lig Yolu oyun modülü (sipariş / servis bulmacası).
 * Güçlendirici anahtarları sunucuyla birebir: tezgah, sure, hizli.
 */

import { KANTIN_EXTRA_TIME, kantinItemCount, kantinLevel } from "@/lib/puzzle/levels/kantin";
import type { PuzzleGameModule, PuzzleGoalSummary } from "@/lib/puzzle/types";

import { KantinGame } from "./KantinGame";

function goalSummary(level: number): PuzzleGoalSummary {
  const lv = kantinLevel(level);
  const vip = lv.orders.filter((o) => o.vip).length;
  const locks = lv.stacks.flat().filter((it) => it.lock > 0).length;
  const crates = lv.stacks.filter((s) => s.some((it) => it.crate)).length;
  const goals: PuzzleGoalSummary["goals"] = [{ icon: "restaurant", label: "Siparişleri hazırla", count: lv.orders.length }];
  if (vip) goals.push({ icon: "star", label: "VIP taraftarı bekletme", count: vip });
  if (locks) goals.push({ icon: "lock-closed", label: "Kilitli kutuları aç", count: locks });
  if (crates) goals.push({ icon: "cube", label: "İki katlı yığın", count: crates });
  const limit =
    lv.timeLimit > 0
      ? `${Math.floor(lv.timeLimit / 60)}:${String(lv.timeLimit % 60).padStart(2, "0")}`
      : `${lv.orders.length} sipariş · ${kantinItemCount(lv)} ürün`;
  return {
    limit,
    goals,
    badge: lv.cup ? "Kupa maçı" : lv.breather ? "Nefes" : null,
    tip: lv.tip,
  };
}

export const kantinModule: PuzzleGameModule = {
  key: "kantin",
  title: "Stadyum Kantini",
  tagline: "Taraftarların siparişini doğru sırayla hazırla",
  icon: "fast-food",
  tone: "warn",
  boosters: [
    {
      key: "tezgah",
      title: "Ek Tezgâh",
      description: "Bekleme tezgâhına 2 yuva ekler.",
      icon: "file-tray-stacked",
      kind: "pre",
    },
    {
      key: "sure",
      title: "Ek Süre",
      description: `Süreli seviyelerde +${KANTIN_EXTRA_TIME} saniye.`,
      icon: "time",
      kind: "pre",
    },
    {
      key: "hizli",
      title: "Hızlı Servis",
      description: "Tamamlanmaya en yakın tabağı anında doldurur: eksikler tezgâhtan ya da yığınların içinden çekilir.",
      icon: "flash",
      kind: "live",
    },
  ],
  goalSummary,
  Game: KantinGame,
};
