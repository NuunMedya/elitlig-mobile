import type { Match } from "./types";

/**
 * API katmanı.
 *
 * Node.js backend'iniz hazır olduğunda API_URL'i gerçek adrese çevirin ve
 * USE_MOCK'u false yapın. Ekranlar sadece bu dosyadaki fonksiyonları
 * kullandığı için başka hiçbir yerde değişiklik gerekmez.
 *
 * Not: Geliştirme sırasında telefondan localhost'a erişmek için
 * bilgisayarınızın yerel IP'sini kullanın (ör. http://192.168.1.20:3000).
 */
const API_URL = "https://elitlig.com/api";
const USE_MOCK = true;

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`İstek başarısız: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function getMatches(): Promise<Match[]> {
  if (USE_MOCK) return mockMatches();
  return request<Match[]>("/matches");
}

// ---------------------------------------------------------------------------
// Mock veri — backend bağlanana kadar ekranı canlı tutar.
// ---------------------------------------------------------------------------

function mockMatches(): Promise<Match[]> {
  const today = new Date();
  const at = (h: number, m = 0) => {
    const d = new Date(today);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const team = (id: string, name: string, shortName: string) => ({
    id,
    name,
    shortName,
  });

  const matches: Match[] = [
    {
      id: "m1",
      league: "İzmir Elit Ligi — A Grubu",
      status: "live",
      minute: 38,
      kickoffAt: at(20, 0),
      home: team("t1", "Galaktik SK", "GALAKTİK"),
      away: team("t2", "Yıldırım United", "YILDIRIM"),
      homeScore: 3,
      awayScore: 2,
      streamUrl: "https://elitlig.com/yayin/m1",
    },
    {
      id: "m2",
      league: "İzmir Elit Ligi — A Grubu",
      status: "scheduled",
      kickoffAt: at(21, 0),
      home: team("t3", "Kartal Gücü", "KARTAL"),
      away: team("t4", "Efsane 05", "EFSANE"),
      homeScore: null,
      awayScore: null,
    },
    {
      id: "m3",
      league: "İstanbul Avrupa Ligi — B Grubu",
      status: "scheduled",
      kickoffAt: at(22, 0),
      home: team("t5", "Boğaz FK", "BOĞAZ"),
      away: team("t6", "Şimşekler", "ŞİMŞEK"),
      homeScore: null,
      awayScore: null,
    },
    {
      id: "m4",
      league: "İzmir Elit Ligi — A Grubu",
      status: "finished",
      kickoffAt: at(18, 30),
      home: team("t7", "Deplasman 35", "DEP35"),
      away: team("t8", "Roket SK", "ROKET"),
      homeScore: 1,
      awayScore: 4,
    },
    {
      id: "m5",
      league: "İstanbul Avrupa Ligi — B Grubu",
      status: "finished",
      kickoffAt: at(19, 0),
      home: team("t9", "Anadolu Yıldızları", "ANADOLU"),
      away: team("t10", "Fırtına 34", "FIRTINA"),
      homeScore: 2,
      awayScore: 2,
    },
  ];

  // Ağ gecikmesini taklit et
  return new Promise((resolve) => setTimeout(() => resolve(matches), 400));
}
