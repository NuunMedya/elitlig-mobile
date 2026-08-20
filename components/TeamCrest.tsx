/**
 * ESKİ KAPI — `components/ui` TeamLogo / Avatar üzerine ince uyumluluk katmanı.
 *
 * NEDEN DURUYOR: `TeamCrest` ve `PlayerAvatar` adları geçiş öncesi yazılmış
 * dosyalarda hâlâ içe aktarılıyor. Bu dosya artık kendi görselini ÇİZMEZ;
 * yalnız eski prop imzasını yenisine çevirir. Böylece amblem davranışı
 * (yedek baş harfler, hata sonrası yeniden deneme, memo'lu render) tek yerde —
 * `components/ui/TeamLogo.tsx` ve `components/ui/Avatar.tsx` içinde — yaşar.
 *
 * GÖRSEL SONUÇ: TeamLogo/Avatar ile BİREBİR aynıdır; köşe yarıçapı, yedek
 * metin rengi ve zemin artık yeni paletten gelir.
 *
 * YENİ KOD BU DOSYAYI KULLANMAZ:
 *   import { TeamLogo, Avatar } from "@/components/ui";
 * Son çağıran da geçtiğinde bu dosya silinecek.
 */

import { Avatar, TeamLogo } from "@/components/ui";

/** Takım amblemi — eski imza; içi `TeamLogo`. */
export function TeamCrest({
  name,
  logo,
  size = 36,
}: {
  name?: string | null;
  logo?: string | null;
  size?: number;
}) {
  return <TeamLogo name={name} logo={logo} size={size} />;
}

/** Oyuncu fotoğrafı — eski imza; içi `Avatar` (yuvarlak, halkasız). */
export function PlayerAvatar({
  name,
  image,
  size = 40,
}: {
  name?: string | null;
  image?: string | null;
  size?: number;
}) {
  return <Avatar name={name} image={image} size={size} />;
}
