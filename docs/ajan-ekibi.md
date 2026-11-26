# ElitLig ajan ekibi

ElitLig'in web sitesi, mobil uygulaması, masaüstü uygulaması ve sunucusu
dokuz Claude Code ajanından oluşan bir ekiple geliştirilir. Ajan tanımları
dört depoda da aynıdır: `.claude/agents/` (`elitlig-server`, `elitlig-client`,
`elitlig-mobile`, `elitlig-mac`). Bir ajan değişirse dört depoda da aynı dosyayı
güncelleyin.

## Ekip

| Ajan | Rol | Yazar mı? |
| --- | --- | --- |
| `elitlig-koordinator` | Proje yöneticisi: isteği böler, API sözleşmesini ve sırayı yazar | Hayır |
| `elitlig-sunucu` | API, veritabanı göçleri, kuyruklar, socket (`elitlig-server`) | Evet |
| `elitlig-web` | Web sitesi ve yönetim paneli (`elitlig-client`) | Evet |
| `elitlig-mobil` | iOS/Android uygulaması (`elitlig-mobile`) | Evet |
| `elitlig-masaustu` | Mac/Windows uygulamaları Elitlig Araçlar ve Elitlig Stüdyo (`elitlig-mac`) | Evet |
| `elitlig-tasarim` | Arena tasarım dili ve UX denetimi | Hayır |
| `elitlig-test` | Testler, derleme, hata tekrar üretimi | Yalnız test |
| `elitlig-inceleme` | Kod inceleme ve güvenlik | Hayır |
| `elitlig-surum` | Yayın planı, sürüm notu, PR açıklaması | Hayır |

## İş akışı

1. **İstek** — kullanıcı, oturumda bir özellik ya da hata yazar.
2. **Planlama** — `elitlig-koordinator` işi böler, sözleşmeyi ve kabul
   ölçütlerini yazar.
3. **Sunucu** — `elitlig-sunucu` geriye uyumlu API değişikliğini yapar.
4. **İstemciler** — `elitlig-web`, `elitlig-mobil`, `elitlig-masaustu`
   aynı sözleşmeyle paralel çalışır.
5. **Denetim** — `elitlig-test`, `elitlig-tasarim`, `elitlig-inceleme`
   paralel çalışır; bulgular geliştiriciye geri döner.
6. **Yayın** — `elitlig-surum` sırayı, notları ve PR açıklamasını hazırlar.
   Birleştirme ve yayın kullanıcının onayıyla yapılır.

## Kullanım

Oturumda doğal dille isteyin; ana oturum uygun ajanı kendisi çağırır:

> Koordinatörle planla: maç sonunda oyunculara "maçın oyuncusu" oylaması.

Belirli bir ajanı adıyla da çağırabilirsiniz:

> elitlig-inceleme ajanıyla bu dalı incele.

## Değişmez kurallar

- API geriye uyumludur: mağazadaki eski mobil sürümler kırılmaz.
- Her iş bir dalda yapılır ve PR ile gelir; ana dala doğrudan itme yok.
- Test atlanmaz, devre dışı bırakılmaz.
- Yayın komutlarını (`eas update`, Heroku, Netlify) yalnız kullanıcı çalıştırır
  ya da açıkça onaylar.
- `elitlig-mac`'te her push Mac + Windows derlemesini GitHub Release'e yükler;
  bu depoya itmeden önce kullanıcıya sorulur.
