/**
 * Lig Kuralları — elitlig.com/kurallar sayfasındaki resmî metnin birebir kopyası.
 *
 * Kaynak: site ekran görüntüsü, son güncelleme 12 Ağustos 2026. Metin sitede
 * güncellenirse bu dosya da güncellenmelidir. Madde numaralarındaki atlamalar
 * (2.4, 3.9 vb.) sitedeki metinde de yoktur; bilinçli olarak aynen korunmuştur.
 */

export const RULES_UPDATED_AT = "12 Ağustos 2026";

export interface RuleSection {
  title: string;
  items: string[];
}

export const RULES_SECTIONS: RuleSection[] = [
  {
    title: "1. Ligin Yapısı ve Sezon Sistemi",
    items: [
      "1.1. Elitlig adı, yalnızca oyun kalitesi yüksek takımları değil; futbol kültürü ve ahlakı yerleşmiş, bilinçli ve centilmen takımları ifade eder.",
      "1.2. Bir takvim yılı iki sezondan oluşur. Her sezon 6 ay sürer.",
      "1.3. Bahar Sezonu 21 Aralık – 20 Haziran arasında, Güz Sezonu 21 Haziran – 20 Aralık arasında oynanır.",
      "1.4. Normal sezon tamamlandıktan sonra Play-Off süreci başlar. Play-Off'u kazanan takım sezon şampiyonu olur ve kupa ile madalyalarını alır.",
    ],
  },
  {
    title: "2. Lige Katılım ve Maç Alma",
    items: [
      "2.1. Lige katılmak isteyen takım yetkilisi elitlig.com üzerinden kayıt oluşturabilir veya 0507 169 0 888 numaralı iletişim hattından başvuru yapabilir.",
      "2.2. Lige katılım için sabit bir başvuru tarihi veya katılım ücreti yoktur. Takımlar hazır oldukları tarihte lige kaydolabilir ve maç talebinde bulunabilir.",
      "2.3. Takımlar yalnızca oynadıkları maçın ücretini öder. Bunun dışında ayrıca katılım bedeli alınmaz.",
      "2.5. Rakip, saha ve hakem netleştikten sonra takım yetkilisine teyit bilgisi verilir. Teyit edilmemiş maç talebi kesinleşmiş sayılmaz.",
      "2.6. Takımlar maç saatinden en az 10 dakika önce sahada hazır bulunmalıdır.",
    ],
  },
  {
    title: "3. Takım Kadroları ve Oyuncu Uygunluğu",
    items: [
      "3.1. Maçlar saha uygunluğuna göre 7'şer oyuncu veya 8'er oyuncu ile oynanır. Maç kadrosunda en fazla 5 yedek oyuncu bulunabilir.",
      "3.2. Her takımın maç içinde en fazla 4 oyuncu değişikliği hakkı vardır. Oyundan çıkan oyuncu tekrar oyuna giremez.",
      "3.3. Bir takım maça en az 4 oyuncu ile başlayabilir. Maça 4 oyuncudan az başlayan veya kırmızı kartlar nedeniyle 4 oyuncunun altına düşen takım 3-0 hükmen mağlup sayılır.",
      "3.4. Her takım ligde oynayacağı ilk 5 maçta kadro konusunda özgürdür. 5 maçın sonunda takımlar 16 kişilik listelerini kesinleştirmeli ve sistem üzerinden kadrosunu kaydetmelidir.",
      "3.5. 5 maçtan sonraki play-off'a kadar oynanacak her maçta takımlar kesinleşen listesi hariç 4 oyuncu misafir oynatabilir.",
      "3.6. Bir takvim yılında 2 transfer dönemi Bahar Sezonu için; 2 transfer dönemi Güz Sezonu için olmak üzere toplam 4 transfer dönemi açılmaktadır. Her transfer döneminde takımlara sezon içerisindeki haklarına ek 3 oyuncu transfer hakkı verilir. Takımlar bu transfer hakkıyla 16 kişilik kontenjanı aşamazlar. Eğer transfer edilen oyuncularla birlikte takım listesi 16 kişiyi aşıyorsa listeyi 16 kişiye düşürecek şekilde oyuncular serbest bırakılmalıdır.",
      "• 1. Transfer dönemi: 15 Şubat – 1 Mart arası",
      "• 2. Transfer dönemi: 15 Mayıs – 1 Haziran arası",
      "• 3. Transfer dönemi: 15 Ağustos – 1 Eylül arası",
      "• 4. Transfer dönemi: 15 Kasım – 1 Aralık arası",
      "3.7. Play-off döneminde takımlar son transfer döneminin ardından belirledikleri kadroyla mücadele edebilirler. Misafir oyuncu oynatamazlar.",
      "3.8. Play-off'larda verilecek 16 kişilik takım kadrosunda sezonun başlama tarihinden 6 ay öncesine kadar aktif lisanslı olan yalnızca 3 oyuncu bulundurulabilir. Bu 3 oyuncudan yalnızca 2'si aynı anda sahada yer alabilir. Süper amatör lig ve üzeri liglerde oynayan oyuncular lisanslı kategorisinde kabul edilmektedir.",
      "3.10. Kadroya eklenen oyuncuların kimlik ve kayıt bilgilerinin doğru girilmesi zorunludur.",
      "3.11. Kadro uygunluğu kurallarının ihlali halinde uygulanacak temel yaptırım hükmen mağlubiyettir.",
    ],
  },
  {
    title: "4. Maç Öncesi İşlemler",
    items: [
      "4.1. Maç talebi, web sitesindeki \"Online Maç Al\" sayfasından veya call center hattı üzerinden yapılır.",
      "4.2. Maç günü, saati, rakibi ve sahası kesinleştiğinde takım yetkilisine telefonla teyit verilir.",
      "4.3. Rezervasyonu kesinleşen maçlar iptal edilemez.",
      "4.8. Takımlar maçtan önce maç ücretini ve kadro listesini görevliye teslim etmelidir. Bu işlemler tamamlanmadan maç başlatılmaz.",
      "4.9. Takımlar, sırt numaraları birbirinden farklı ve tek tip formalarla oynayabilir. Bu şartlara uymayan formalarda organizasyon yeleği kullanılır.",
      "4.11. Geç kalan takım için en fazla 15 dakika beklenir. Bu sürenin sonunda sahaya çıkabilecek en az 5 oyuncusu bulunmayan takım 3-0 hükmen mağlup sayılır.",
      "4.12. Rakip takım beklemeyi kabul ederse maç, rezervasyonun normal bitiş saatinde sona erer; geç başlama nedeniyle kaybedilen süre maça eklenmez.",
    ],
  },
  {
    title: "5. Maç Sonrası, İtiraz ve Geri Bildirim",
    items: [
      "5.1. İtirazlar yalnızca maç tamamlandıktan sonra yapılabilir.",
      "5.2. İtiraz, maça taraf olan takımın kaptanı tarafından, maçın oynandığı günü takip eden gün saat 12.00'ye kadar yapılmalıdır.",
      "5.3. Üçüncü bir takımın veya takım kaptanı dışındaki kişilerin yaptığı itirazlar geçersizdir.",
      "5.4. İtiraz hükmen mağlubiyet gerektiren bir konuya ilişkinse ve haklı bulunursa sonuç aşağıdaki esaslara göre tescil edilir:",
      "5.5. İtirazı haklı bulunan takım maçı kaybetmişse, berabere kalmışsa veya 3 golden az farkla kazanmışsa sonuç 3-0 olarak tescil edilir.",
      "5.6. İtirazı haklı bulunan takım maçı en az 4 gol farkla kazanmışsa kendi attığı gol sayısı korunur, rakibin golleri silinir. Örneğin 6-2 biten maç 6-0 olarak tescil edilir.",
      "5.7. Takımlar, maçtan sonraki 24 saat içinde hakem, koordinatör ve rakip takım hakkındaki görüşlerini iletişim merkezi veya e-posta yoluyla bildirebilir.",
    ],
  },
  {
    title: "6. Play-Off Sistemi",
    items: [
      "6.1. Play-off dönemi Şampiyonlar Ligi, EFF Ligi ve Konferans Ligi olmak üzere 3 farklı kupa mücadelesiyle ve toplam 30 takımın katılımıyla gerçekleşir.",
      "6.2. Şampiyonlar Ligi'ne katılım için takımların sezon içerisinde en az 20 maç yapmış olması; EFF Ligi'ne katılım için en az 15 maç, Konferans Ligi'ne katılım için en az 10 maç yapmış olması gerekmektedir.",
      "6.3. Play-off etapları ve katılımcı sıralamaları şu şekildedir: Şampiyonlar Ligi Yarı Final lig 1.si; Çeyrek Final lig 2.si ve Kral Kupası Şampiyonu; Gruplar lig 3.–7.si; Ön Eleme lig 8.–13.sü. EFF Ligi Yarı Final lig 14.sü; Çeyrek Final lig 15.si ve Kral Kupası İkincisi; Gruplar Şampiyonlar Ligi ön elemeden gelen 3 takım ile lig 16.–17.si; Ön Eleme lig 18.–23.sü. Konferans Ligi Yarı Final lig 24.sü; Çeyrek Final lig 25.si ve Kral Kupası Üçüncüsü; Gruplar EFF Ligi ön elemeden gelen 3 takım ile lig 26.–30.su.",
      "6.4. Ön eleme turları rövanşlı eleme usulüyle oynanır. Grup aşamaları rövanşsız, çeyrek final ve yarı final maçları rövanşlı, final maçı rövanşsız olarak oynanmaktadır.",
      "6.5. Eleme maçları berabere biterse uzatma oynanmadan doğrudan penaltı atışlarına geçilir. Takımlar 3'er penaltı kullanır; eşitlik bozulmazsa seri penaltılara geçilir.",
      "6.6. Play-off grup aşamasında bir takım maça çıkmazsa rakibi 3-0 hükmen galip sayılır. Grup maçlarında ikili averaja bakılır.",
      "6.7. Rövanşlı maçlarda, toplam skor eşitliğinde ev sahibi/deplasman golü avantajı uygulanmaz; doğrudan penaltı atışlarına geçilir.",
    ],
  },
  {
    title: "7. Oyun Kuralları",
    items: [
      "7.1. Bu metinde açıkça değiştirilen hususlar dışında uluslararası futbol oyun kuralları uygulanır.",
      "7.2. Elitlig'de maçlarda alınan puanlar takım seviyelerine göre değişiklik göstermektedir. Maçlarda puan endeksi sistemi uygulanır. Takımların puan endeksi \"(Toplam Galibiyet × 3 + Toplam Beraberlik × 1) / Oynadıkları Maç Sayısı × 2\" formülüyle bulunur.",
      "7.3. Maçlar 25'er dakikalık iki devre halinde oynanır.",
      "7.4. Ofsayt kuralı uygulanmaz.",
      "7.5. Üst fileye çarparak kaleye giren top gol sayılır.",
      "7.6. Aut atışından ve santradan doğrudan atılan goller geçerlidir.",
      "7.7. Aut atışından sonra topa ilk dokunan oyuncu ceza sahası dışında olmalıdır. Aksi halde atış tekrarlanır.",
      "7.8. Hakem, ilk sarı karttan sonra ikinci sarı kartı göstermeden önce oyuncuya 3 dakikalık geçici oyun dışı kalma cezası verebilir.",
      "7.9. Geçici ceza alan oyuncunun yerine başka bir oyuncu girerse bu işlem oyuncu değişikliği sayılır ve çıkan oyuncu tekrar oyuna dönemez.",
      "7.10. Geçici cezasını tamamlayıp oyuna dönen oyuncunun ilk sarı kartı geçerliliğini korur. Aynı oyuncunun ikinci sarı kartı görmesi halinde kırmızı kart uygulanır.",
      "7.11. Kaleciyle karşı karşıya kalınan pozisyonda hücum oyuncusuna yapılan faulde, müdahale sakatlamaya yönelik değilse savunma oyuncusu sarı kartla cezalandırılır.",
    ],
  },
  {
    title: "8. Pilot Uygulama: 3 Korner = 1 MLS Penaltısı",
    items: [
      "8.1. Pazartesi günü oynanan ve lig yönetimi tarafından pilot kapsamda ilan edilen maçlarda \"3 korner = 1 MLS penaltısı\" uygulaması geçerlidir.",
      "8.2. Bir takımın kazandığı her 3 kornerin ardından, sonraki korner yerine 1 MLS penaltısı kullanılır.",
      "8.3. MLS penaltısının başlangıç noktası ortasaha noktasıdır.",
      "8.4. Atışı kullanacak oyuncu topu belirlenen noktadan hareket ettirerek kaleye yönelir; kaleci de oyun alanı içinde oyuncuya karşı savunma yapabilir. Oyuncu 5 sn içinde gol atamazsa aut atışıyla oyun devam eder.",
      "8.6. Pilot uygulamaya ilişkin özel esaslar, lig yönetiminin ilan ettiği güncel talimatla birlikte değerlendirilir.",
    ],
  },
  {
    title: "9. Disiplin ve Cezalar",
    items: [
      "9.1. Disiplin cezası devam eden bir oyuncuyu, misafir oyuncu olarak dahi oynatan takım hükmen mağlup sayılır.",
      "9.2. İkinci sarı karttan doğan kırmızı kart, hakem raporunda ayrıca ağır bir ihlal belirtilmediği sürece otomatik maç cezası doğurmaz.",
      "9.3. Doğrudan kırmızı kart da tek başına otomatik maç cezası doğurmaz. Ancak hakem raporu, koordinatör raporu veya video görüntülerinde ağır ihlal tespit edilirse ayrıca disiplin cezası uygulanır.",
      "9.4. Olayları başlatan taraf, hakem ve gözlemci raporları ile kamera görüntüleri birlikte değerlendirilir. Olayı başlatmamış olmak hafifletici neden sayılabilir.",
      "9.5. Play-off döneminde alınan cezalar normal sezon maçı oynanarak düşürülemez.",
      "9.6. İhraç cezaları hariç diğer disiplin cezaları, verildiği sezon için geçerlidir.",
      "9.7. Disiplin Kurulu, hakemin kart göstermediği bir eylem hakkında da video görüntüsü ve koordinatör raporuna dayanarak ceza verebilir.",
    ],
  },
  {
    title: "10. Disiplin Ceza Ölçütleri",
    items: [
      "• İkinci sarı karttan kırmızı kart: ek ihlal yoksa maç cezası yok",
      "• Doğrudan kırmızı kart: ek ihlal yoksa maç cezası yok",
      "• Sakatlamaya yönelik sert müdahale: 3 maçtan süresiz ihraca kadar",
      "• Rakibi veya hakemi küçük düşürücü hareket ve davranış: 1 maçtan süresiz ihraca kadar",
      "• Küfür veya hakaret: 2 maçtan süresiz ihraca kadar",
      "• Her türlü fiziki müdahale: 3 maçtan süresiz ihraca kadar",
      "Not: Disiplin Kurulu; eylemin ağırlığı, tekrar durumu, tahrik, hakem ve koordinatör raporları ile video görüntülerini birlikte değerlendirir.",
    ],
  },
  {
    title: "11. Yönetimin Düzenleme Yetkisi",
    items: [
      "11.1. Elitlig yönetimi, organizasyonun işleyişi, güvenliği ve sportif adalet gerekçeleriyle kurallarda değişiklik yapma hakkını saklı tutar.",
      "11.2. Yapılan değişiklikler resmî web sitesi, sosyal medya hesapları veya takım iletişim kanalları üzerinden duyurulur.",
      "11.3. Bir konuda bu metin ile sonradan yayımlanan özel talimat arasında farklılık bulunursa, tarihi daha yeni olan resmî talimat esas alınır.",
    ],
  },
];
