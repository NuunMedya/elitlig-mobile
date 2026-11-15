/**
 * Bir oyunun canı — tek kanca: girişliyse sunucu profili (`lives_by_game`,
 * çevrimdışıyken cihaz aynası), misafirse cihazdaki canlar (localLives).
 * `tracked:false`: eski sunucu bu oyunun canını tutmuyor → kapı yok.
 */

import { useAuth } from "@/providers/AuthProvider";

import { livesFor, type LifeGameKey, type PuzzleProfile } from "./api";
import { useLocalLives } from "./localLives";
import { useLifeCountdown, usePuzzleMe } from "./usePuzzle";

export interface GameLives {
  lives: number;
  max: number;
  /** "12:05" sıradaki cana kalan; dolu ise "Dolu"; sayaç yoksa null. */
  label: string | null;
  tracked: boolean;
  signedIn: boolean;
  /** Bu oyunun görünümüyle profil (reklamla can, can doldurma). */
  profile: PuzzleProfile | undefined;
}

export function useGameLives(game: LifeGameKey | null | undefined): GameLives {
  const auth = useAuth();
  const signedIn = Boolean(auth.user);
  const me = usePuzzleMe().data;
  const profile = livesFor(me?.profile, game);
  const tracked = Boolean(game && me?.profile.lives_by_game?.[game]);
  const countdown = useLifeCountdown(tracked ? profile : undefined);
  const local = useLocalLives(signedIn ? null : game);
  if (!signedIn) {
    return { lives: local.lives, max: local.max, label: local.label ?? (local.lives >= local.max ? "Dolu" : null), tracked: Boolean(game), signedIn, profile: undefined };
  }
  const max = profile?.max_lives ?? 5;
  if (!tracked) return { lives: max, max, label: null, tracked: false, signedIn, profile };
  return { lives: countdown.lives, max, label: countdown.label, tracked: true, signedIn, profile };
}
