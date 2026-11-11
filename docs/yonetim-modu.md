# Yönetim modu

Yönetim rolündeki bir hesap giriş yaptığında uygulama **yönetim moduna** geçer:
alt menü, ana ekran ve kısayollar tamamen yönetim araçlarına hizmet eder.
Üye uygulamasına tek düğmeyle dönülür, tek düğmeyle geri gelinir.

## İki mod

| | Üye uygulaması | Yönetim modu |
| --- | --- | --- |
| Kim görür | Misafir, üye, takım başkanı, oyuncu; "üye gözünden" bakan yönetici | Yönetim rolündeki hesap |
| Alt menü | Maçlar · Lig · Yönetim · Mesajlar · Menü | Panel · İşler · ◉ Uygulamalar · Mesajlar · Lig |
| Kimlik | Beyaz/koyu mor bar, mor seçim | Gece laciverti bar, altın vurgu (iki temada aynı) |
| Açılış | Maçlar | Panel |

## Geçiş

- **Yönetim → üye:** Panel'deki "Üye gözünden gör" düğmesi ya da Uygulamalar
  çekmecesinin dibindeki aynı düğme.
- **Üye → yönetim:** alt menünün hemen üstündeki "Üye görünümündesin ·
  Yönetime dön" şeridi (her sekmede görünür), Menü'nün en üstündeki kart ya da
  Yönetim sekmesindeki "Yönetim moduna geç".

Tercih cihazda saklanır (`elitlig.appMode.v1`). Uygulama açıkken yapılan her
yönetici girişi modu yönetim moduna alır.

## Yönetim modunun sekmeleri

- **Panel** (`(tabs)/yonetim-panel`, `components/admin/home/AdminHome`) —
  kimlik sahnesi + dört sayaç, altı büyük uygulama karosu (Muhasebe,
  Yapılacaklar, Projeler, Mesajlar, Lig yönetimi, Yayın stüdyosu), diğer
  araçlar şeridi, bugünün özeti, son bildirimler.
- **İşler** (`(tabs)/yonetim-isler`) — Yapılacaklar (`app/yonetim/gorevler`).
- **◉ Uygulamalar** — rota değil; `components/admin/home/AppDrawer` çekmecesini
  açar. Her uygulama her ekrandan iki dokunuştur.
- **Mesajlar** (`(tabs)/mesajlar`) — sohbetler + üye mesajları.
- **Lig** (`(tabs)/yonetim-lig`, `components/admin/league/LeagueOpsHome`) —
  maç günü, bekleyen işler ve lig yönetimi modülleri.

Tüm yönetim sayfalarının aranabilir listesi: `/yonetim/tum`.

## Kod haritası

| Dosya | İş |
| --- | --- |
| `providers/AdminModeProvider.tsx` | Mod durumu, kalıcılık, `enterAdmin` / `enterMember`, `AdminTabRootContext` |
| `app/(tabs)/_layout.tsx` | Moda göre sekme listesi, mod ↔ sekme eşlemesi, dönüş şeridi, çekmece |
| `components/ui/GlowTabBar.tsx` | `variant="admin"`, orta düğme (`center`), `banner` |
| `lib/adminApps.ts` | Çekmece ve Panel'deki uygulamalar (kimlik + yetki) |
| `lib/admin/toolApps.ts` | Çalışma araçlarının uygulama kimlikleri |
| `hooks/useAdminCounters.ts` | Rozet sayaçları (görev, talep, mesaj) |
| `theme/palette.ts` | `admin*` tokenları |

Yeni bir uygulama eklemek için `lib/adminApps.ts` içine bir kayıt ve
`app/yonetim` altında ekranı yeterlidir.
