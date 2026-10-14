
## Yoklama ↔ maç kadrosu eşitlemesi (ek)

- Grup adı ve kart başlığı yalnızca `gg.aa.yyyy SS:DD` biçiminde tarih/saat taşır.
- `PUT /api/match-center/team/matches/:id/plan` kaydedilince yoklama listesi planla eşitlenir: plandan çıkan oyuncu gruptan alınır, plana giren gruba eklenir; kart AS / YEDEK, saha yuvası (`slot`, `line`), forma numarası ve kaptan bilgisiyle yenilenir (`attendance.formation`, `players[].role`).
- Karttan düzenleme (yalnız yoklamayı kuran yönetici, `attendance.manager_user_id`):
  - `POST /api/match-center/team/matches/:id/attendance/players { player_ids }` — plana yedek olarak eklenir, gruba alınır.
  - `DELETE /api/match-center/team/matches/:id/attendance/players/:playerId` — plandan düşer, gruptan alınır.

## Mobil kulüp yönetimi — gezinme ve derin bağlantılar

- **Yönetim** sekmesi (`/kulubum`) TEK kulüp panelidir; hesap birden fazla
  role sahipse üstte rol sekmeleri durur (`?rol=takim|oyuncu|lig` →
  Kulübüm · Kariyerim · Lig). Tasarım `components/club/Panel.tsx` kitiyle
  kurulur (10px bölüm etiketi, 13px satır, beyaz kart + kıl çizgisi).
  - Kulübüm: kimlik satırı → araçlar → **Maç hazırlığı** (yoklama · maç
    kadrosu · analiz adımları, gerçek veriden durum ve hazırlık yüzdesi) →
    yapılacaklar (tamamı) → kadro dengesi → sezon ve kasa.
  - Kariyerim: kimlik satırı → araçlar → sıradaki maç + "geliyor musun?" →
    yapılacaklar → değişiklik taleplerim → sezonum → son maçlarım.
- **`/takimim`** artık yalnız `/kulubum?rol=takim`'a yönlendirir;
  **`/oyuncum`** Özet sekmesini kaybetti (Maçlarım · İstatistik · Sözleşme),
  `?tab=ozet` ve sekmesiz açılış `/kulubum?rol=oyuncu`'ya gider. İkinci bir
  panel ekranı yoktur.
- **Kadro** (`/takimim/kadro`): sekmeler Kadro · Diziliş · Transfer · Sezon
  kadrosu (`?gorunum=`); hızlı süzgeç `?filtre=sozlesmesiz|hesapsiz|numarasiz|mevkisiz`.
- **Maç kadrosu** (`/takimim/mac/:id`): sekmeler Kadro · Yoklama · Rakip analizi
  (`?sekme=kadro|yoklama|analiz`). Kadro kaydedilince ekran kapanmaz, analiz
  sekmesine geçer. Analizin başında **taktik simülasyonu** durur: üç senaryo
  (Dengeli · Hücum · Savunma) paralel hesaplanır, yan yana tabloda kazanma /
  beraberlik / kaybetme, tahmini skor ve beklenen puan (3G+B) gösterilir; en
  yüksek beklenen puan "Önerilen" rozetini alır. Seçili senaryonun etkenleri
  (ev sahipliği, kadro tamlığı, form, ikili geçmiş) sunucunun `factors`
  alanından listelenir.
