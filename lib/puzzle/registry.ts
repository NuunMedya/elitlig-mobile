/**
 * LİG YOLU OYUN KAYDI — her oyun modülü burada bir kez anılır.
 * Yeni oyun: components/puzzle/games/<anahtar>/ + buraya bir satır +
 * sunucu rules.js GAMES/BOOSTERS.
 */
import { kadroModule } from "@/components/puzzle/games/kadro";
import { kantinModule } from "@/components/puzzle/games/kantin";
import { kariyerModule } from "@/components/puzzle/games/kariyer";
import { penaltiModule } from "@/components/puzzle/games/penalti";
import { savunmaModule } from "@/components/puzzle/games/savunma";
import { soyunmaModule } from "@/components/puzzle/games/soyunma";
import { ucleModule } from "@/components/puzzle/games/ucle";
import { ucluModule } from "@/components/puzzle/games/uclu";

import type { PuzzleGameKey, PuzzleGameModule } from "./types";

// Bölümlü arcade (sözleşme §1): Penaltı, Kadro Koşusu, Savunma Hattı, Kariyer Yolu — WebView bölüm modu.
export const PUZZLE_GAMES: readonly PuzzleGameModule[] = [kariyerModule, ucluModule, ucleModule, soyunmaModule, kantinModule, penaltiModule, kadroModule, savunmaModule];

const BY_KEY = new Map<string, PuzzleGameModule>(PUZZLE_GAMES.map((m) => [m.key, m]));

export function puzzleGame(key: string | null | undefined): PuzzleGameModule | null {
  return key ? BY_KEY.get(key) ?? null : null;
}

export const isPuzzleGameKey = (key: string | null | undefined): key is PuzzleGameKey => Boolean(key && BY_KEY.has(key));
