/**
 * KARİYER YOLU — hesaba bağlı gelişim ve oyuncu kimliği.
 *
 * KİMLİK: üyenin gerçek oyuncu profili bağlıysa kariyer ONUNLA başlar (adı,
 * mevkisi ve hattına göre başlangıç özellikleri); bağlı değilse herkes aynı
 * çaylakla sıfırdan başlar.
 *
 * GELİŞİM: kazanılan her yıldız bir antrenman puanıdır. Yıldızlar sunucudadır
 * (/api/puzzle → games.kariyer.total_stars) ve hile yapılamaz; puanların HANGİ
 * özelliğe harcandığı hesabın oyun kaydında durur (lib/puzzle/saves, anahtar
 * `kariyer`: cihaz önbelleği + sunucu). Telefon değişse de dağılım korunur;
 * iki cihazda farklı dağılım varsa daha çok puan harcanmış olan kalır.
 * Eski cihaz anahtarı (`elitlig.kariyer.v1.<üye>`) ilk açılışta taşınır.
 */

import { ATTR_KEYS, applyGains, lineOfPosition, startingAttrs, type Attrs, type Line } from "./levels";

export interface KariyerIdentity {
  /** Gerçek oyuncu profili bağlı mı. */
  real: boolean;
  name: string;
  position: string | null;
  line: Line | null;
  image: string | null;
}

export interface KariyerSave {
  /** Harcanan antrenman puanı. */
  spent: number;
  /** Kartlardan gelen toplam kazanım. */
  gains: Attrs;
}

const EMPTY_GAINS: Attrs = { sut: 0, pas: 0, teknik: 0, hiz: 0 };
export const emptySave = (): KariyerSave => ({ spent: 0, gains: { ...EMPTY_GAINS } });

/** Kayıttan gelen ham veriyi güvenli biçime çevirir (yoksa boş kayıt). */
export function normalizeSave(raw: Partial<KariyerSave> | null | undefined): KariyerSave {
  if (!raw) return emptySave();
  const gains = { ...EMPTY_GAINS };
  for (const key of ATTR_KEYS) gains[key] = Math.max(0, Math.floor(Number(raw.gains?.[key]) || 0));
  return { spent: Math.max(0, Math.floor(Number(raw.spent) || 0)), gains };
}

export function identityOf(
  user: { fullName?: string | null; username: string; player_id?: number | null } | null,
  player: { player_name: string; player_position: string | null; player_img: string | null } | null,
): KariyerIdentity {
  if (user?.player_id && player) {
    return { real: true, name: player.player_name, position: player.player_position, line: lineOfPosition(player.player_position), image: player.player_img };
  }
  return { real: false, name: user?.fullName || user?.username || "Çaylak", position: null, line: null, image: null };
}

/** Güncel özellikler: başlangıç (hatta göre) + kart kazanımları (+ maçlık takviye). */
export function attrsOf(identity: KariyerIdentity, save: KariyerSave, boost = 0): Attrs {
  const base = applyGains(startingAttrs(identity.real ? identity.line : null), save.gains);
  return boost ? applyGains(base, { sut: boost, pas: boost, teknik: boost, hiz: boost }) : base;
}
