/**
 * KÖK ROTA — "/" yalnız yönlendirmedir.
 *
 * Üye uygulaması Maçlar (skorlar) ile, YÖNETİM MODU Panel ile açılır.
 * Mod tercihi okunana kadar hiçbir şey çizilmez (yanlış sekmeye kısa bir
 * sıçrama olmasın).
 */

import { Redirect } from "expo-router";

import { ADMIN_HOME, MEMBER_HOME, useAdminMode } from "@/providers/AdminModeProvider";

export default function HomeRedirect() {
  const mode = useAdminMode();
  if (!mode.ready) return null;
  return <Redirect href={mode.adminActive ? ADMIN_HOME : MEMBER_HOME} />;
}
