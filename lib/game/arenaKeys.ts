/**
 * Arena oyunlarının cihazdaki kişisel rekor anahtarları.
 *
 * Oyun ekranları ve `(tabs)/oyunlar.tsx` aynı anahtarı okur; tek kaynak
 * burasıdır. v3: oyunlar yeniden yazıldı ve skor PUAN oldu — eski sürümlerin
 * (gol sayısı, metre) rekorları yeni ölçekle kıyaslanamaz, taşınmaz.
 */
export const ARENA_BEST_KEYS = {
  penalti: "elitlig.penalti.best.v3",
  slalom: "elitlig.slalom.best.v3",
  sektir: "elitlig.sektir.best.v3",
} as const;
