/**
 * ESKİ KULÜP PANELİ ROTASI (`/takimim`) — artık yalnız yönlendirmedir.
 *
 * Kulüp paneli tek yerdedir: Yönetim sekmesi ▸ Kulübüm (`/kulubum?rol=takim`).
 * Eskiden burada aynı kimlik, aynı "şimdi ilgilen" listesi ve aynı maç kartı
 * ikinci kez çiziliyordu. Bildirimler ve eski derin bağlantılar bu rotayı
 * açmaya devam edebilsin diye dosya korunur. Alt rotalar (kadro, maç merkezi,
 * maç al, kasa, maç kadrosu) olduğu gibi çalışır.
 */

import { Redirect } from "expo-router";

export default function ClubPanelRedirect() {
  return <Redirect href="/kulubum?rol=takim" />;
}
