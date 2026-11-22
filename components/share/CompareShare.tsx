/**
 * Karşılaştırma ekranlarının paylaşım girişi — oyuncu karşılaştırma
 * (`app/oyuncu-karsilastir.tsx`) ve takım H2H (`app/h2h.tsx`).
 *
 *   Karşılaştırma — Düello · Radar · Kim önde?
 *   Geçmiş        — Kafa kafaya (takımlar; aralarında bitmiş maç varsa)
 *
 * Metrikler ekranın kendi hesapladığı satırlardır; burada yeniden
 * hesaplanmaz. Ekran hangi sırayla gösteriyorsa görsel de o sırayla çizer.
 */

import React, { useMemo } from "react";

import { useScope } from "@/providers/ScopeProvider";
import { instagramHandle } from "./MatchShare";
import { ShareStudio } from "./ShareStudio";
import { compareTemplates, type CompareShareData } from "./templates/compare";

export type { CompareMeeting, CompareMetric, CompareSide } from "./templates/compare";

export interface CompareShareProps {
  visible: boolean;
  onClose: () => void;
  data: Omit<CompareShareData, "league" | "season" | "city" | "footer"> & {
    league?: string | null;
    season?: string | null;
    city?: string | null;
  };
}

export function CompareShare({ visible, onClose, data }: CompareShareProps) {
  const scope = useScope();
  const templates = useMemo(() => {
    const city = data.city ?? scope.cityLabel ?? null;
    return compareTemplates({
      ...data,
      league: data.league ?? (scope.leagueLabel || null),
      season: data.season ?? (scope.seasonLabel || null),
      city,
      footer: instagramHandle(city) ?? city,
    });
  }, [data, scope.cityLabel, scope.leagueLabel, scope.seasonLabel]);

  return (
    <ShareStudio
      visible={visible}
      onClose={onClose}
      title={data.kind === "player" ? "Oyuncu karşılaştırması" : "Takım karşılaştırması"}
      subtitle={`${data.a.name} – ${data.b.name}`}
      templates={templates}
      fileParts={[data.kind === "player" ? "oyuncu-karsilastirma" : "takim-karsilastirma", data.a.name, data.b.name]}
      status={templates.length ? null : { kind: "empty", message: "Karşılaştırılacak rakam henüz yok." }}
    />
  );
}
