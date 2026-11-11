/**
 * GOL VİDEOSU OYNATICI — oyuncu profili ve maç sayfası için.
 *
 * Klip listesini tam ekran oynatıcıya (VideoPlayerModal) çevirir: birden çok
 * klip varsa önceki/sonraki ve altta sıra şeridi; klip sesiyle başlar,
 * kısa olduğu için döngüde oynar.
 */

import React, { useMemo } from "react";

import { clipLabel, type GoalClip } from "@/lib/live/clips";

import { VideoPlayerModal, type PlayerItem } from "./VideoPlayerModal";

export interface GoalClipPlayerProps {
  clips: GoalClip[];
  /** Açılışta gösterilecek klip (yoksa ilki). */
  initialId?: number | null;
  visible: boolean;
  onClose: () => void;
  /** Başlık altı (ör. "Ankara Gençlikspor 3–1 Karadeniz FK"). */
  subtitle?: string | null;
  /** Klibin altında gösterilecek ad (ör. golcünün adı). */
  nameFor?: (clip: GoalClip) => string | null;
}

const isPlayable = (url: unknown): boolean => /^https?:\/\//i.test(String(url ?? ""));

export function GoalClipPlayer({ clips, initialId, visible, onClose, subtitle, nameFor }: GoalClipPlayerProps) {
  const items: PlayerItem[] = useMemo(
    () =>
      clips
        .filter((clip) => isPlayable(clip.url))
        .map((clip) => {
          const name = nameFor?.(clip) ?? null;
          return {
            id: clip.id,
            url: clip.url,
            poster: isPlayable(clip.poster_url) ? clip.poster_url : null,
            title: name ? `${clipLabel(clip)} · ${name}` : clipLabel(clip),
            subtitle: subtitle ?? (matchTitle(clip) || null),
            chip: clipLabel(clip),
            width: clip.width,
            height: clip.height,
          };
        }),
    [clips, nameFor, subtitle],
  );
  const at = initialId != null ? items.findIndex((item) => item.id === initialId) : -1;

  return (
    <VideoPlayerModal
      visible={visible}
      onClose={onClose}
      items={items}
      initialIndex={at >= 0 ? at : 0}
      heading="Gol videosu"
      loop
    />
  );
}

function matchTitle(clip: GoalClip): string {
  const m = clip.match;
  if (!m) return "";
  const score = m.home_team_score != null && m.away_team_score != null ? ` ${m.home_team_score}–${m.away_team_score} ` : " – ";
  return `${m.home_team_name ?? "Ev sahibi"}${score}${m.away_team_name ?? "Deplasman"}`;
}
