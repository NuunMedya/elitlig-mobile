/**
 * LİG KURALLARI — resmî metnin uygulama içi hâli (constants/rulesContent.ts).
 *
 * NE DEĞİŞTİ: eski ekran 11 bölümü tek tek karta sarıp `ScrollView` içine
 * diziyordu; kaydırırken hangi bölümde olduğun kayboluyor, aranan madde ancak
 * göz gezdirerek bulunuyordu. Yeni ekran metni bir BELGE gibi ele alır:
 *
 *   1. YAPIŞKAN BÖLÜM BAŞLIĞI — `SectionList` + `stickySectionHeadersEnabled`.
 *      Uzun bir bölümün ortasındayken bile hangi başlığın altında olduğun
 *      ekranın tepesinde durur.
 *   2. ARAMA — başlıkta ve madde metninde geçen kelimeyi süzer. Türkçe I/İ
 *      katlaması yapılır ("İHRAÇ" ile "ihrac" aynı sonucu verir). Arama açıkken
 *      eşleşen bölümler otomatik AÇILIR; akordeon durumu aramayı engellemez.
 *   3. MADDE NUMARASI ayrı bir sütundur (tabular rakam, sabit 38px): "3.10."
 *      ile "3.1." alt alta hizalanır, metin bloğu tek bir sol kenarda başlar.
 *      Sitedeki numara atlamaları (2.4, 3.9 yok) korunur — metin resmîdir.
 *   4. `textScale.long`: kurallar okunacak metindir, kullanıcının yazı tipi
 *      tercihi ×2'ye kadar serbesttir (tabloya sığma kaygısı yok).
 *
 * AKORDEON: bölümler `data: []` verilerek kapatılır — kapalı bölüm hiç satır
 * kurmaz, `SectionList` yalnız başlığı çizer. Bu, 11 bölüm × ~10 madde metnini
 * baştan mount etmekten ucuzdur ve açılış anında görünür.
 */

import { useMemo, useState } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  Chip,
  EmptyState,
  Input,
  ListRow,
  ScreenHeader,
  SectionHeader,
  useHeaderScroll,
} from "@/components/ui";
import { RULES_SECTIONS, RULES_UPDATED_AT } from "@/constants/rulesContent";
import { useRouter } from "expo-router";
import { useScope } from "@/providers/ScopeProvider";
import { animateNextLayout, colors, layout, radius, space, textScale, type } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/** Ekrana çizilen tek madde: numara sütunu + metin (ya da madde işareti). */
interface RuleEntry {
  key: string;
  /** "3.1." gibi numara; madde işaretli satırlarda null. */
  number: string | null;
  bullet: boolean;
  text: string;
}

interface RuleSectionData {
  title: string;
  /** Bölümün RULES_SECTIONS içindeki sırası — akordeon anahtarı. */
  index: number;
  /** Bölümdeki toplam madde (arama süzse bile başlıkta gerçek sayı görünür). */
  total: number;
  data: RuleEntry[];
}

/* ============================== SAF YARDIMCILAR =========================== */

/**
 * Türkçe arama katlaması. `toLocaleLowerCase("tr-TR")` "I" harfini noktasız
 * "ı" yapar; kullanıcı klavyeden "i" yazdığında eşleşme kaçmasın diye I ailesi
 * tek harfe indirilir. Aynı katlama hem metne hem sorguya uygulanır.
 */
function fold(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    // "İ" küçülünce "i + birleşik nokta" (U+0307) olur; nokta ATILIR, harfe
    // dönüştürülmez — yoksa tek harf iki harfe çıkar ve eşleşme kaçar.
    .replace(/\u0307/g, "")
    .replace(/[ıî]/g, "i");
}

/**
 * Ham madde metnini numara ve gövdeye ayırır.
 *   "3.1. Maçlar …"          → { number: "3.1.", text: "Maçlar …" }
 *   "• 1. Transfer dönemi …" → { bullet: true, text: "1. Transfer dönemi …" }
 * Numara yakalanamazsa metin olduğu gibi kalır (biçim bozulmaz).
 */
function parseRule(raw: string, sectionIndex: number, itemIndex: number): RuleEntry {
  const key = `${sectionIndex}-${itemIndex}`;
  const value = raw.trim();

  if (value.startsWith("•")) {
    return { key, number: null, bullet: true, text: value.replace(/^•\s*/, "") };
  }

  const match = value.match(/^((?:\d+\.)+)\s+([\s\S]*)$/);
  if (match) {
    return { key, number: match[1], bullet: false, text: match[2] };
  }
  return { key, number: null, bullet: false, text: value };
}

/* ================================= EKRAN ================================== */

export default function RulesScreen() {
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [search, setSearch] = useState("");
  /** Açık bölümlerin sıraları — ilk bölüm açık gelir. */
  const [open, setOpen] = useState<number[]>([0]);

  const searching = search.trim().length > 1;

  /** Bölümler tek seferde ayrıştırılır; arama yalnız süzer. */
  const parsed = useMemo(
    () =>
      RULES_SECTIONS.map((section, index) => ({
        title: section.title,
        index,
        entries: section.items.map((item, itemIndex) => parseRule(item, index, itemIndex)),
      })),
    [],
  );

  const sections = useMemo<RuleSectionData[]>(() => {
    const needle = fold(search.trim());

    return parsed
      .map((section) => {
        const total = section.entries.length;

        if (!searching) {
          return {
            title: section.title,
            index: section.index,
            total,
            // Kapalı bölüm hiç satır kurmaz.
            data: open.includes(section.index) ? section.entries : [],
          };
        }

        // Başlık eşleşiyorsa bölümün tamamı, yoksa yalnız eşleşen maddeler.
        const titleHit = fold(section.title).includes(needle);
        const hits = titleHit
          ? section.entries
          : section.entries.filter((entry) => fold(`${entry.number ?? ""} ${entry.text}`).includes(needle));

        return { title: section.title, index: section.index, total, data: hits };
      })
      .filter((section) => !searching || section.data.length > 0);
  }, [open, parsed, search, searching]);

  const matchCount = useMemo(
    () => (searching ? sections.reduce((sum, section) => sum + section.data.length, 0) : 0),
    [sections, searching],
  );

  const allOpen = open.length === RULES_SECTIONS.length;

  const toggleSection = (index: number) => {
    animateNextLayout();
    setOpen((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  };

  const toggleAll = () => {
    animateNextLayout();
    setOpen(allOpen ? [] : RULES_SECTIONS.map((_, index) => index));
  };

  /**
   * Başlık bloğu ELEMENT olarak verilir (bileşen olarak DEĞİL): her tuş
   * vuruşunda yeni bir bileşen türü üretilseydi arama kutusu odağı kaybederdi.
   */
  const listHeader = (
    <View style={styles.headerBlock}>
      <Input
        variant="search"
        value={search}
        onChangeText={setSearch}
        placeholder="Kurallarda ara (madde, kelime)"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Kurallarda ara"
      />

      <View style={styles.metaRow}>
        <Badge label="Güncel" tone="win" icon="checkmark-circle" />
        <Text style={styles.updated} {...textScale.dense}>
          Son güncelleme: {RULES_UPDATED_AT}
        </Text>
        {searching ? null : (
          <Chip
            label={allOpen ? "Tümünü kapat" : "Tümünü aç"}
            icon={allOpen ? "chevron-up" : "chevron-down"}
            size="sm"
            onPress={toggleAll}
            style={styles.toggleAll}
          />
        )}
      </View>

      {searching ? (
        <Text style={styles.matchLine} {...textScale.dense}>
          {matchCount > 0
            ? `${matchCount} madde eşleşti — eşleşen bölümler açık gösteriliyor.`
            : "Eşleşen madde yok."}
        </Text>
      ) : null}
    </View>
  );

  const listFooter = (
    <View style={styles.footer}>
      <Text style={styles.footerNote} {...textScale.long}>
        Bu metin elitlig.com/kurallar sayfasındaki resmî kural kitapçığının
        birebir kopyasıdır. Madde numaralarındaki atlamalar resmî metinde de
        vardır.
      </Text>
      <ListRow
        leading={{ icon: "chatbubble-ellipses-outline", tone: "brand" }}
        title="Kurallarla ilgili sorunuz mu var?"
        subtitle="İletişim kanallarından bize ulaşın"
        position="single"
        onPress={() => router.push("/iletisim")}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Lig Kuralları"
        subtitle={`${scope.cityLabel} · ${scope.leagueLabel}`}
        back
        scrollY={scrollY}
      />

      <SectionList
        {...scrollProps}
        sections={sections}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={10}
        contentContainerStyle={styles.content}
        ListHeaderComponent={listHeader}
        ListFooterComponent={sections.length ? listFooter : null}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="Sonuç yok"
            body="Aradığınız kelime kural metninde geçmiyor. Daha kısa bir kelime deneyin."
            variant="inline"
          />
        }
        renderSectionHeader={({ section }) => (
          /*
           * `uppercase={false}`: bölüm başlığı burada bir ETİKET değil, resmî
           * metnin kendi başlığıdır ("3. Takım Kadroları…"). Büyük harfe
           * çevirmek hem numarayla birlikte bağırır hem de tek satıra sığmayı
           * zorlaştırır. Arama açıkken başlıklar katlanmaz — süzülmüş sonucu
           * kapatabilmek kafa karıştırırdı.
           */
          <SectionHeader
            title={section.title}
            meta={`${section.total} madde`}
            sticky
            uppercase={false}
            collapsible={!searching}
            collapsed={!searching && !open.includes(section.index)}
            onToggle={searching ? undefined : () => toggleSection(section.index)}
          />
        )}
        renderItem={({ item }) => <RuleRow entry={item} />}
        SectionSeparatorComponent={null}
      />
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================ */

/** Tek madde: solda numara/işaret sütunu, sağda gövde metni. */
function RuleRow({ entry }: { entry: RuleEntry }) {
  return (
    <View style={styles.item}>
      <View style={styles.numberColumn}>
        {entry.bullet ? (
          <View style={styles.bulletDot} />
        ) : entry.number ? (
          <Text style={styles.number} {...textScale.dense}>
            {entry.number}
          </Text>
        ) : null}
      </View>
      <Text style={styles.itemText} {...textScale.long}>
        {entry.text}
      </Text>
    </View>
  );
}

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  /**
   * Yatay boşluk YOK: yapışkan başlık kendi `screenPadding`'ini taşır, madde
   * satırları da kendi boşluğunu verir. Kapsayıcıya boşluk verilseydi başlık
   * iki kat girintili çizilirdi.
   */
  content: {
    paddingBottom: space.giant,
    flexGrow: 1,
  },
  headerBlock: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.sm,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  updated: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  toggleAll: {
    marginLeft: "auto",
  },
  matchLine: {
    ...type.bodySm,
    color: colors.textSecondary,
  },

  /* — Madde — */
  item: {
    flexDirection: "row",
    gap: space.m,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.sm,
  },
  /** Sabit genişlik: "3.10." ile "3.1." aynı sol kenarda hizalanır. */
  numberColumn: {
    width: 38,
    paddingTop: 2,
    alignItems: "flex-start",
  },
  number: {
    ...type.tableNumStrong,
    color: colors.brandAccent,
  },
  bulletDot: {
    width: 5,
    height: 5,
    marginTop: 7,
    marginLeft: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.textTertiary,
  },
  itemText: {
    ...type.bodyLg,
    color: colors.textPrimary,
    lineHeight: 24,
    flex: 1,
  },

  /* — Alt bilgi — */
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
    gap: space.md,
  },
  footerNote: {
    ...type.bodySm,
    color: colors.textTertiary,
    lineHeight: 19,
  },
});
