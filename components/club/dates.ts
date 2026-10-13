/**
 * Sözleşme tarihleri YILLI yazılır: "30 Haz 2027".
 *
 * NEDEN AYRI: `formatDateShort` ("30 Haz") maç listeleri için doğru — maç bu
 * sezonun içindedir. Sözleşme bitişi ise çoğu zaman gelecek yıldadır; yılsız
 * "30 Haz" oyuncuya "bu yaz mı, gelecek yaz mı?" sorusunu açık bırakıyordu.
 */
export function formatDateWithYear(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}
