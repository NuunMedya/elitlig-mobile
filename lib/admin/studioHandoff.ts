/**
 * Stüdyo ana ekranı ↔ Maç oluştur arasında tek seferlik el değiştirme.
 *
 * Stüdyodan açılan "Yeni maç" ekranı kaydı bitirince stüdyoya GERİ döner
 * (yeni bir stüdyo ekranı açmaz). Yeni maçın kimliği buraya bırakılır; stüdyo
 * odağa gelince alır, listeyi tazeler ve maçı seçili gösterir.
 */

let pendingMatchId: number | null = null;

export function leaveStudioMatch(id: number) {
  pendingMatchId = id;
}

/** Bekleyen maç kimliğini verir ve temizler. */
export function takeStudioMatch(): number | null {
  const id = pendingMatchId;
  pendingMatchId = null;
  return id;
}
