# Panel API — giriş yapmış üyenin uçları

Mobil uygulamanın, web'deki Oyuncu Yönetimi panelinin verisini çekmek için kullanacağı uçların
dökümü. Yollar, kimlik doğrulama koşulları ve yanıt alan adları `elitlig-server` kaynağından
(`routes/` + `services/`) çıkarıldı.

İstek kökü: `lib/config.ts` → `API_BASE_URL`.

---

## 0. Kimlik doğrulama

`middleware/authenticate.js` iki kaynağı da okur: `authToken` çerezi **veya**
`Authorization: Bearer <token>`. Mobilde çerez olmadığı için Bearer kullanılır —
`lib/http.ts` bu başlığı ve 401 yakalamayı zaten kuruyor.

| Metot | Yol | Not |
| --- | --- | --- |
| `POST` | `/api/users/login` | Yanıt gövdesinde `token` ve `user` döner |
| `GET` | `/api/users/verify` | Oturum tazeleme → `{ user }`; pasif hesapta `403 ACCOUNT_INACTIVE` |
| `POST` | `/api/users/logout` | |

Ortak hatalar: `401 AUTH_REQUIRED`, `401 INVALID_TOKEN`, `401 INVALID_USER`.

**Panel uçlarında ikinci kapı var.** `/api/panel/*` altındaki her uç `panelRole`
middleware'inden geçer: rol `uye`, `oyuncu`, `takim_baskani` veya `double` olmalı.
Aksi halde `403 PANEL_FORBIDDEN`.

**Kapsam (scope).** Panel uçlarının çoğu `?scope=player|team` alır. Verilmezse üyenin profil
tipinden türetilir: yalnız takım profili varsa `team`, aksi halde `player`. `double` rolündeki
üyede bu parametreyi atlamak, oyuncu ekranına takım kayıtlarını karıştırır.

---

## 1. Oyuncu profilim / profil talepleri

Panel açılışının tek çağrısı `GET /api/panel/me`; özet ekranı için gereken pahalı sorgular
ayrı uca taşındı.

| Metot | Yol | Not |
| --- | --- | --- |
| `GET` | `/api/panel/me` | Profil kartı, sezon toplamları, son maçlar, mesaj önizlemesi, bekleyen değişiklikler, üyelik, onboarding |
| `GET` | `/api/panel/me/overview?scope=player\|team` | Özet ekranı: form, sıradaki maç, puan durumu, piyasa değeri, sayaçlar |
| `PATCH` | `/api/panel/me/player` | İzinli alanlar: `player_name, player_img, player_position, nationality, birth_date, city, city_id, phone, email` → `202 {message, change}` |
| `PATCH` | `/api/panel/me/team` | İzinli alanlar: `team_name, logo, city, city_id, founded_at, colors`. Takım başkanı değilse `403 TEAM_UPDATE_FORBIDDEN` |
| `POST` | `/api/panel/me/uploads/:kind` | `:kind = player\|team`, multipart alan adı `image` → `201 {url, message}` |
| `DELETE` | `/api/panel/me/changes/:id` | Onay bekleyen kendi talebini geri çeker |

Profil düzenlemeleri doğrudan yazmaz; hepsi `202` ile yönetici onayına düşer.

### `GET /api/panel/me` yanıt alanları

```
player       { id, player_name, player_img, player_position, nationality,
               birth_date, phone, email, city, city_id, team_id, active }
team         { id, team_name, logo, city, city_id, current_league,
               current_season, founded_at, colors, active }   // YÖNETİLEN takım
playerTeam   { ...aynı alanlar }   // oyuncunun OYNADIĞI takım — ayrı alan
stats        { matches, goals, assists, yellow_cards, red_cards,
               rating, starts, source, scope, season }
recentMatches[{ id, date, home_team, away_team, home_score, away_score }]  // son 3
messages     [{ id, sender, subject, preview, body, read, created_at }]    // son 30
pendingChanges[{ id, type, target_type, payload, status, created_at }]
membership   { ... }
capabilities { team, player }
profileType, profileScopes, profileTypes
sponsors     { team: [...], player: [...] },  sponsorSlotCount
onboarding   { team: { state, title, description, actions[] }, player: {...} }
```

### `GET /api/panel/me/overview?scope=player` yanıt alanları

```
scope: "player", linked: true
player      { id, name, image, position, city, nationality, birth_date }
team        { id, name, logo, league, season }
season      { id, name }
totals      { matches, starts, goals, assists, contributions,
              yellow_cards, red_cards, rating }
per_match   { goals, assists, contributions, start_ratio }
recent_form[{ match_id, date, opponent, score, result,
              goals, assists, rating, started }]
next_match  { id, date, time, field, is_home, opponent, opponent_team_id,
              goals_for, goals_against, score, result, status }
team_form  [ ...aynı maç biçimi ]
standings   { position, team_count, played, wins, draws, losses,
              goals_for, goals_against, goal_diff, points, last5 }
market_value{ current, currency }
contracts   { total, active: { status, start, end } }
offers      { active }
discipline  { total, open, pending_reviews }
```

`scope=team` farklı bir gövde döner: `squad{total, contracted, without_contract, season_roster}`,
`form{...}`, `recent_matches[]`, `top_contributors[]`, `pending_changes`.

### Hesap talepleri

Hepsi `routes/User.js` altında, auth ister ve `202 {message, request}` döner.

| Metot | Yol | Not |
| --- | --- | --- |
| `GET` | `/api/users/account-requests` | `{ requests: [...] }` |
| `DELETE` | `/api/users/account-requests/:id` | Bekleyen talebi geri çeker |
| `POST` | `/api/users/request-player-claim` | `{ playerId, note }` |
| `POST` | `/api/users/request-player-create` | Yeni oyuncu profili |
| `POST` | `/api/users/request-player-unlink` | Oyuncu bağlantısını koparma |
| `PUT` | `/api/users/request-team-management` | Mevcut takımın yetkisini isteme |
| `POST` | `/api/users/request-team-create` | Yeni takım |
| `POST` | `/api/users/request-team-resign` | Takımdan istifa |
| `POST` | `/api/users/request-team-transfer` | `{ targetUsername, note }` |
| `PATCH` | `/api/users/me` | `{ user }` |
| `PATCH` | `/api/users/me/profile-type` | `{ profileType }` → `{message, user, profileTypes}`; `409 TEAM_HANDOVER_REQUIRED` olabilir |
| `PATCH` | `/api/users/me/password` | `{ message }` |

---

## 2. Maçlarım

`routes/matchCenter.js` router seviyesinde `authenticate` uygular. Oyuncu, takımının *tüm*
maçlarını görür ama yalnızca kadroda yer aldıklarını değerlendirebilir.

| Metot | Yol | Not |
| --- | --- | --- |
| `GET` | `/api/match-center/matches` | Asıl "Maçlarım" ucu. Oyuncu profili yoksa `403 PLAYER_PROFILE_REQUIRED` |
| `PUT` | `/api/match-center/matches/:matchId/review` | → `{ message, review }` |
| `GET` | `/api/match-center/matches/:matchId/my-review` | → `{ review }`, kayıt yoksa `null` |
| `GET` | `/api/match-center/team/matches` | Takım başkanı görünümü → `{ upcoming, past }` |
| `GET` | `/api/match-center/team/matches/:matchId` | → `{ match, team_id, plan, lineup }` |
| `GET` | `/api/match-center/team/roster` | Kadro + `jersey_number, team_position, squad_role, lineup_slot` |

```
GET /api/match-center/matches
{
  upcoming: [ ...maç ],
  past:     [ ...maç ],
  player_id
}

// her maç = Matches satırının tamamı + türetilen alanlar:
is_home, opponent_team_id, opponent_name, in_squad, can_review

// upcoming/past ayrımı saate değil duruma bakar: canlıya/yayına geçmemiş
// maçlar saat geçse bile "upcoming" sayılır (plan ve kadro düzenlenebilir).
```

Maç alma talepleri ayrı bir sistemdir: `GET /api/match-requests/mine`,
`GET /api/match-requests/venues`, `POST /api/match-requests`,
`DELETE /api/match-requests/:publicId`.

---

## 3. Sponsorluklarım

Slot sayısı sabit 3. Yazma işlemleri ilgili kapsam için premium üyelik ister
(`402 PREMIUM_REQUIRED`) ve hepsi `202` ile onaya düşer — genel profilde hemen yayınlanmaz.

| Metot | Yol | Not |
| --- | --- | --- |
| `GET` | `/api/panel/me/sponsors?scope=player\|team` | → `{ scope, sponsors[3], slotCount, isPremium, capabilities{team,player} }`; boş slotlar da döner |
| `PUT` | `/api/panel/me/sponsors/:index?scope=` | `{ sponsor_name, placement, link_url, active }`; `:index` 1–3 |
| `POST` | `/api/panel/me/sponsors/:index/image?scope=` | Multipart, dosya alanı `image` |
| `DELETE` | `/api/panel/me/sponsors/:index?scope=` | Kaldırma da onaya gider; zaten boşsa `200 { scope, sponsor }` |

```
Slot alanları:
{ slot_index, sponsor_name, placement, image_url, link_url, active }

placement ∈ header | hero | sidebar | footer | jersey
link_url  → http(s):// ile başlamalı, aksi halde 400 VALIDATION_ERROR
```

İlgili uçlar:

| Metot | Yol | Not |
| --- | --- | --- |
| `GET` | `/api/sponsors/player/:playerId` · `/api/sponsors/team/:teamId` | Herkese açık okuma → `{ sponsors: [...] }`; sahibin premium'u aktif değilse boş |
| `GET` | `/api/membership/status` · `/plans` · `/quote` · `/orders` | Üyelik özeti, planlar, fiyat, sipariş geçmişi |
| `POST` | `/api/membership/checkout` | `{ plan, months, startDate? }`; sipariş `pending` açılır, admin onayıyla aktifleşir |

---

## 4. Transfer tekliflerim

`routes/transferOffers.js` router seviyesinde auth uygular. `/api/transfers/offers` aynı
router'ın ikinci mount'udur (alias). `:offerId` sayısal id değil, `public_id` (UUID).

| Metot | Yol | Not |
| --- | --- | --- |
| `GET` | `/api/transfer-offers/inbox?page&limit&status&search&order` | Oyuncuya gelenler; satırlarda `team{id,team_name,logo}` + `versions[]` |
| `GET` | `/api/transfer-offers/outbox?teamId&page&limit` | Takımın gönderdikleri; satırlarda `player{...}` + `revisionRequests[]` |
| `GET` | `/api/transfer-offers/:offerId` | Detay; oyuncu ilk açtığında `viewed_at` yazılır ve bildirim okundu işaretlenir |
| `POST` | `/api/transfer-offers/:offerId/accept` | `{ expectedVersion }` → `{ contract }` |
| `POST` | `/api/transfer-offers/:offerId/reject` | `{ expectedVersion, reason }` |
| `POST` | `/api/transfer-offers/:offerId/request-revision` | `{ expectedVersion, message, items }` |
| `POST` | `/api/transfer-offers/:offerId/revise` · `/withdraw` | Takım tarafı |
| `POST` | `/api/transfer-offers` | Yeni teklif (takım) → `201 { offer }` |

```
Liste yanıtı — ortak sayfalama zarfı:
{ items: [...], page, limit, totalItems, totalPages,
  hasNextPage, hasPreviousPage }
// limit üst sınırı 100, varsayılan 20

GET /api/transfer-offers/:offerId → { offer }
public_id, player_id, team_id, status, sent_at, expires_at, viewed_at,
last_action_at, version, current_version,
requires_admin_approval, admin_status, awaiting_admin_approval,
player  { id, player_name, player_img, player_position, team_id },
team    { id, team_name, logo },
versions[], revisionRequests[{ ..., items[] }], events[],
contract{ public_id, status },
actions { accept, reject, requestRevision, revise,
          withdraw, adminApprove, adminReject }
```

> **`expectedVersion` zorunlu.** Her aksiyon gövdesinde teklifin güncel `version` değeri
> gönderilmeli. Uyuşmazsa `409 TRANSFER_OFFER_VERSION_CONFLICT` döner ve ekranın teklifi
> yeniden yüklemesi gerekir.

### Panel bildirimleri

Teklif akışının parçası — `routes/panelNotifications.js`, auth ister.

| Metot | Yol | Yanıt |
| --- | --- | --- |
| `GET` | `/api/panel-notifications?page&limit&isRead` | Sayfalama zarfı |
| `GET` | `/api/panel-notifications/unread-count` | `{ count }` |
| `PATCH` | `/api/panel-notifications/:id/read` | `{ success }` |
| `PATCH` | `/api/panel-notifications/read-all` | `{ success }` |

```
Bildirim satırı:
{ id, user_id, type, title, description,
  entity_type, entity_public_id, is_read, read_at, createdAt }
```

---

## 5. Sözleşmelerim

`routes/contracts.js`, auth ister. `:contractId` = `public_id`.

| Metot | Yol | Not |
| --- | --- | --- |
| `GET` | `/api/contracts?scope=player\|team&status&teamId&playerId&startDate&endDate&active&page&limit` | Sayfalama zarfı; her satırda `player{id,player_name,player_img}` + `team{id,team_name,logo}` |
| `GET` | `/api/contracts/:contractId?scope=` | → `{ contract }`, ek olarak `sourceOffer{ public_id, status, events[] }` |

> **`scope=player` göndermeyi atlamayın.** `double` rolündeki üye hem kendi oyuncu
> sözleşmelerine hem yönettiği takımın sözleşmelerine sahiptir. `scope` verilmezse ikisi
> `OR`'lanır ve oyuncu ekranında ona ait olmayan takım sözleşmeleri listelenir.

```
Sözleşme alanları:
public_id, status, player_id, team_id,
contract_start_date, contract_end_date, offer_id

// aktif sayılan statüler: ACTIVE, PENDING_ACTIVATION
// hatalar: 404 CONTRACT_NOT_FOUND · 403 CONTRACT_FORBIDDEN
```

---

## 6. Cezalarım ve savunmalarım

Auth ister, panel rolü şartı yoktur. Üyenin taraf olduğu dosyalar: yönettiği takımın kayıtları
ve kendi oyuncu kaydına işlenen cezalar.

| Metot | Yol | Not |
| --- | --- | --- |
| `GET` | `/api/penalties/mine` | → `{ items: [...] }`; savunma ve itiraz metinleri **yalnızca** bu uçta görünür |
| `POST` | `/api/penalties/:publicId/defense` | `{ text, side }` — sevkten sonra 24 saat → `{ penalty, message }` |
| `POST` | `/api/penalties/:publicId/objection` | Kurul kararından sonra 1 hafta; süreç CAS aşamasına taşınır |
| `GET` | `/api/penalties/public` · `/api/penalties/public/:publicId` | Herkese açık; savunma/itiraz kayıtları hiç dönmez |

```
Ceza kaydı (items[]):
public_id, status, status_label, city_id, league_id, season_id,
match_id, match_label, match_date,
player_id, player_name, player_img, team_id, team_name,
duration_type, match_count, disiplin_karari,
ban_start_at, ban_end_at, defense_deadline_at, objection_deadline_at,
ban_state, createdAt, updatedAt,
submission_summary { total, pending, last_submitted_at },
events[ ... ],
available_sides[], viewer_side, is_own_penalty

events[] — süreç akışı:
id, event_type, status, status_label, title, description,
disiplin_karari, duration_type, match_count, actor_side, createdAt,
is_submission, submitted_by_side,
review_status, review_status_label, review_note, reviewed_at
```

> **`side` değerini uydurmayın.** Üye aynı anda hem oyuncu hem takım yetkilisi olabilir.
> Savunma/itiraz gönderirken `side` alanını kaydın `available_sides` / `viewer_side`
> değerinden alın.

---

## 7. Mesajlar

Auth + panel rolü ister. Tek tablo iki yönü taşır (`to_admin` / `to_member`); bir başvuru ve
tüm yanıtları aynı `thread_id` altında zincirlenir.

| Metot | Yol | Not |
| --- | --- | --- |
| `GET` | `/api/panel/me/messages?status=&limit=` | `limit` varsayılan 300, üst sınır 500. `status` ∈ `open, in_review, answered, closed` |
| `POST` | `/api/panel/me/messages` | `{ subject, body\|message, category, priority, scope }` → `201 { message, item }` |
| `POST` | `/api/panel/me/messages/:threadId/reply` | → `201 { message, item }` |
| `PATCH` | `/api/panel/me/messages/:messageId/read` | → `{ item }` |

```
GET /api/panel/me/messages
{
  threads: [{
    id, subject, category, category_label, status, status_label,
    priority, priority_label, direction, opened_by_member,
    sender, sender_user_id, sender_team_id, sender_player_id,
    created_at, last_message_at, last_message_preview,
    message_count, unread,
    messages: [{ id, thread_id, parent_id, direction, sender, subject, body,
                 category, category_label, status, status_label,
                 priority, priority_label, sender_user_id, sender_team_id,
                 sender_player_id, read, admin_read, created_at, updated_at }]
  }],
  unread,
  categories: { genel, transfer, disiplin, fikstur, kadro, odeme, teknik, oneri },
  statuses:   { open, in_review, answered, closed },
  priorities: { low, normal, high, urgent }
}
```

> **Etiketleri mobilde sabitlemeyin.** `categories`, `statuses` ve `priorities` kod → Türkçe
> etiket sözlükleri olarak yanıtla birlikte gelir; ekranı bunlardan besleyin.

Doğrulama: konu 200, metin 8000 karakterde kırpılır. Gövdede HTML etiketi geçerse
`400 VALIDATION_ERROR`.

---

## 8. Mobilde şu anki durum

`lib/api` şu an yalnızca `auth, matches, meta, news, players, standings, teams` modüllerini
içeriyor — yukarıdaki panel uçlarının hiçbiri henüz bağlanmamış.

`lib/http.ts` Bearer başlığını, zaman aşımını, GET yeniden denemesini ve 401 yakalamayı zaten
kuruyor; bu uçlar için yeni bir HTTP katmanı gerekmiyor.

Bağlarken iki tuzak:

1. Sözleşme ve sponsorluk çağrılarında `scope=player` gönderin — `double` rolündeki üyeye
   takım kayıtları karışır.
2. Teklif aksiyonlarında `expectedVersion` zorunlu; yoksa `409` alırsınız.
