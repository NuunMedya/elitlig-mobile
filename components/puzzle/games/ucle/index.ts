import type { PuzzleGameModule, PuzzleGoalSummary } from "@/lib/puzzle/types";
import { generateUcleLevel, ucleLevelFacts } from "@/lib/puzzle/levels/ucle";
import { UcleGame } from "./UcleGame";

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Başlangıç penceresindeki kısıt ve hedefler — seviye üreticisinden okunur. */
function goalSummary(level: number): PuzzleGoalSummary {
  const lvl = generateUcleLevel(level);
  const f = ucleLevelFacts(lvl);
  const goals: PuzzleGoalSummary["goals"] = [{ icon: "layers", label: "Bütün karoları temizle", count: f.tiles }];
  if (f.locks) goals.push({ icon: "lock-closed", label: "Kilitleri anahtarla aç", count: f.locks });
  if (f.chains) goals.push({ icon: "link", label: "Zincirleri kopar", count: f.chains });
  if (f.hidden) goals.push({ icon: "help-circle", label: "Ters karoları aç", count: f.hidden });
  return {
    limit: lvl.timeLimit ? fmtTime(lvl.timeLimit) : `${f.tiles} karo · 7 raf`,
    goals,
    badge: lvl.cup ? "Kupa maçı" : null,
    tip: lvl.tip,
  };
}

export const ucleModule: PuzzleGameModule = {
  key: "ucle",
  title: "Üçle Kazan",
  tagline: "Kulüp armalarını rafa topla, aynı üçlüyü patlat, sahayı temizle.",
  icon: "layers",
  tone: "accent",
  boosters: [
    {
      key: "geri_al",
      title: "Geri Al",
      description: "Rafa giden son karoyu tahtadaki yerine geri koyar.",
      icon: "arrow-undo",
      kind: "live",
    },
    {
      key: "ipucu",
      title: "İpucu",
      description: "Raftaki çifti ya da tekliyi tamamlayan karoları bulur ve üçlüyü kendisi patlatır.",
      icon: "bulb",
      kind: "live",
    },
    {
      key: "raf",
      title: "Ek Raf",
      description: "Seviye boyunca rafa 8. hücreyi ekler.",
      icon: "file-tray-stacked",
      kind: "pre",
    },
  ],
  goalSummary,
  Game: UcleGame,
};
