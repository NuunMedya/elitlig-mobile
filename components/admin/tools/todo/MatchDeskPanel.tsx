/**
 * MAÇ MASASI — maç görevi kartının iş yeri (web todos/MatchDesk.js).
 *
 * Aşamalar gerçek veriden işaretlenir (kadro, gol müziği, yayın linki,
 * canlı akış, maç sonu girişleri). Her takım için iletişim (ara / WhatsApp /
 * e-posta), kadro durumu ve "Takımdan kadro talep et" (WhatsApp mesajı hazır
 * açılır, talep karta kaydedilir), gol müziği isteği ve bağlantısı.
 *
 * MOBİLDE YOK: maç personeli düzenleme paneli (MatchCrewPanel) — bu iş
 * "Toplu personel atama" ekranındadır. Web'in kadro/canlı akış/maç sonu
 * editör sayfalarına giden bağlantılar yerine maçın uygulama sayfası açılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAdminMutation } from "@/components/admin";
import { BottomSheet, Button, Input, Skeleton, Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDateTime, formatPhone } from "@/lib/admin/format";
import {
  getTodoDesk,
  requestGoalMusic,
  requestLineup,
  todoKeys,
  updateTodo,
  type TodoDesk,
  type TodoDeskTeam,
  type TodoStage,
  type TodoTask,
} from "@/lib/api/todos";
import { WEB_BASE_URL } from "@/lib/config";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { ProgressBar } from "./TodoCards";
import { whatsappNumber } from "./boardUtils";

const GROUP_LABELS: Record<string, string> = { hazirlik: "Hazırlık", yayin: "Yayın", mac_sonu: "Maç sonu" };

export function StageList({ stages }: { stages: TodoStage[] }) {
  const groups = ["hazirlik", "yayin", "mac_sonu"]
    .map((key) => ({ key, items: stages.filter((stage) => stage.group === key) }))
    .filter((group) => group.items.length);
  return (
    <View style={styles.stages}>
      {groups.map((group) => (
        <View key={group.key} style={styles.stageGroup}>
          <Text style={styles.label} {...textScale.dense}>
            {GROUP_LABELS[group.key]}
          </Text>
          {group.items.map((stage) => (
            <View key={stage.key} style={styles.stage} accessibilityLabel={`${stage.done ? stage.label : stage.pendingLabel || stage.label}: ${stage.done ? "tamamlandı" : "bekliyor"}`}>
              <Ionicons
                name={stage.done ? "checkmark-circle" : stage.locked ? "lock-closed-outline" : "ellipse-outline"}
                size={18}
                color={stage.done ? colors.win : colors.textTertiary}
              />
              <Text style={[styles.stageText, stage.done ? null : styles.pending]} {...textScale.dense}>
                {stage.done ? stage.label : stage.pendingLabel || stage.label}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const whenText = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "long", weekday: "long", hour: "2-digit", minute: "2-digit" }) : "";

/** Kadro talebi mesajı (web buildLineupMessage ile aynı metin). */
function lineupMessage(member: boolean, team: TodoDeskTeam, task: TodoTask, matchId: number) {
  const link = member ? `${WEB_BASE_URL}/panel?mac=${matchId}` : `${WEB_BASE_URL}/kayit-ol`;
  const greeting = team.contact?.name ? `Merhaba ${team.contact.name},` : "Merhaba,";
  const when = whenText(task.match?.startsAt);
  const label = task.match?.label || "maç";
  const text = member
    ? `${greeting} ${when ? `${when} tarihli ` : ""}${label} maçı için ${team.name || "takımınızın"} kadrosunu girmenizi rica ediyoruz. ` +
      `Aşağıdaki bağlantıdan elitlig panelinize girip maçın kadrosunu girebilirsiniz:\n${link}\n\nTeşekkürler, elitlig yayın ekibi`
    : `${greeting} ${when ? `${when} tarihli ` : ""}${label} maçı için ${team.name || "takımınızın"} kadrosunu sistemden girebilmeniz için elitlig'e üye olmanız gerekiyor. ` +
      `Aşağıdaki bağlantıdan üye olup profil tipi olarak takım başkanını seçerek takımınızı bağlayabilirsiniz:\n${link}\n\n` +
      "Üyeliğiniz tamamlanınca maçın kadrosunu panelinizden girebilirsiniz. Teşekkürler, elitlig yayın ekibi";
  return text;
}

export function MatchDeskPanel({ task, onChange }: { task: TodoTask; onChange: (item: TodoTask) => void }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const deskQuery = useQuery({ queryKey: todoKeys.desk(task.id), queryFn: () => getTodoDesk(task.id) });
  const [lineupTeam, setLineupTeam] = useState<TodoDeskTeam | null>(null);
  const isOwner = task.permissions.isOwner;

  const apply = (data: { item?: TodoTask; desk?: TodoDesk }) => {
    if (data.desk) queryClient.setQueryData(todoKeys.desk(task.id), (prev: { item: TodoTask; desk: TodoDesk } | undefined) => ({ item: data.item ?? prev?.item ?? task, desk: data.desk! }));
    if (data.item) onChange(data.item);
  };

  const music = useAdminMutation((teamId: number) => requestGoalMusic(task.id, teamId), {
    success: (r) => r.message || "Gol müziği istendi.",
    onSuccess: apply,
  });
  const saveMusic = useAdminMutation(({ teamId, url }: { teamId: number; url: string }) => updateTodo(task.id, { goal_music: { team_id: teamId, url } }), {
    success: "Gol müziği kaydedildi.",
    onSuccess: (item) => {
      onChange(item);
      void deskQuery.refetch();
    },
  });

  if (deskQuery.isLoading) return <Skeleton height={120} radius="md" />;
  if (deskQuery.error || !deskQuery.data) {
    return (
      <Text style={styles.error} {...textScale.long}>
        {errorText(deskQuery.error, "Maç bilgisi alınamadı.")}
      </Text>
    );
  }
  const { desk } = deskQuery.data;

  return (
    <View style={styles.desk}>
      <View style={styles.deskHead}>
        <View style={styles.flex}>
          <ProgressBar done={desk.done} total={desk.total} />
        </View>
        {desk.match.score ? (
          <Text style={styles.score} {...textScale.badge}>
            Skor {desk.match.score}
          </Text>
        ) : null}
      </View>
      <StageList stages={desk.stages} />

      {!desk.liveUnlocked ? (
        <View style={styles.lock}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.warn} />
          <Text style={[styles.flex, styles.lockText]} {...textScale.long}>
            {desk.lockReason || "Önce iki takımın kadrosunu girin"}. Kadrolar girilmeden canlı akış, yayın ve maç sonu işleri açılmaz.
          </Text>
        </View>
      ) : null}

      <View style={styles.links}>
        <Button label="Maç sayfası" icon="football-outline" size="sm" variant="secondary" onPress={() => router.push({ pathname: "/mac/[id]", params: { id: String(desk.match.id) } })} />
        <Button label="Maç yönetimi" icon="construct-outline" size="sm" variant="secondary" onPress={() => router.push("/yonetim/maclar" as never)} />
        {desk.match.streamUrl ? (
          <Button label="Canlı yayın" icon="videocam-outline" size="sm" variant="secondary" onPress={() => void Linking.openURL(desk.match.streamUrl!)} />
        ) : null}
      </View>

      {desk.teams.map((team) => (
        <TeamPanel
          key={team.side}
          team={team}
          isOwner={isOwner}
          busy={music.isPending || saveMusic.isPending}
          onRequest={(teamId) => music.mutate(teamId)}
          onSaveMusic={(teamId, url) => saveMusic.mutate({ teamId, url })}
          onLineup={setLineupTeam}
        />
      ))}

      <LineupSheet
        team={lineupTeam}
        task={task}
        matchId={desk.match.id}
        onClose={() => setLineupTeam(null)}
        onSent={(data) => {
          apply(data);
          toast.show({ message: data.message || "Kadro talebi kaydedildi.", tone: "success" });
        }}
      />
    </View>
  );
}

function TeamPanel({
  team,
  isOwner,
  busy,
  onRequest,
  onSaveMusic,
  onLineup,
}: {
  team: TodoDeskTeam;
  isOwner: boolean;
  busy: boolean;
  onRequest: (teamId: number) => void;
  onSaveMusic: (teamId: number, url: string) => void;
  onLineup: (team: TodoDeskTeam) => void;
}) {
  const [url, setUrl] = useState(team.goalMusic?.source === "card" ? team.goalMusic.url : "");
  const contact = team.contact;
  const wa = whatsappNumber(contact?.whatsapp || contact?.phone);
  const open = (href: string) => void Linking.openURL(href).catch(() => undefined);
  return (
    <View style={styles.team}>
      <Text style={styles.teamName} {...textScale.dense}>
        {team.name}
      </Text>

      <Text style={styles.label} {...textScale.dense}>
        İletişim
      </Text>
      {contact ? (
        <View style={styles.contact}>
          {contact.name ? (
            <Text style={styles.body} {...textScale.dense}>
              {contact.name}
              {contact.source === "yonetim" ? " (yönetimin girdiği)" : ""}
            </Text>
          ) : null}
          <View style={styles.links}>
            {contact.phone ? <Button label={formatPhone(contact.phone)} icon="call-outline" size="sm" variant="ghost" onPress={() => open(`tel:${contact.phone.replace(/\s/g, "")}`)} /> : null}
            {contact.phone2 ? <Button label={formatPhone(contact.phone2)} icon="call-outline" size="sm" variant="ghost" onPress={() => open(`tel:${contact.phone2.replace(/\s/g, "")}`)} /> : null}
            {wa ? <Button label="WhatsApp" icon="logo-whatsapp" size="sm" variant="ghost" onPress={() => open(`https://wa.me/${wa}`)} /> : null}
            {contact.email ? <Button label="E-posta" icon="mail-outline" size="sm" variant="ghost" onPress={() => open(`mailto:${contact.email}`)} /> : null}
          </View>
        </View>
      ) : (
        <Text style={styles.muted} {...textScale.dense}>
          Takımın iletişim bilgisi yok.
        </Text>
      )}

      <Text style={styles.label} {...textScale.dense}>
        Kadro
      </Text>
      <Text style={team.rosterCount ? styles.ok : styles.muted} {...textScale.dense}>
        {team.rosterCount ? `${team.rosterCount} oyuncu girildi` : "Kadro girilmedi"}
        {team.rosterReportedAt ? " · takım bildirdi" : ""}
      </Text>
      {team.lineupRequest ? (
        <Text style={styles.muted} {...textScale.dense}>
          {formatDateTime(team.lineupRequest.at)}
          {team.lineupRequest.member ? " · kadro takımdan istendi" : " · yetkiliye üyelik daveti gönderildi"}
        </Text>
      ) : null}
      {isOwner && team.teamId ? (
        <Button
          label={team.hasManagerAccount ? "Takımdan kadro talep et" : "Yetkiliyi üyeliğe davet et"}
          icon="logo-whatsapp"
          size="sm"
          variant="secondary"
          onPress={() => onLineup(team)}
          disabled={busy}
          style={styles.start}
        />
      ) : null}

      <Text style={styles.label} {...textScale.dense}>
        Gol müziği
      </Text>
      {team.goalMusic ? (
        <Touchable feedback="row" onPress={() => open(team.goalMusic!.url)} accessibilityRole="link">
          <Text style={styles.link} {...textScale.dense}>
            {team.goalMusic.title || "Dinle"}
            {team.goalMusic.label ? ` · ${team.goalMusic.label}` : ""}
          </Text>
        </Touchable>
      ) : (
        <Text style={styles.muted} {...textScale.dense}>
          Henüz girilmedi{team.goalMusicRequestedAt ? ` · ${formatDateTime(team.goalMusicRequestedAt)} tarihinde istendi` : ""}
        </Text>
      )}
      {isOwner && team.teamId ? (
        <>
          {!team.goalMusic ? (
            <Button
              label={team.goalMusicRequestedAt ? "Tekrar iste" : "Gol müziği iste"}
              size="sm"
              variant="ghost"
              icon="musical-notes-outline"
              onPress={() => onRequest(team.teamId!)}
              disabled={busy || !team.hasManagerAccount}
              style={styles.start}
            />
          ) : null}
          {!team.hasManagerAccount && !team.goalMusic ? (
            <Text style={styles.muted} {...textScale.dense}>
              Takımın panel hesabı olan yetkilisi yok; iletişimden arayın.
            </Text>
          ) : null}
          <View style={styles.musicRow}>
            <View style={styles.flex}>
              <Input value={url} onChangeText={setUrl} placeholder="https://… (gelen bağlantı)" autoCapitalize="none" keyboardType="url" size="sm" />
            </View>
            <Button label="Kaydet" size="sm" variant="secondary" onPress={() => onSaveMusic(team.teamId!, url)} disabled={busy} />
          </View>
        </>
      ) : null}
    </View>
  );
}

function LineupSheet({
  team,
  task,
  matchId,
  onClose,
  onSent,
}: {
  team: TodoDeskTeam | null;
  task: TodoTask;
  matchId: number;
  onClose: () => void;
  onSent: (data: { message?: string; item?: TodoTask; desk?: TodoDesk }) => void;
}) {
  const [text, setText] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Takım değişince mesaj ve numara yeniden hazırlanır.
  useEffect(() => {
    if (!team) return;
    setText(lineupMessage(Boolean(team.hasManagerAccount), team, task, matchId));
    setPhone(team.contact?.whatsapp || team.contact?.phone || "");
    setError(null);
  }, [team]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!team?.teamId) return;
    // WhatsApp önce açılır; talep kaydı ardından yapılır (web ile aynı sıra).
    const number = whatsappNumber(phone);
    void Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(text)}`).catch(() => undefined);
    setBusy(true);
    setError(null);
    try {
      const data = await requestLineup(task.id, team.teamId);
      onSent(data);
      onClose();
    } catch (e) {
      setError(errorText(e, "WhatsApp açıldı ama talep karta kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={team != null}
      onClose={onClose}
      title={team ? `${team.name} · kadro talebi` : "Kadro talebi"}
      snap="full"
      footer={<Button label="WhatsApp'ta gönder" icon="logo-whatsapp" onPress={send} loading={busy} fullWidth />}
    >
      {team ? (
        <View style={styles.sheet}>
          <Text style={styles.body} {...textScale.long}>
            {team.hasManagerAccount
              ? `${team.contact?.name || "Takım yetkilisi"} sisteme kayıtlı ve takımı yönetiyor. Mesajdaki bağlantı onu doğrudan bu maçın kadro girişine götürür; panel bildirimi de gider.`
              : "Takımın yetkilisi henüz üye değil. Mesaj, üye olma bağlantısını taşır; üye olup takımını bağladıktan sonra kadroyu panelinden girebilir."}
          </Text>
          <Input label="WhatsApp numarası" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="05xx xxx xx xx (boşsa kişiyi WhatsApp'ta seçersiniz)" />
          <Input label="Mesaj" value={text} onChangeText={setText} multiline numberOfLines={8} />
          {team.lineupRequest ? (
            <Text style={styles.muted} {...textScale.dense}>
              Son talep: {formatDateTime(team.lineupRequest.at)}
              {team.lineupRequest.member ? " · kadro bağlantısı" : " · üyelik daveti"}
            </Text>
          ) : null}
          {error ? (
            <Text style={styles.error} {...textScale.long}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  desk: { gap: space.md },
  deskHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  score: { ...type.tableNumStrong, color: colors.textPrimary },
  stages: { gap: space.md },
  stageGroup: { gap: space.xs },
  stage: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stageText: { flex: 1, ...type.bodySm, color: colors.textPrimary },
  pending: { color: colors.textSecondary },
  label: { ...type.label, color: colors.textSecondary },
  lock: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.warnDim },
  lockText: { ...type.bodySm, color: colors.textPrimary },
  links: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  team: { gap: space.xs, padding: space.md, borderRadius: radius.lg, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface2 },
  teamName: { ...type.h3, color: colors.textPrimary, marginBottom: space.xs },
  contact: { gap: space.xs },
  body: { ...type.body, color: colors.textPrimary },
  muted: { ...type.caption, color: colors.textTertiary },
  ok: { ...type.bodySm, color: colors.win },
  link: { ...type.bodySm, color: colors.brandAccent },
  start: { alignSelf: "flex-start" },
  musicRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  error: { ...type.bodySm, color: colors.danger },
  sheet: { gap: space.md },
});
