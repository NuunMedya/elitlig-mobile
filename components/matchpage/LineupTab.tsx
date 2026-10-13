/**
 * KADRO SEKMESİ — iki takım tek sahada, altında seçili takımın listesi.
 *
 * DÜZEN:
 *   1. SAHA — iki ilk kadro karşı karşıya: deplasman üstte (aynalanmış), ev
 *      sahibi altta. Sahanın üstünde ve altında takım şeridi (arma · ad ·
 *      diziliş). Kimin kime karşı nasıl dizildiği tek bakışta okunur.
 *   2. TAKIM SEÇİCİ — segment, yalnız ALTTAKİ listeyi seçer; saha zaten iki
 *      takımı birden gösteriyor.
 *   3. LİSTE — "İlk kadro" ve "Yedekler", tek kartta satırlar: mevki etiketi,
 *      avatar, ad, katkılar (gol/asist/kart), değişiklik dakikası, reyting.
 *
 * NEDEN SAHA + LİSTE BİRLİKTE: saha dizilişi söyler ama ayrıntıyı (reyting,
 * değişiklik dakikası, misafir oyuncu) sığdıramaz; liste ayrıntıyı söyler ama
 * dizilişi söyleyemez. Eski sürüm ikisini bir düğmeyle değiştiriyordu ve
 * kullanıcı aradığı bilginin hangi görünümde olduğunu bilmiyordu.
 *
 * TAKIM RENKLERİ: ev sahibi `brand` (menekşe rozet, beyaz numara), deplasman
 * `onPitch` (beyaz rozet, mürekkep numara). Derin yeşil sahada ikisi de güçlü
 * ve birbirinden net ayrılır; takım şeritlerindeki nokta aynı rengi taşır.
 *
 * OYUNCUYA DOKUNMAK sayfayı değil bir alt sayfayı açar: "bu kim, nasıl
 * oynadı" sorusu yerinde yanıtlanır, kadro kaybolmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type RefreshControlProps,
} from "react-native";

import {
  Avatar,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  EventIcon,
  PitchView,
  RatingPill,
  SectionHeader,
  SegmentedControl,
  SkeletonListRow,
  TeamLogo,
  Touchable,
  type EventIconKind,
  type PitchPlayerView,
  type SegmentedItem,
} from "@/components/ui";
import { positionLabel, positionLine } from "@/lib/api/team";
import {
  colors,
  fonts,
  hairline,
  layout,
  palette,
  positionBadge,
  positionColor,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";
import type { ContribRow } from "@/lib/matchStats";
import type { ApiMatch, KadroPlayer, KadroResponse } from "@/lib/types";
import { PaperCard } from "./parts";
import {
  formationOf,
  playerIdOf,
  playerKey,
  playerNameOf,
  type ScrollChrome,
  type SubInfo,
} from "./shared";

type LineupSide = "home" | "away";

/** Sahadaki iki takımın rengi — şerit noktası ve forma rozeti aynı rengi taşır. */
const HOME_TINT = colors.brand;
const HOME_INK = colors.textOnBrand;
const AWAY_TINT = colors.onPitch;
const AWAY_INK = colors.pitchGreen;

export interface LineupTabProps {
  match: ApiMatch;
  kadro: KadroResponse | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  contributions: { home: ContribRow[]; away: ContribRow[] };
  substitutions: Map<number, SubInfo>;
  homeLogo: string | null;
  awayLogo: string | null;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}

export function LineupTab({
  match,
  kadro,
  loading,
  error,
  onRetry,
  contributions,
  substitutions,
  homeLogo,
  awayLogo,
  scrollProps,
  refreshControl,
}: LineupTabProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [side, setSide] = useState<LineupSide>("home");
  const [sheetPlayer, setSheetPlayer] = useState<KadroPlayer | null>(null);

  /** Oyuncu katkıları id ile aranır: satır ve saha rozetleri buradan. */
  const contribById = useMemo(() => {
    const map = new Map<number, ContribRow>();
    for (const row of [...contributions.home, ...contributions.away]) {
      if (row.playerId) map.set(Number(row.playerId), row);
    }
    return map;
  }, [contributions]);

  const homeStarters = useMemo(() => (kadro?.home ?? []).filter((row) => row.role === "starter"), [kadro]);
  const awayStarters = useMemo(() => (kadro?.away ?? []).filter((row) => row.role === "starter"), [kadro]);

  const rows = useMemo(() => (side === "home" ? kadro?.home : kadro?.away) ?? [], [kadro, side]);
  /* Liste hat sırasıyla okunur (KAL → DEF → ORT → FOR): sahayla aynı düzen,
     göz listede de dizilişi takip eder. Aynı hatta kayıt sırası korunur. */
  const starters = useMemo(() => byLine(rows.filter((row) => row.role === "starter")), [rows]);
  const bench = useMemo(() => byLine(rows.filter((row) => row.role !== "starter")), [rows]);

  const sideItems = useMemo<SegmentedItem<LineupSide>[]>(
    () => [
      { key: "home", label: match.first_team_name },
      { key: "away", label: match.second_team_name },
    ],
    [match.first_team_name, match.second_team_name],
  );

  const openPlayer = useCallback((playerId: number) => router.push(`/oyuncu/${playerId}`), [router]);

  /* Sahadaki oyuncular: rozetler gerçek olaylardan, reyting kadro satırından. */
  const toPitch = useCallback(
    (squad: KadroPlayer[], prefix: string, tint: string, ink: string): PitchPlayerView[] =>
      squad.map((row, index) => {
        const playerId = playerIdOf(row);
        const contrib = playerId ? contribById.get(playerId) : null;
        const sub = playerId ? substitutions.get(playerId) : null;
        const events: EventIconKind[] = [];
        if (contrib?.goals) events.push("goal");
        if (contrib?.cards) events.push("yellow");
        if (sub?.out != null) events.push("substitution");
        const rating = row.puan != null ? Number(row.puan) : null;
        return {
          // Anahtar TAKIMI da taşır: iki kadro aynı sahada, aynı index'te iki
          // oyuncu olabilir ve React aynı anahtarı iki kez görürse birini çizmez.
          key: `${prefix}-${playerKey(row, index)}`,
          name: playerNameOf(row),
          photo: row.playerImg,
          number: row.number,
          position: row.position,
          events,
          tint,
          tintInk: ink,
          rating: rating != null && Number.isFinite(rating) && rating > 0 ? rating : null,
          captain: row.captain,
          onPress: () => setSheetPlayer(row),
        };
      }),
    [contribById, substitutions],
  );

  const homePitch = useMemo(() => toPitch(homeStarters, "h", HOME_TINT, HOME_INK), [toPitch, homeStarters]);
  const awayPitch = useMemo(() => toPitch(awayStarters, "a", AWAY_TINT, AWAY_INK), [toPitch, awayStarters]);
  const homeFormation = useMemo(() => formationOf(homeStarters), [homeStarters]);
  const awayFormation = useMemo(() => formationOf(awayStarters), [awayStarters]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <SkeletonListRow count={8} avatar />
      </View>
    );
  }

  if (error && !kadro) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (!(kadro?.home?.length || kadro?.away?.length)) {
    return (
      <EmptyState
        icon="people-outline"
        title="Kadrolar açıklanmadı"
        body="Takımlar kadrolarını girdiğinde saha dizilişi ve yedekler burada görünür."
      />
    );
  }

  const anyStarters = homePitch.length > 0 || awayPitch.length > 0;
  const pitchWidth = width - layout.screenPadding * 2;

  return (
    <>
      <Animated.ScrollView {...scrollProps} refreshControl={refreshControl} contentContainerStyle={styles.content}>
        {anyStarters ? (
          <View style={styles.pitchBlock}>
            <TeamStrip
              name={match.second_team_name}
              logo={awayLogo}
              formation={awayFormation}
              tint={AWAY_TINT}
              label="Deplasman"
            />
            <PitchView players={homePitch} opponents={awayPitch} width={pitchWidth} />
            <TeamStrip
              name={match.first_team_name}
              logo={homeLogo}
              formation={homeFormation}
              tint={HOME_TINT}
              label="Ev sahibi"
            />
          </View>
        ) : (
          <PaperCard style={styles.noPitch}>
            <EmptyState
              icon="football-outline"
              variant="inline"
              compact
              title="İlk kadro girilmedi"
              body="Takımlar ilk sekizlerini açıklamadı. Girilmiş oyuncular aşağıda."
            />
          </PaperCard>
        )}

        <View style={styles.segment}>
          <SegmentedControl items={sideItems} value={side} onChange={setSide} />
        </View>

        {starters.length ? (
          <>
            <SectionHeader title="İlk kadro" meta={`${starters.length} oyuncu`} />
            <PaperCard>
              {starters.map((player, index) => (
                <LineupPlayerRow
                  key={playerKey(player, index)}
                  player={player}
                  contrib={contribFor(contribById, player)}
                  sub={subFor(substitutions, player)}
                  first={index === 0}
                  onPress={setSheetPlayer}
                />
              ))}
            </PaperCard>
          </>
        ) : null}

        {bench.length ? (
          <>
            <SectionHeader title="Yedekler" meta={`${bench.length} oyuncu`} />
            <PaperCard>
              {bench.map((player, index) => (
                <LineupPlayerRow
                  key={playerKey(player, index)}
                  player={player}
                  contrib={contribFor(contribById, player)}
                  sub={subFor(substitutions, player)}
                  first={index === 0}
                  onPress={setSheetPlayer}
                />
              ))}
            </PaperCard>
          </>
        ) : null}

        {!starters.length && !bench.length ? (
          <EmptyState
            icon="people-outline"
            variant="inline"
            title="Bu takımın kadrosu yok"
            body="Takım kadrosunu henüz girmedi."
          />
        ) : null}
      </Animated.ScrollView>

      <PlayerSheet
        player={sheetPlayer}
        contrib={sheetPlayer ? contribFor(contribById, sheetPlayer) : null}
        sub={sheetPlayer ? subFor(substitutions, sheetPlayer) : null}
        onClose={() => setSheetPlayer(null)}
        onOpen={openPlayer}
      />
    </>
  );
}

const LINE_RANK: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
function byLine(list: KadroPlayer[]): KadroPlayer[] {
  return list
    .map((row, index) => ({ row, index, rank: row.position ? LINE_RANK[positionLine(row.position)] : 4 }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.row);
}

function contribFor(map: Map<number, ContribRow>, player: KadroPlayer): ContribRow | null {
  const id = playerIdOf(player);
  return id ? map.get(id) ?? null : null;
}

function subFor(map: Map<number, SubInfo>, player: KadroPlayer): SubInfo | null {
  const id = playerIdOf(player);
  return id ? map.get(id) ?? null : null;
}

/** Sahanın üstündeki/altındaki takım şeridi: renk noktası · arma · ad · diziliş. */
const TeamStrip = memo(function TeamStrip({
  name,
  logo,
  formation,
  tint,
  label,
}: {
  name: string;
  logo: string | null;
  formation: string | null;
  tint: string;
  label: string;
}) {
  return (
    <View style={styles.strip} accessible accessibilityLabel={`${label}: ${name}${formation ? `, diziliş ${formation}` : ""}`}>
      <View style={[styles.stripDot, { backgroundColor: tint }]} />
      <TeamLogo name={name} logo={logo} size={layout.crestSm} />
      <Text style={styles.stripName} numberOfLines={1} {...textScale.dense}>
        {name}
      </Text>
      {formation ? (
        <View style={styles.formation}>
          <Text style={styles.formationText} {...textScale.badge}>
            {formation}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

/**
 * Kadro satırı — mevki etiketi · avatar · ad/ayrıntı · katkılar · reyting.
 *
 * MEVKİ RENKLİ ÜÇ HARFTİR (KAL · DEF · ORT · FOR): avatar halkası ve etiket
 * aynı rengi taşır; renk tek başına anlam taşımaz, yanında daima harf durur.
 */
const LineupPlayerRow = memo(function LineupPlayerRow({
  player,
  contrib,
  sub,
  first,
  onPress,
}: {
  player: KadroPlayer;
  contrib: ContribRow | null;
  sub: SubInfo | null;
  first: boolean;
  onPress: (player: KadroPlayer) => void;
}) {
  const name = playerNameOf(player);
  const line = player.position ? positionLine(player.position) : null;
  const tone = positionColor(palette, line);
  const rating = player.puan != null ? Number(player.puan) : null;
  const shirt = player.number === "" || player.number == null ? null : String(player.number);

  const meta = [
    positionLabel(player.position) || null,
    shirt ? `#${shirt}` : null,
    player.captain ? "Kaptan" : null,
    player.isGuest ? "Misafir" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={() => onPress(player)}
      style={[styles.playerRow, first ? null : styles.ruled]}
      accessibilityRole="button"
      accessibilityLabel={`${name}${meta ? `, ${meta}` : ""}`}
    >
      <Text style={[styles.pos, { color: tone }]} {...textScale.badge}>
        {positionBadge(line)}
      </Text>

      <Avatar name={name} image={player.playerImg} size={36} />

      <View style={styles.playerTexts}>
        <Text style={styles.playerName} numberOfLines={1} {...textScale.dense}>
          {name}
        </Text>
        {meta ? (
          <Text style={styles.playerMeta} numberOfLines={1} {...textScale.dense}>
            {meta}
          </Text>
        ) : null}
      </View>

      <Contributions contrib={contrib} sub={sub} />

      <RatingPill value={rating != null && Number.isFinite(rating) && rating > 0 ? rating : null} size="sm" />
    </Touchable>
  );
});

/** Satırın sağındaki küçük işaretler: ⚽×2 · asist · kart · ↑/↓ dakika. */
const Contributions = memo(function Contributions({
  contrib,
  sub,
}: {
  contrib: ContribRow | null;
  sub: SubInfo | null;
}) {
  const marks: React.ReactNode[] = [];
  if (contrib?.goals) marks.push(<Mark key="g" kind="goal" count={contrib.goals} />);
  if (contrib?.assists) marks.push(<Mark key="a" kind="assist" count={contrib.assists} />);
  if (contrib?.cards) marks.push(<Mark key="k" kind="yellow" count={contrib.cards} />);
  if (sub?.in != null) {
    marks.push(
      <View key="in" style={styles.mark}>
        <Ionicons name="arrow-up" size={11} color={colors.win} />
        <Text style={[styles.markText, { color: colors.win }]} {...textScale.badge}>
          {`${sub.in}'`}
        </Text>
      </View>,
    );
  }
  if (sub?.out != null) {
    marks.push(
      <View key="out" style={styles.mark}>
        <Ionicons name="arrow-down" size={11} color={colors.loss} />
        <Text style={[styles.markText, { color: colors.loss }]} {...textScale.badge}>
          {`${sub.out}'`}
        </Text>
      </View>,
    );
  }
  if (!marks.length) return null;
  return <View style={styles.marks}>{marks}</View>;
});

const Mark = memo(function Mark({ kind, count }: { kind: EventIconKind; count: number }) {
  return (
    <View style={styles.mark}>
      <EventIcon kind={kind} size={13} />
      {count > 1 ? (
        <Text style={styles.markText} {...textScale.badge}>
          {count}
        </Text>
      ) : null}
    </View>
  );
});

/**
 * Oyuncu alt sayfası — kim, nasıl oynadı, sayfasına git.
 *
 * ISI HARİTASI YOK: sunucu oyuncu konum verisi tutmuyor. Uydurma bir ısı
 * haritası, gerçek verinin yanında duran sahte bir grafik olurdu.
 */
const PlayerSheet = memo(function PlayerSheet({
  player,
  contrib,
  sub,
  onClose,
  onOpen,
}: {
  player: KadroPlayer | null;
  contrib: ContribRow | null;
  sub: SubInfo | null;
  onClose: () => void;
  onOpen: (playerId: number) => void;
}) {
  const playerId = player ? playerIdOf(player) : null;
  const linkable = Boolean(playerId) && !player?.isGuest;
  const name = player ? playerNameOf(player) : "";
  const rating = player?.puan != null ? Number(player.puan) : null;

  const meta = player
    ? [
        positionLabel(player.position) || null,
        player.number !== "" && player.number != null ? `Forma ${player.number}` : null,
        player.captain ? "Kaptan" : null,
        player.isGuest ? "Misafir" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const subLine =
    sub?.in != null ? `${sub.in}. dakikada oyuna girdi` : sub?.out != null ? `${sub.out}. dakikada oyundan çıktı` : null;

  return (
    <BottomSheet visible={player != null} onClose={onClose} title={name}>
      {player ? (
        <View style={styles.sheetBody}>
          <View style={styles.sheetHead}>
            <Avatar name={name} image={player.playerImg} size={56} />
            <View style={styles.sheetTexts}>
              {meta ? (
                <Text style={styles.sheetMeta} numberOfLines={2} {...textScale.dense}>
                  {meta}
                </Text>
              ) : null}
              {subLine ? (
                <Text style={styles.sheetSub} numberOfLines={1} {...textScale.dense}>
                  {subLine}
                </Text>
              ) : null}
            </View>
            {rating != null && Number.isFinite(rating) && rating > 0 ? <RatingPill value={rating} size="lg" /> : null}
          </View>

          <View style={styles.sheetStats}>
            <SheetStat label="Gol" value={contrib?.goals ?? 0} />
            <View style={styles.sheetAxis} />
            <SheetStat label="Asist" value={contrib?.assists ?? 0} />
            <View style={styles.sheetAxis} />
            <SheetStat label="Kart" value={contrib?.cards ?? 0} />
          </View>

          {linkable && playerId ? (
            <Button
              label="Oyuncu sayfasına git"
              icon="arrow-forward"
              fullWidth
              onPress={() => {
                onClose();
                onOpen(playerId);
              }}
            />
          ) : player.isGuest ? (
            <Text style={styles.sheetNote} {...textScale.dense}>
              Misafir oyuncuların kalıcı profili yoktur.
            </Text>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
});

const SheetStat = memo(function SheetStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.sheetStat}>
      <Text style={[styles.sheetStatValue, value === 0 ? styles.sheetStatZero : null]} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.sheetStatLabel} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingTop: space.lg,
    paddingBottom: space.huge * 2,
  },
  loading: {
    paddingTop: space.lg,
  },
  ruled: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },

  /* — Saha — */
  pitchBlock: {
    paddingHorizontal: layout.screenPadding,
  },
  noPitch: {
    paddingVertical: space.sm,
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 44,
    paddingHorizontal: space.xs,
  },
  stripDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
  },
  stripName: {
    ...type.h4,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  formation: {
    height: 24,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    justifyContent: "center",
  },
  formationText: {
    ...type.tableNumStrong,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textPrimary,
  },

  segment: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xl,
  },

  /* — Kadro satırı — */
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 60,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  pos: {
    ...type.micro,
    width: 26,
  },
  playerTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  playerName: {
    ...type.h4,
    fontSize: 14,
    color: colors.textPrimary,
  },
  playerMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  marks: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  mark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  markText: {
    ...type.micro,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
  },

  /* — Alt sayfa — */
  sheetBody: {
    gap: space.lg,
    paddingBottom: space.sm,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  sheetTexts: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  sheetMeta: {
    ...type.body,
    color: colors.textSecondary,
  },
  sheetSub: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  sheetStats: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  sheetAxis: {
    width: hairline,
    height: 30,
    backgroundColor: colors.border,
  },
  sheetStat: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  sheetStatValue: {
    ...type.metric,
    color: colors.textPrimary,
  },
  sheetStatZero: {
    color: colors.textTertiary,
  },
  sheetStatLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  sheetNote: {
    ...type.bodySm,
    color: colors.textTertiary,
    textAlign: "center",
  },
});
