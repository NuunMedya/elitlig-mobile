import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAdminMutation } from "@/components/admin";
import { errorText } from "@/lib/admin/errors";
import { useToast } from "@/components/ui";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

import { cityKeys, puzzleKeys } from "./api";
import {
  acceptAcademyOffer,
  advanceCity2Step,
  getPrivacyPreferences,
  listAcademyPlayer,
  promoteAcademyPlayer,
  rejectAcademyOffer,
  releaseAcademyPlayer,
  setPrivacyPreferences,
  type City2AcceptResult,
  type PrivacyPreferences,
  type PrivacyKey,
  applaudCity2,
  confirmCity2Prestige,
  donateCity2Team,
  getCity2Season,
  getCity2Team,
  getCity2Visit,
  getCity2VisitList,
  previewCity2Prestige,
  type City2ApplauseResult,
  type City2DonateResult,
  type City2PrestigePreviewResult,
  type City2PrestigeResult,
  type City2TeamView,
  type City2VisitKind,
  type City2VisitView,
  buildCity2Stage,
  buyCity2Landmark,
  buyCity2Lock,
  careCity2,
  city2Keys,
  tradeCity2ElForStars,
  collectCity2El,
  fmtEl,
  getCity2,
  getCity2ElHistory,
  upgradeCity2El,
  type City2CollectResult,
  placeCity2Landmark,
  type City2Response,
  type City2State,
} from "./city2";

/**
 * Kulüp Şehri 2.0 durumu. `legacy` true ise sunucu /city2'yi tanımıyor (404):
 * ekran eski şehre düşer.
 */
export function useCity2() {
  const auth = useAuth();
  const query = useQuery({ queryKey: city2Keys.me(), queryFn: getCity2, enabled: Boolean(auth.user), staleTime: 20_000, retry: false });
  const legacy = query.error instanceof ApiError && query.error.status === 404;
  return { query, city2: query.data?.city2, legacy };
}

/** Yazma yanıtındaki yeni durumu önbelleğe yazar; bağlı tabloları tazeler. */
export function useCity2Write() {
  const queryClient = useQueryClient();
  return useCallback(
    (next: City2State) => {
      queryClient.setQueryData<City2Response>(city2Keys.me(), (current) => (current ? { ...current, city2: next } : { city2: next }));
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.me() });
      // Eski /city izdüşümü (günlük ödül kartı ve eski ekranlar) ve sıralamalar.
      void queryClient.invalidateQueries({ queryKey: cityKeys.me(), exact: true });
      void queryClient.invalidateQueries({ queryKey: cityKeys.leaderboard("all").slice(0, 3) });
      // EL defteri her yazmada değişebilir (tahakkuk, toplama, yükseltme).
      if (next.el) void queryClient.invalidateQueries({ queryKey: city2Keys.elHistory() });
    },
    [queryClient],
  );
}

/**
 * Bütün Şehir 2.0 eylemleri. Hata mesajları sunucudan (Türkçe) toast olarak
 * gösterilir (useAdminMutation → errorText). Başarı geri çağrıları ekranın
 * sahne komutlarını (inşaat, kutlama, odak) yollaması içindir.
 */
export function useCity2Actions(callbacks: {
  onLock?: (building: string) => void;
  onStage?: (building: string, title: string) => void;
  onStep?: (res: Awaited<ReturnType<typeof advanceCity2Step>>) => void;
  onLandmark?: (res: Awaited<ReturnType<typeof buyCity2Landmark>>) => void;
  onPlace?: (res: Awaited<ReturnType<typeof placeCity2Landmark>>, slot: string | null) => void;
  onCollect?: (res: City2CollectResult, building: string | null) => void;
  onUpgrade?: (res: Awaited<ReturnType<typeof upgradeCity2El>>) => void;
} = {}) {
  const write = useCity2Write();
  const lock = useAdminMutation((v: { building: string; lock: string }) => buyCity2Lock(v.building, v.lock), {
    success: (res) => `${res.lock.title} açıldı`,
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onLock?.(res.building);
    },
  });
  const stage = useAdminMutation((building: string) => buildCity2Stage(building), {
    success: (res) => `${res.stage.title} hazır!${res.el_cost ? ` · −${fmtEl(res.el_cost)} EL` : ""}`,
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onStage?.(res.building, res.stage.title);
    },
  });
  const step = useAdminMutation((pay?: boolean) => advanceCity2Step(pay), {
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onStep?.(res);
    },
  });
  const landmark = useAdminMutation((key: string) => buyCity2Landmark(key), {
    success: "Sembol yapı depona eklendi",
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onLandmark?.(res);
    },
  });
  const place = useAdminMutation((body: { id?: string; key?: string; slot: string | null }) => placeCity2Landmark(body), {
    success: (_res, vars) => (vars.slot ? "Yerleştirildi" : "Depoya kaldırıldı"),
    onSuccess: (res, vars) => {
      write(res.city2);
      callbacks.onPlace?.(res, vars.slot);
    },
  });
  /** Faz 2: depodaki EL'i topla (building yoksa bütün binalar). */
  const collect = useAdminMutation((building: string | null) => collectCity2El(building), {
    // Hepsini toplamada sonuç cüzdanda (sayaç + şerit) gösterilir; tek binada toast.
    success: (res, building) =>
      res.collected > 0 ? (building ? `+${fmtEl(res.collected)} EL toplandı${res.expense > 0 ? ` · −${fmtEl(res.expense)} gider` : ""}` : null) : "Toplanacak EL yok",
    onSuccess: (res, building) => {
      write(res.city2);
      callbacks.onCollect?.(res, building);
    },
  });
  const upgrade = useAdminMutation((v: { building: string; kind: "depo" | "personel" }) => upgradeCity2El(v.building, v.kind), {
    success: (res) => {
      const u = res.city2.buildings.find((b) => b.key === res.building)?.income;
      const title = u && u.has_income ? u.upgrades[res.upgrade]?.title : null;
      return `${title ?? "Yükseltme"} ${res.level}. seviye · −${fmtEl(res.cost)} EL`;
    },
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onUpgrade?.(res);
    },
  });
  /** Şehir 2.1: tesis bakımı (yıldızla; building yoksa bakımı eksik bütün binalar). */
  const care = useAdminMutation((building: string | null) => careCity2(building), {
    success: (res) => `Bakım yapıldı · −${res.cost} yıldız`,
    onSuccess: (res) => write(res.city2),
  });
  /** Şehir 2.1: EL → yıldız takası. */
  const elStars = useAdminMutation(() => tradeCity2ElForStars(), {
    success: (res) => `+${res.stars} yıldız · −${fmtEl(res.cost)} EL`,
    onSuccess: (res) => write(res.city2),
  });
  const busy = lock.isPending || stage.isPending || step.isPending || landmark.isPending || place.isPending || collect.isPending || upgrade.isPending || care.isPending || elStars.isPending;
  return { lock, stage, step, landmark, place, collect, upgrade, care, elStars, busy };
}

/** EL defteri (yeniden eskiye, sayfalı: before = next_before). */
export function useCity2ElHistory(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: city2Keys.elHistory(),
    queryFn: ({ pageParam }) => getCity2ElHistory(pageParam, 40),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next_before ?? undefined,
    enabled,
    staleTime: 15_000,
    retry: false,
  });
}

/* ═══════════════════════ FAZ 3 · AKADEMİ ═══════════════════════ */

/**
 * Akademi eylemleri: teklif kabul/ret, serbest bırak, A takıma çıkar, satış
 * listesi. Her yanıt yeni `city2` taşır → önbelleğe yazılır (EL bakiyesi de
 * aynı yanıtta güncellenir). Hatalar sunucunun Türkçe mesajıyla toast olur.
 */
export function useAcademyActions(callbacks: { onAccept?: (res: City2AcceptResult) => void; onDone?: (kind: "reject" | "release" | "promote" | "list") => void } = {}) {
  const write = useCity2Write();
  const accept = useAdminMutation((offer: string) => acceptAcademyOffer(offer), {
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onAccept?.(res);
    },
  });
  const reject = useAdminMutation((offer: string) => rejectAcademyOffer(offer), {
    success: "Teklif reddedildi",
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onDone?.("reject");
    },
  });
  const release = useAdminMutation((player: string) => releaseAcademyPlayer(player), {
    success: "Oyuncu serbest bırakıldı",
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onDone?.("release");
    },
  });
  const promote = useAdminMutation((player: string) => promoteAcademyPlayer(player), {
    success: "A takıma çıktı",
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onDone?.("promote");
    },
  });
  const list = useAdminMutation((v: { player: string; listed: boolean }) => listAcademyPlayer(v.player, v.listed), {
    success: (res) => (res.listed ? "Satış listesine kondu" : "Satış listesinden çıkarıldı"),
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onDone?.("list");
    },
  });
  const busy = accept.isPending || reject.isPending || release.isPending || promote.isPending || list.isPending;
  return { accept, reject, release, promote, list, busy };
}

/**
 * Gizlilik tercihleri (tek uç, iki ayar):
 *   · "Altyapı oyunlarında adım kullanılmasın" (Faz 3) — `value`, `label`, `help`, `set`
 *   · "Şehrimi ziyarete kapat" (Faz 5) — `visit.*`; sunucu alanı tanımıyorsa
 *     `visit.supported` false → ayar çizilmez.
 * Eski sunucu 404 döner: `supported` false → hiçbir ayar çizilmez. Değişince
 * şehir durumu tazelenir (akademideki adlar ve `visit.closed` sunucuda hemen değişir).
 */
export function usePrivacyPreferences(enabled = true) {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: city2Keys.privacy(),
    queryFn: getPrivacyPreferences,
    enabled: enabled && Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  const save = useMutation({
    mutationFn: (v: { key: PrivacyKey; value: boolean }) => setPrivacyPreferences({ [v.key]: v.value }),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: city2Keys.privacy() });
      const before = queryClient.getQueryData<PrivacyPreferences>(city2Keys.privacy());
      queryClient.setQueryData<PrivacyPreferences>(city2Keys.privacy(), (cur) => ({ ...(cur ?? {}), preferences: { ...(cur?.preferences ?? {}), [v.key]: v.value } }));
      return { before };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.before) queryClient.setQueryData(city2Keys.privacy(), ctx.before);
      toast.show({ message: errorText(error), tone: "danger" });
    },
    onSuccess: (res, v) => {
      queryClient.setQueryData<PrivacyPreferences>(city2Keys.privacy(), (cur) => ({ ...(cur ?? {}), ...res, preferences: { ...(cur?.preferences ?? {}), ...(res.preferences ?? {}) } }));
      const message =
        v.key === "city_visit_opt_out"
          ? v.value
            ? "Şehrin artık ziyarete kapalı"
            : "Şehrin yeniden ziyarete açık"
          : v.value
            ? "Adın artık altyapı oyunlarında kullanılmayacak"
            : "Adın yeni gelen oyunculara yeniden verilebilir";
      toast.show({ message, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: city2Keys.me() });
    },
  });
  const prefs = query.data?.preferences;
  const value = prefs?.academy_name_opt_out ?? false;
  const savingKey = save.isPending ? save.variables?.key : null;
  return {
    query,
    value,
    label: query.data?.labels?.academy_name_opt_out ?? "Altyapı oyunlarında adım kullanılmasın",
    help: query.data?.help?.academy_name_opt_out ?? null,
    /** Yalnız sunucu ayarı tanıyorsa (404/503'te ve yüklenirken çizilmez). */
    supported: query.isSuccess,
    set: (next: boolean) => save.mutate({ key: "academy_name_opt_out", value: next }),
    saving: savingKey === "academy_name_opt_out",
    /** Faz 5 · "Şehrimi ziyarete kapat" (eski sunucuda alan yok → supported false). */
    visit: {
      supported: query.isSuccess && typeof prefs?.city_visit_opt_out === "boolean",
      value: prefs?.city_visit_opt_out ?? false,
      label: query.data?.labels?.city_visit_opt_out ?? "Şehrimi ziyarete kapat",
      help: query.data?.help?.city_visit_opt_out ?? null,
      set: (next: boolean) => save.mutate({ key: "city_visit_opt_out", value: next }),
      saving: savingKey === "city_visit_opt_out",
    },
  };
}

/* ═══════════════════════ FAZ 5 ═══════════════════════ */

/**
 * Sezon okuması (GET /city2/season): sezon sonu dilimi bu okumada da verilir.
 * Yanıt şehir önbelleğindeki `season`/`crest`/`prestige` alanlarına da yazılır.
 * Eski sunucu (404) → `supported` false.
 */
export function useCity2Season(enabled = true) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...city2Keys.me(), "season"],
    queryFn: async () => {
      const res = await getCity2Season();
      queryClient.setQueryData<City2Response>(city2Keys.me(), (cur) =>
        cur ? { ...cur, city2: { ...cur.city2, season: res.season, crest: res.crest, prestige: res.prestige } } : cur,
      );
      return res;
    },
    enabled: enabled && Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });
  return { query, season: query.data?.season, crest: query.data?.crest, supported: !(query.error instanceof ApiError && query.error.status === 404) };
}

/**
 * Prestij: önizleme (jeton) → onay. Önizleme her açılışta yeniden istenir
 * (yeni önizleme eski jetonu geçersiz kılar). Hatalar Türkçe toast.
 */
export function useCity2Prestige(callbacks: { onPreview?: (res: City2PrestigePreviewResult) => void; onDone?: (res: City2PrestigeResult) => void } = {}) {
  const write = useCity2Write();
  const queryClient = useQueryClient();
  const preview = useAdminMutation(() => previewCity2Prestige(), {
    onSuccess: (res) => {
      write(res.city2);
      callbacks.onPreview?.(res);
    },
  });
  const confirm = useAdminMutation((token: string) => confirmCity2Prestige(token), {
    onSuccess: (res) => {
      write(res.city2);
      void queryClient.invalidateQueries({ queryKey: [...city2Keys.me(), "season"] });
      callbacks.onDone?.(res);
    },
  });
  return { preview, confirm, busy: preview.isPending || confirm.isPending };
}

/** Takım tesisi (GET /city2/team). Eski sunucu 404 → `supported` false. */
export function useCity2Team(enabled = true) {
  const auth = useAuth();
  const query = useQuery({ queryKey: city2Keys.team(), queryFn: getCity2Team, enabled: enabled && Boolean(auth.user), staleTime: 20_000, retry: false });
  return { query, view: query.data, supported: !(query.error instanceof ApiError && query.error.status === 404) };
}

/** Tesise yıldız / EL bağışı: yanıt hem takım görünümüne hem şehre (bakiye, yıldız) yazılır. */
export function useCity2Donate(callbacks: { onDone?: (res: City2DonateResult) => void } = {}) {
  const write = useCity2Write();
  const queryClient = useQueryClient();
  return useAdminMutation((body: { stars?: number; el?: number }) => donateCity2Team(body), {
    success: (res) => {
      const parts = [res.stars > 0 ? `${fmtEl(res.stars)} yıldız` : null, res.el > 0 ? `${fmtEl(res.el)} EL` : null].filter(Boolean).join(" + ");
      return res.level_up > 0 ? `Tesis ${res.level}. seviyeye çıktı!` : `${parts} bağışlandı · +${fmtEl(res.points)} puan`;
    },
    onSuccess: (res) => {
      write(res.city2);
      queryClient.setQueryData<City2TeamView>(city2Keys.team(), (cur) => ({
        ...(cur ?? { text: null }),
        team: res.team,
        rank: res.rank ?? cur?.rank,
        contributions: res.contributions ?? cur?.contributions,
        today: res.today ?? cur?.today,
        text: res.text ?? cur?.text ?? null,
      }));
      void queryClient.invalidateQueries({ queryKey: cityKeys.leaderboard("all").slice(0, 3) });
      callbacks.onDone?.(res);
    },
  });
}

/** Ziyaret listesi (tek tür). */
export function useCity2VisitList(kind: City2VisitKind, enabled = true) {
  const auth = useAuth();
  const query = useQuery({ queryKey: city2Keys.visitList(kind), queryFn: () => getCity2VisitList(kind, 20), enabled: enabled && Boolean(auth.user), staleTime: 30_000, retry: false });
  return { query, lists: query.data, supported: !(query.error instanceof ApiError && query.error.status === 404) };
}

/** Başka bir şehrin salt okunur görünümü. 403 CITY_CLOSED / 404 → `closed` / `missing`. */
export function useCity2Visit(userId: number | null) {
  const auth = useAuth();
  const query = useQuery({
    queryKey: city2Keys.visit(userId ?? 0),
    queryFn: () => getCity2Visit(userId as number),
    enabled: Boolean(auth.user) && userId != null && Number.isFinite(userId),
    staleTime: 30_000,
    retry: false,
  });
  const err = query.error instanceof ApiError ? query.error : null;
  return { query, view: query.data, closed: err?.status === 403, missing: err?.status === 404 };
}

/** Alkış: görünümü yerinde günceller; ziyaretçinin yıldızı arttığı için şehri tazeler. */
export function useCity2Applause(callbacks: { onDone?: (res: City2ApplauseResult) => void } = {}) {
  const queryClient = useQueryClient();
  return useAdminMutation((userId: number) => applaudCity2(userId), {
    success: (res) => (res.stars.visitor > 0 ? `Alkışladın · +${res.stars.visitor} yıldız` : "Alkışladın"),
    onSuccess: (res) => {
      queryClient.setQueryData<City2VisitView>(city2Keys.visit(res.target_id), (cur) =>
        cur
          ? { ...cur, city: { ...cur.city, applause: res.applause, applauded_today: true }, applause: { ...cur.applause, can: false, blocked: "ALREADY_APPLAUDED", left_today: res.left_today } }
          : cur,
      );
      void queryClient.invalidateQueries({ queryKey: city2Keys.me(), exact: true });
      callbacks.onDone?.(res);
    },
  });
}
