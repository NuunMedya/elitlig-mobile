/**
 * YÖNETİM PANELİ — `/yonetim`. Yönetim ana ekranının yığın (geri düğmeli)
 * hâli; içerik `components/admin/home/AdminHome` ile yönetim modunun "Panel"
 * sekmesinde (app/(tabs)/yonetim-panel.tsx) AYNI bileşendir.
 */

import { AdminHome } from "@/components/admin/home/AdminHome";

export default function AdminHomeScreen() {
  return <AdminHome />;
}
