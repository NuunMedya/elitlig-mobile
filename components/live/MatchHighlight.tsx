/**
 * Maç sayfası — "Maç özeti" videosu. Yayın stüdyosunda maçın tekrarlarından
 * üretilip yüklenir (GET /maclar/:id → highlight). Önce kapak görseli ve
 * oynat düğmesi çizilir; dokununca oynatıcı yüklenir (veri harcamasın diye).
 */

import React from "react";

import { formatDuration } from "@/lib/matchMedia";

import { VideoCard } from "./VideoCard";

export interface MatchHighlightProps {
  highlight: { url: string; poster_url: string | null; duration_ms: number | null } | null | undefined;
}

export function MatchHighlight({ highlight }: MatchHighlightProps) {
  if (!highlight?.url || !/^https?:\/\//i.test(highlight.url)) return null;
  const duration = formatDuration(highlight.duration_ms);
  return (
    <VideoCard
      title="Maç özeti"
      meta="Maçın en önemli anları"
      url={highlight.url}
      posterUrl={highlight.poster_url}
      cta="Özeti izle"
      accessibilityLabel="Maç özetini izle"
      badge="MAÇ ÖZETİ"
      badgeTone="gold"
      corner={duration}
    />
  );
}
