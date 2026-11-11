
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
  - Kulübüm (`components/club/home/ClubHome`): kahraman → **şimdi ilgilen** →
    **sıradaki maç + hazırlık** → **kısayollar** (Kadro · Maç kadrosu · Maç al ·
    Teklifler · Kasa · Teklif ver; her karo gerçek veriden durum satırı ve
    rozet taşır) → **tüm araçlar** (Maç · Kadro ve transfer · Kulüp · İletişim;
    açık ızgara, katlama yok) → kadro dengesi · kasa · gol katkısı → **kulüp
    ayarları** (yönetim yetkisi, bildirim tercihleri, profil modları, hesap).
  - Kariyerim (`components/career/home/CareerHome`): kahraman → şimdi ilgilen →
    sıradaki maç + "geliyor musun?" → kısayollar (Tekliflerim · Sözleşmelerim ·
    İstatistik · Profilim · Maçlarım · Davetler) → tüm araçlar → sezonum · son
    performans · takımım → **oyuncu ayarları**.
  - Roller PROFİL MODLARINA uyar (`useClubSignals`): oturumdaki çözülmüş
    `profile_type` hangi sekmenin açık olduğunu belirler; "Oyuncu modu" kapalı
    üye `player_id` taşısa da Kariyerim'i görmez. Hiçbir role bağlı olmayan
    üye `JoinFlow`da hesabını bağlama adımlarını ve bekleyen taleplerinin
    durumunu görür.
  - Ortak parçalar: `components/club/home/ToolBoard` (`ShortcutGrid`,
    `ToolBoard`), `HomeSkeleton`; bölümler `Reveal` ile kademeli girer.
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
