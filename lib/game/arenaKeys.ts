/**
 * Arena oyunlarının cihazdaki kişisel rekor anahtarları.
 *
 * Oyun ekranları ve `(tabs)/oyunlar.tsx` aynı anahtarı okur; tek kaynak
 * burasıdır. v3 (penaltı/slalom/sektir) ve v2 (Arena, Kim Bu?): oyunlar
 * yeniden yazıldı ve skor PUAN oldu — eski sürümlerin rekorları (gol sayısı,
 * metre, seri) yeni ölçekle kıyaslanamaz, taşınmaz.
 */
export const ARENA_BEST_KEYS = {
  penalti: "elitlig.penalti.best.v3",
  // v4: Slalom sonsuz koşuya dönüştü; eski kapı slalomunun rekoru taşınmaz.
  slalom: "elitlig.slalom.best.v4",
  sektir: "elitlig.sektir.best.v3",
  seri: "elitlig.arena.best.v2",
  kimbu: "elitlig.kimbu.best.v2",
  tahmin: "elitlig.tahmin.best.v1",
  savunma: "elitlig.savunma.best.v1",
  kadro: "elitlig.kadro.best.v1",
} as const;
