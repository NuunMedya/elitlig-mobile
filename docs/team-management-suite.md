
## Yoklama ↔ maç kadrosu eşitlemesi (ek)

- Grup adı ve kart başlığı yalnızca `gg.aa.yyyy SS:DD` biçiminde tarih/saat taşır.
- `PUT /api/match-center/team/matches/:id/plan` kaydedilince yoklama listesi planla eşitlenir: plandan çıkan oyuncu gruptan alınır, plana giren gruba eklenir; kart AS / YEDEK, saha yuvası (`slot`, `line`), forma numarası ve kaptan bilgisiyle yenilenir (`attendance.formation`, `players[].role`).
- Karttan düzenleme (yalnız yoklamayı kuran yönetici, `attendance.manager_user_id`):
  - `POST /api/match-center/team/matches/:id/attendance/players { player_ids }` — plana yedek olarak eklenir, gruba alınır.
  - `DELETE /api/match-center/team/matches/:id/attendance/players/:playerId` — plandan düşer, gruptan alınır.

## Mobil kulüp yönetimi — gezinme ve derin bağlantılar

- **Kulübüm** sekmesi giriş kapısıdır; hesap birden fazla role sahipse üstte
  rol sekmeleri durur (`/kulubum?rol=takim|kariyer|yonetim`). Her rol aynı
  sırayı izler: kimlik kartı → "Şimdi ilgilen" (bekleyen işler, aciliyete
  göre) → sıradaki maç → araç ızgarası → takip edilen takımlar.
- **Kulüp Paneli** (`/takimim`) aynı sinyallerin tam dökümüdür; ikisi tek veri
  kancasını paylaşır (`components/club/useClubSignals.ts`).
- **Kadro** (`/takimim/kadro`): sekmeler Kadro · Diziliş · Transfer · Sezon
  kadrosu (`?gorunum=`); hızlı süzgeç `?filtre=sozlesmesiz|hesapsiz|numarasiz|mevkisiz`.
- **Maç kadrosu** (`/takimim/mac/:id`): sekmeler Kadro · Yoklama · Rakip analizi
  (`?sekme=kadro|yoklama|analiz`).
