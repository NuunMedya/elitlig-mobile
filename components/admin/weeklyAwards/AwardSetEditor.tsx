/**
 * Haftanın enleri seti düzenleyici — dört adım tek akışta.
 *
 * Web: weeklyAwards/WeeklyAwards.js (düzenleme akışı).
 *   1 Kapsam            başlık, lig + sezon (zorunlu), tarih aralığı, not
 *   2 Bireysel ödüller  oyuncu, kaleci, defans, orta saha, forvet,
 *                       centilmen ve takım — her biri tek seçim
 *   3 Haftanın kadrosu  en fazla 11 oyuncu; mevki grubu ve sıra elle
 *                       ayarlanır, formasyon kendiliğinden hesaplanır
 *   4 Önizleme          özet + yayın doğrulama uyarıları; taslak kaydet,
 *                       yayınla, yayından al, taslağa al
 * Lig ve sezon seçilmeden kaydetme / yayınlama yapılmaz (sunucu kuralı).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DateField, InfoLine, Panel, SelectField, confirmAction } from "@/components/admin";
import { Avatar, Badge, Button, Chip, ChipGroup, Input, TeamLogo, Touchable, useToast } from "@/components/ui";
import { StepRail } from "@/components/admin/matches/opsKit";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import {
  AWARD_LABELS,
  computeFormation,
  createAwardSet,
  formatEtl,
  getAwardLeagues,
  getAwardSeasons,
  INDIVIDUAL,
  MAX_SQUAD,
  payloadFromForm,
  POS_GROUPS,
  publishAwardSet,
  searchAwardPlayers,
  searchAwardTeams,
  SET_STATUS_LABELS,
  unpublishAwardSet,
  updateAwardSet,
  warningText,
  withdrawAwardSet,
  type AwardForm,
  type AwardPlayer,
  type AwardTeam,
  type PositionGroup,
  type PublishWarning,
} from "@/lib/api/admin/weeklyAwards";
import type { WeeklyAwardType } from "@/lib/api/weeklyAwards";
import { mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { PlayerPickerSheet, TeamPickerSheet } from "./AwardPickers";

type Step = "scope" | "awards" | "squad" | "preview";

export function AwardSetEditor({ initial, onClose }: { initial: AwardForm; onClose: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canCreate = hasAnyPermission(auth.user, ["weekly_awards.create"]);
  const canUpdate = hasAnyPermission(auth.user, ["weekly_awards.update"]);
  const canPublish = hasAnyPermission(auth.user, ["weekly_awards.publish"]);
  const canUnpublish = hasAnyPermission(auth.user, ["weekly_awards.unpublish"]);

  const [f, setF] = useState<AwardForm>(initial);
  const [step, setStep] = useState<Step>("scope");
  const [busy, setBusy] = useState<string>("");
  const [warnings, setWarnings] = useState<PublishWarning[]>([]);
  const [players, setPlayers] = useState<Record<number, AwardPlayer>>({});
  const [teams, setTeams] = useState<Record<number, AwardTeam>>({});
  const [picker, setPicker] = useState<null | { kind: "individual"; type: WeeklyAwardType; pos: PositionGroup | null } | { kind: "squad" } | { kind: "team" }>(null);
  const set = (v: Partial<AwardForm>) => setF((p) => ({ ...p, ...v }));
  const editable = f.id ? canUpdate : canCreate;

  const leagues = useQuery({ queryKey: ["admin", "weeklyAwards", "leagues", f.city_id ?? null], queryFn: () => getAwardLeagues(f.city_id) });
  const seasons = useQuery({
    queryKey: ["admin", "weeklyAwards", "seasons", f.league_id, f.city_id ?? null],
    queryFn: () => getAwardSeasons(f.league_id!, f.city_id),
    enabled: f.league_id != null,
  });

  const mergePlayers = useCallback((list: AwardPlayer[]) => setPlayers((prev) => ({ ...prev, ...Object.fromEntries(list.map((p) => [Number(p.playerId), p])) })), []);

  // Kayıtlı setin oyuncu / takım gösterim bilgileri hidratlanır.
  useEffect(() => {
    const ids = [...Object.values(initial.individual), ...initial.squad.map((s) => s.playerId)].filter(Boolean) as number[];
    if (ids.length) void searchAwardPlayers({ ids }).then(mergePlayers).catch(() => undefined);
    if (initial.teamId) void searchAwardTeams({ ids: [initial.teamId] }).then((list) => setTeams((p) => ({ ...p, ...Object.fromEntries(list.map((t) => [t.teamId, t])) }))).catch(() => undefined);
  }, [initial, mergePlayers]);

  const ensureScope = () => {
    if (f.league_id && f.season_id) return true;
    toast.show({ message: !f.league_id ? "Lig seçimi zorunludur. Kapsam adımından bir lig seç." : "Sezon seçimi zorunludur. Kapsam adımından bir sezon seç.", tone: "danger" });
    setStep("scope");
    return false;
  };

  const run = async (name: string, task: () => Promise<void>) => {
    setBusy(name);
    try {
      await task();
      void queryClient.invalidateQueries({ queryKey: ["admin", "weeklyAwards", "list"] });
    } catch (e) {
      toast.show({ message: errorText(e), tone: "danger" });
    } finally {
      setBusy("");
    }
  };

  const saveDraft = () =>
    ensureScope() &&
    run("save", async () => {
      const body = payloadFromForm(f);
      const saved = f.id ? await updateAwardSet(f.id, body) : await createAwardSet(body);
      set({ id: saved.id ?? f.id, status: saved.status ?? f.status });
      toast.show({ message: "Taslak kaydedildi.", tone: "success" });
    });

  const publish = async () => {
    if (!ensureScope()) return;
    if (!(await confirmAction({ title: "Set yayınlansın mı?", message: "Anasayfada kartlar şeklinde görünür; oyuncuların piyasa değerleri güncellenir.", confirmLabel: "Yayınla" }))) return;
    await run("publish", async () => {
      let id = f.id;
      if (!id) id = (await createAwardSet(payloadFromForm(f))).id;
      else await updateAwardSet(id, payloadFromForm(f));
      const res = await publishAwardSet(id);
      setWarnings(res.warnings ?? []);
      set({ id, status: "PUBLISHED" });
      toast.show({ message: "Yayınlandı. Piyasa değerleri güncelleniyor.", tone: "success" });
    });
  };

  const withdraw = async () => {
    if (!f.id) return;
    if (!(await confirmAction({ title: "Yayından alınsın mı?", message: "Set görünmez olur; oyuncuların piyasa değeri korunur.", confirmLabel: "Yayından al" }))) return;
    await run("withdraw", async () => {
      await withdrawAwardSet(f.id!);
      set({ status: "UNPUBLISHED" });
      toast.show({ message: "Yayından alındı. Oyuncuların piyasa değeri korunuyor.", tone: "success" });
    });
  };
  const unpublish = async () => {
    if (!f.id) return;
    if (!(await confirmAction({ title: "Taslağa alınsın mı?", message: "Set yayından kalkar ve piyasa değeri etkisi geri alınır.", confirmLabel: "Taslağa al", destructive: true }))) return;
    await run("unpublish", async () => {
      await unpublishAwardSet(f.id!);
      set({ status: "DRAFT" });
      toast.show({ message: "Taslağa alındı. Ödülün piyasa değeri etkisi geri alındı.", tone: "success" });
    });
  };

  const squadIds = f.squad.map((s) => s.playerId);
  const playerName = (id?: number | null) => (id ? players[id]?.playerName ?? `Oyuncu #${id}` : null);
  const moveSquad = (i: number, d: number) => {
    const t = i + d;
    if (t < 0 || t >= f.squad.length) return;
    const next = [...f.squad];
    [next[i], next[t]] = [next[t], next[i]];
    set({ squad: next });
  };

  const onPick = (p: AwardPlayer) => {
    mergePlayers([p]);
    if (picker?.kind === "individual") set({ individual: { ...f.individual, [picker.type]: p.playerId } });
    if (picker?.kind === "squad" && f.squad.length < MAX_SQUAD && !squadIds.includes(p.playerId)) {
      set({ squad: [...f.squad, { playerId: Number(p.playerId), group: p.positionGroup || "MIDFIELDER" }] });
    }
  };

  const status = f.status ?? "DRAFT";
  const team = f.teamId ? teams[f.teamId] : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.rowBetween}>
        <Button label="Set listesi" icon="chevron-back" variant="ghost" size="sm" onPress={onClose} disabled={Boolean(busy)} />
        <Badge label={SET_STATUS_LABELS[status] ?? status} tone={status === "PUBLISHED" ? "win" : status === "UNPUBLISHED" ? "warn" : "neutral"} />
      </View>
      <StepRail<Step>
        items={[
          { key: "scope", label: "Kapsam", icon: "options-outline", done: Boolean(f.league_id && f.season_id && f.start_date && f.end_date) },
          { key: "awards", label: "Ödüller", icon: "ribbon-outline", done: Boolean(f.teamId) && INDIVIDUAL.every(({ type: t }) => f.individual[t]) },
          { key: "squad", label: "Kadro", icon: "people-outline", done: f.squad.length >= MAX_SQUAD, meta: `${f.squad.length}/${MAX_SQUAD}` },
          { key: "preview", label: "Önizleme", icon: "eye-outline" },
        ]}
        value={step}
        onChange={setStep}
      />

      {step === "scope" ? (
        <View style={styles.wrap}>
          <Input label="Başlık" value={f.title} onChangeText={(t) => set({ title: t })} editable={editable} placeholder="Örn. 12. Hafta" />
          <SelectField<number>
            label="Lig"
            required
            value={f.league_id}
            options={(leagues.data ?? []).map((l) => ({ value: l.id, label: l.label }))}
            onChange={(v) => set({ league_id: v, season_id: null })}
            disabled={!editable}
          />
          <SelectField<number>
            label="Sezon"
            required
            value={f.season_id}
            options={(seasons.data ?? []).map((s) => ({ value: s.id, label: s.label }))}
            placeholder={f.league_id ? "Sezon seç" : "Önce lig seç"}
            onChange={(v) => set({ season_id: v })}
            disabled={!editable || !f.league_id}
          />
          <DateField label="Başlangıç" required value={f.start_date} onChange={(v) => set({ start_date: v ?? f.start_date })} />
          <DateField label="Bitiş" required value={f.end_date} onChange={(v) => set({ end_date: v ?? f.end_date })} hint="Yayın doğrulaması oyuncuların bu aralıkta oynayıp oynamadığına bakar." />
          <Input label="Not" value={f.notes} onChangeText={(t) => set({ notes: t })} multiline editable={editable} />
          <Button label="Ödüllere geç" icon="arrow-forward" iconPosition="right" variant="secondary" onPress={() => setStep("awards")} />
        </View>
      ) : null}

      {step === "awards" ? (
        <View style={styles.wrap}>
          {INDIVIDUAL.map(({ type: t, pos }) => {
            const id = f.individual[t] ?? null;
            const p = id ? players[id] : null;
            return (
              <SlotRow
                key={t}
                label={AWARD_LABELS[t]}
                value={playerName(id)}
                meta={p ? [p.teamName, p.marketValue != null ? formatEtl(p.marketValue) : null].filter(Boolean).join(" · ") : null}
                image={p?.playerImg}
                disabled={!editable}
                onPress={() => setPicker({ kind: "individual", type: t, pos })}
                onClear={id ? () => set({ individual: { ...f.individual, [t]: null } }) : undefined}
              />
            );
          })}
          <SlotRow
            label={AWARD_LABELS.WEEKLY_TEAM}
            value={f.teamId ? team?.teamName ?? `Takım #${f.teamId}` : null}
            team
            image={team?.teamLogo}
            disabled={!editable}
            onPress={() => setPicker({ kind: "team" })}
            onClear={f.teamId ? () => set({ teamId: null }) : undefined}
          />
        </View>
      ) : null}

      {step === "squad" ? (
        <View style={styles.wrap}>
          <Text style={styles.hint} {...textScale.long}>
            Formasyon: {computeFormation(f.squad)} · en fazla {MAX_SQUAD} oyuncu. Mevki çipine dokunarak oyuncunun dizilişteki yerini değiştir.
          </Text>
          {f.squad.map((s, i) => {
            const p = players[s.playerId];
            return (
              <View key={s.playerId} style={styles.squadRow}>
                <View style={styles.order}>
                  <Touchable onPress={() => moveSquad(i, -1)} disabled={i === 0} accessibilityLabel="Yukarı taşı" accessibilityRole="button" hitSlop={6}>
                    <Ionicons name="chevron-up" size={18} color={i === 0 ? colors.textDisabled : colors.textSecondary} />
                  </Touchable>
                  <Touchable onPress={() => moveSquad(i, 1)} disabled={i === f.squad.length - 1} accessibilityLabel="Aşağı taşı" accessibilityRole="button" hitSlop={6}>
                    <Ionicons name="chevron-down" size={18} color={i === f.squad.length - 1 ? colors.textDisabled : colors.textSecondary} />
                  </Touchable>
                </View>
                <Avatar name={playerName(s.playerId)} image={mediaUrl(p?.playerImg)} size={36} />
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                    {playerName(s.playerId)}
                  </Text>
                  <ChipGroup scrollable contentPadding={0}>
                    {POS_GROUPS.map((g) => (
                      <Chip
                        key={g.value}
                        size="sm"
                        label={g.label}
                        selected={s.group === g.value}
                        onPress={() => set({ squad: f.squad.map((x, idx) => (idx === i ? { ...x, group: g.value } : x)) })}
                      />
                    ))}
                  </ChipGroup>
                </View>
                <Touchable
                  onPress={() => set({ squad: f.squad.filter((x) => x.playerId !== s.playerId) })}
                  accessibilityLabel={`${playerName(s.playerId)} oyuncusunu kadrodan kaldır`}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Ionicons name="close-circle-outline" size={22} color={colors.danger} />
                </Touchable>
              </View>
            );
          })}
          {editable && f.squad.length < MAX_SQUAD ? <Button label="Oyuncu ekle" icon="add" variant="secondary" onPress={() => setPicker({ kind: "squad" })} /> : null}
        </View>
      ) : null}

      {step === "preview" ? (
        <View style={styles.wrap}>
          <Panel title="Kapsam">
            <InfoLine label="Başlık" value={f.title || "—"} />
            <InfoLine label="Lig" value={leagues.data?.find((l) => l.id === f.league_id)?.label ?? "Seçilmedi"} tone={f.league_id ? undefined : "danger"} />
            <InfoLine label="Sezon" value={seasons.data?.find((s) => s.id === f.season_id)?.label ?? "Seçilmedi"} tone={f.season_id ? undefined : "danger"} />
            <InfoLine label="Tarih" value={`${formatDate(f.start_date)} – ${formatDate(f.end_date)}`} />
          </Panel>
          <Panel title="Bireysel ödüller">
            {INDIVIDUAL.map(({ type: t }) => (
              <InfoLine key={t} label={AWARD_LABELS[t]} value={playerName(f.individual[t]) ?? "—"} />
            ))}
            <InfoLine label={AWARD_LABELS.WEEKLY_TEAM} value={f.teamId ? team?.teamName ?? `Takım #${f.teamId}` : "—"} />
          </Panel>
          <Panel title={`Haftanın kadrosu · ${computeFormation(f.squad)}`}>
            {POS_GROUPS.map((g) => {
              const names = f.squad.filter((s) => s.group === g.value).map((s) => playerName(s.playerId));
              return <InfoLine key={g.value} label={g.label} value={names.join(", ") || "—"} />;
            })}
          </Panel>
          {warnings.length ? (
            <Panel title="Yayın doğrulama uyarıları">
              {warnings.map((w, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <Text key={i} style={styles.warn} {...textScale.long}>
                  {warningText(w, w.playerId ? players[w.playerId]?.playerName : null)}
                </Text>
              ))}
            </Panel>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        {editable ? <Button label="Taslak kaydet" icon="save-outline" variant="secondary" loading={busy === "save"} disabled={Boolean(busy)} onPress={() => void saveDraft()} /> : null}
        {canPublish && editable && status !== "PUBLISHED" ? (
          <Button label={status === "UNPUBLISHED" ? "Yeniden yayınla" : "Yayınla"} icon="megaphone-outline" loading={busy === "publish"} disabled={Boolean(busy)} onPress={() => void publish()} haptic="success" />
        ) : null}
        {canUnpublish && f.id && status === "PUBLISHED" ? <Button label="Yayından al" variant="secondary" loading={busy === "withdraw"} disabled={Boolean(busy)} onPress={() => void withdraw()} /> : null}
        {canUnpublish && f.id && (status === "PUBLISHED" || status === "UNPUBLISHED") ? (
          <Button label="Taslağa al" variant="ghost" loading={busy === "unpublish"} disabled={Boolean(busy)} onPress={() => void unpublish()} />
        ) : null}
      </View>

      <PlayerPickerSheet
        visible={picker?.kind === "individual" || picker?.kind === "squad"}
        onClose={() => setPicker(null)}
        title={picker?.kind === "individual" ? AWARD_LABELS[picker.type] : "Kadroya oyuncu ekle"}
        position={picker?.kind === "individual" ? picker.pos : null}
        cityId={f.city_id}
        exclude={picker?.kind === "squad" ? squadIds : []}
        onPick={onPick}
      />
      <TeamPickerSheet
        visible={picker?.kind === "team"}
        onClose={() => setPicker(null)}
        cityId={f.city_id}
        onPick={(t) => {
          setTeams((p) => ({ ...p, [t.teamId]: t }));
          set({ teamId: t.teamId });
        }}
      />
    </View>
  );
}

function SlotRow({
  label,
  value,
  meta,
  image,
  team,
  disabled,
  onPress,
  onClear,
}: {
  label: string;
  value: string | null;
  meta?: string | null;
  image?: string | null;
  team?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onClear?: () => void;
}) {
  return (
    <Touchable style={styles.slot} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}: ${value || "seçilmedi"}`}>
      {team ? <TeamLogo name={value} logo={mediaUrl(image)} size={40} /> : <Avatar name={value} image={mediaUrl(image)} size={40} />}
      <View style={styles.flex}>
        <Text style={styles.slotLabel} {...textScale.dense}>
          {label}
        </Text>
        <Text style={[styles.name, !value ? styles.placeholder : null]} numberOfLines={1} {...textScale.dense}>
          {value || "Seçilmedi"}
        </Text>
        {meta ? (
          <Text style={styles.hint} numberOfLines={1} {...textScale.dense}>
            {meta}
          </Text>
        ) : null}
      </View>
      {onClear && !disabled ? (
        <Touchable onPress={onClear} accessibilityLabel={`${label} seçimini kaldır`} accessibilityRole="button" hitSlop={8}>
          <Ionicons name="close-circle-outline" size={22} color={colors.textTertiary} />
        </Touchable>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1, gap: 2 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hint: { ...type.caption, color: colors.textSecondary },
  warn: { ...type.bodySm, color: colors.warn },
  name: { ...type.h4, color: colors.textPrimary },
  placeholder: { color: colors.textDisabled },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  slotLabel: { ...type.overline, color: colors.textTertiary },
  squadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  order: { gap: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
