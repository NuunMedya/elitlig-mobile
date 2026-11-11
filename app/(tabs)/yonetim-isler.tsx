/**
 * YÖNETİM MODU ▸ İŞLER — Yapılacaklar uygulaması alt menüde sekme olarak.
 *
 * Ekranın kendisi app/yonetim/gorevler.tsx'tir (yığında `/yonetim/gorevler`
 * olarak da açılır); burada yalnız "sekme kökü" bağlamı verilir ki geri
 * düğmesi çizilmesin.
 */

import TodosScreen from "@/app/yonetim/gorevler";
import { AdminTabRootContext } from "@/providers/AdminModeProvider";

export default function AdminTodosTab() {
  return (
    <AdminTabRootContext.Provider value>
      <TodosScreen />
    </AdminTabRootContext.Provider>
  );
}
