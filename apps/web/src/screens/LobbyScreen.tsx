import { useState } from "react";
import { ScreenShell } from "./ScreenShell";
import { getTelegramDisplayName, isTelegramMiniApp } from "../lib/telegram";
import { isLocalDevAuthEnabled } from "../lib/runtimeEnv";

type LobbyScreenProps = {
  connectionStatus: string;
  errorMessage?: string;
  isBusy?: boolean;
  loadingLabel?: string | null;
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomId: string, playerName: string) => void;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  padding: "12px 14px",
  fontSize: 16,
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(12,18,14,0.96)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};

const errorBannerStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  background: "rgba(120, 24, 24, 0.55)",
  border: "1px solid rgba(255,179,179,0.32)",
  color: "#ffd7d7",
  fontSize: 14,
  lineHeight: 1.4,
  wordBreak: "break-word" as const,
};

export function LobbyScreen({
  connectionStatus,
  errorMessage,
  isBusy = false,
  loadingLabel,
  onCreateRoom,
  onJoinRoom,
}: LobbyScreenProps) {
  const [playerName, setPlayerName] = useState(() => getTelegramDisplayName() ?? "Player");
  const [roomId, setRoomId] = useState("");
  const isLocalDevFallback = isLocalDevAuthEnabled() && !isTelegramMiniApp();

  return (
    <ScreenShell
      title="Durak Multiplayer"
      subtitle="Создай комнату или войди по коду, чтобы начать матч."
      loadingLabel={loadingLabel}
      status={
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.08)",
            color: "#d7ffea",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background:
                connectionStatus === "connected"
                  ? "#78ffbb"
                  : connectionStatus === "connecting"
                    ? "#ffd166"
                    : "#ff9b9b",
              boxShadow: "0 0 10px rgba(255,255,255,0.25)",
            }}
          />
          <span>WS: {connectionStatus}</span>
        </div>
      }
      footer={
        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 1.5 }}>
          {isLocalDevFallback
            ? "Local development auth fallback активен только в dev-режиме вне Telegram."
            : "Telegram auth и multiplayer flow работают в realtime."}
        </div>
      }
    >
      {errorMessage ? <div style={errorBannerStyle}>{errorMessage}</div> : null}
      <input
        style={inputStyle}
        value={playerName}
        onChange={(event) => setPlayerName(event.target.value)}
        placeholder="Ваше имя"
        autoComplete="name"
        disabled={isBusy}
      />
      <button
        style={{ ...buttonStyle, opacity: isBusy ? 0.7 : 1 }}
        onClick={() => onCreateRoom(playerName)}
        disabled={isBusy || !playerName.trim()}
      >
        {isBusy ? "Подключаем..." : "Создать комнату"}
      </button>
      <input
        style={inputStyle}
        value={roomId}
        onChange={(event) => setRoomId(event.target.value.toUpperCase())}
        placeholder="Код комнаты"
        autoCapitalize="characters"
        autoComplete="off"
        disabled={isBusy}
      />
      <button
        style={{ ...buttonStyle, opacity: isBusy ? 0.7 : 1 }}
        onClick={() => onJoinRoom(roomId, playerName)}
        disabled={isBusy || !roomId.trim() || !playerName.trim()}
      >
        {isBusy ? "Загружаем..." : "Войти в комнату"}
      </button>
    </ScreenShell>
  );
}
