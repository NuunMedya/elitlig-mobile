/**
 * WEBVIEW OYUN TUVALİ — `games/*.js` oyunlarını çalıştıran ince kabuk.
 *
 * NEDEN WEBVIEW: oyunlar Canvas 2D ile çizilir; WebView'in kendi GPU
 * hızlandırmalı çizim hattında, React ağacına ve köprüye hiç uğramadan
 * 60/120 Hz akar. Eski SVG sürümü her karede React uzlaştırması yapıyordu ve
 * orta segment Android'de takılıyordu. Burada React yalnız iki olay görür:
 * oyun hazır, oyun bitti. Haptik istekleri de aynı kanaldan gelir.
 *
 * KÖPRÜ SÖZLEŞMESİ (bkz. games/core.js):
 *   Oyun → RN : {type:"ready"} · {type:"haptic",kind} · {type:"over",score,stats}
 *   RN → Oyun : window.ArenaCmd({type:"start"|"pause"|"resume"|"config"})
 */

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { WEB_GAMES, type WebGameKey } from "@/lib/game/web/games.generated";
import { colors, haptics } from "@/theme";

export type GameCommand =
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "config"; sound?: boolean; reduceMotion?: boolean; perks?: { penalti?: { aimBonus: number } } | null };

export interface GameOverPayload {
  score: number;
  stats: Record<string, number>;
}

export interface WebGameHandle {
  send: (command: GameCommand) => void;
}

interface Props {
  game: WebGameKey;
  onReady?: () => void;
  onOver: (payload: GameOverPayload) => void;
}

const HAPTIC: Record<string, () => void> = {
  light: haptics.light,
  medium: haptics.medium,
  heavy: haptics.goal,
  success: haptics.success,
  warning: haptics.warning,
  error: haptics.error,
};

export const WebGame = forwardRef<WebGameHandle, Props>(function WebGame({ game, onReady, onOver }, ref) {
  const web = useRef<WebView>(null);
  const handlers = useRef({ onReady, onOver });
  handlers.current = { onReady, onOver };

  useImperativeHandle(
    ref,
    () => ({
      send: (command) => {
        web.current?.injectJavaScript(`window.ArenaCmd && window.ArenaCmd(${JSON.stringify(command)});true;`);
      },
    }),
    [],
  );

  // Kaynak nesnesi sabit kalmalı: her render'da yeni nesne WebView'i baştan yükler.
  const source = useMemo(() => ({ html: WEB_GAMES[game] }), [game]);

  const onMessage = (event: WebViewMessageEvent) => {
    let message: { type?: string; kind?: string; score?: unknown; stats?: unknown };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    switch (message.type) {
      case "ready":
        handlers.current.onReady?.();
        break;
      case "haptic":
        HAPTIC[message.kind ?? ""]?.();
        break;
      case "over": {
        const score = Math.max(0, Math.round(Number(message.score) || 0));
        const stats: Record<string, number> = {};
        if (message.stats && typeof message.stats === "object") {
          for (const [key, value] of Object.entries(message.stats as Record<string, unknown>)) {
            const n = Number(value);
            if (Number.isFinite(n)) stats[key] = n;
          }
        }
        handlers.current.onOver({ score, stats });
        break;
      }
    }
  };

  return (
    <View style={styles.fill}>
      <WebView
        ref={web}
        source={source}
        originWhitelist={["*"]}
        onMessage={onMessage}
        style={styles.web}
        containerStyle={styles.fill}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        javaScriptEnabled
        domStorageEnabled={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        textZoom={100}
        androidLayerType="hardware"
        accessibilityLabel="Oyun alanı"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  web: { flex: 1, backgroundColor: colors.inkBlock },
});
