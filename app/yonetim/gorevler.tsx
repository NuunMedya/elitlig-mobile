/**
 * YAPILACAKLAR — aracın açılış rotası (/yonetim/gorevler).
 *
 * Eskiden burada üç sekmeli sade bir "Görevlerim" listesi, tam pano ise ayrı
 * ekranda (/yonetim/gorev-panosu) duruyordu; kullanıcı iki ekran arasında
 * gidip geliyordu. Artık Yapılacaklar TEK uygulamadır: akıllı listeler
 * (Bugün · Yaklaşan · Tüm işler · Bana atananlar · Atadıklarım · Maç görevleri
 * · Ekip takibi · etiketler · Tamamlanan), liste + pano görünümü, doğal dille
 * hızlı ekleme ve kart ayrıntısı aynı ekrandadır. Uygulamanın kendisi
 * gorev-panosu.tsx içindedir; iki rota da aynı ekranı açar.
 *
 * Bildirimlerden ve eski bağlantılardan gelen `?id=` (kartı açar) ve
 * `?tab=assigned|done` (ilgili listeyi açar) parametreleri korunur.
 */

export { default } from "./gorev-panosu";
