/**
 * Dokunsal geri bildirim — tek gerçek kaynak `@/theme/motion` içindedir.
 *
 * Şartname bu yardımcıları `lib/haptics` yolundan çağırıyor; ayrı bir kopya
 * yazmak `enabled` bayrağını ikiye bölerdi (Ayarlar'dan kapatınca bir tanesi
 * açık kalırdı). Bu yüzden dosya yalnızca yeniden dışa aktarım yapar.
 */

export { haptics, setHapticsEnabled, isHapticsEnabled } from "@/theme/motion";
