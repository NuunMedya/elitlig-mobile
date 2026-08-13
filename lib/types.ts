/**
 * Ortak veri tipleri.
 * İdeal olarak bu dosya web (React) projesiyle paylaşılan bir pakete taşınır,
 * böylece Node.js backend'in döndürdüğü şekiller tek yerde tanımlanır.
 */

export type MatchStatus = "scheduled" | "live" | "finished";

export interface Team {
  id: string;
  name: string;
  /** Kısa ad, skorbord için (ör. "GALAKTİK") */
  shortName: string;
  logoUrl?: string;
}

export interface Match {
  id: string;
  league: string; // ör. "İzmir Elit Ligi — A Grubu"
  status: MatchStatus;
  /** Canlı maçta geçen dakika */
  minute?: number;
  kickoffAt: string; // ISO tarih
  home: Team;
  away: Team;
  homeScore: number | null;
  awayScore: number | null;
  /** Spikerli canlı yayın linki varsa */
  streamUrl?: string;
}

export interface Standing {
  position: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalDiff: number;
  points: number;
}
