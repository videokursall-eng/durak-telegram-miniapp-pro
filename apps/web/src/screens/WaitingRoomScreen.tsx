import type { GameMode, RoomSnapshot } from "@durak/shared";
import { ScreenShell } from "./ScreenShell";

type WaitingRoomScreenProps = {
  room: RoomSnapshot | null;
  selfPlayerId: string | null;
  isHost: boolean;
  connectionStatus: string;
  errorMessage?: string;
  isBusy?: boolean;
  loadingLabel?: string | null;
  onLeave: () => void;
  onStart: (mode: GameMode) => void;
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
};

export function WaitingRoomScreen({
  room,
  selfPlayerId,
  isHost,
  connectionStatus,
  errorMessage,
  isBusy = false,
  loadingLabel,
  onLeave,
  onStart,
}: WaitingRoomScreenProps) {
  return (
    <ScreenShell
      title="Waiting Room"
      subtitle={`Код комнаты: ${room?.roomId ?? "..."}`}
      loadingLabel={loadingLabel}
      status={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            fontSize: 13,
            color: "#d9ffea",
          }}
        >
          <span>Комната: {room?.roomId ?? "..."}</span>
          <span>WS: {connectionStatus}</span>
        </div>
      }
      footer={
        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
          {errorMessage ? errorMessage : "Ожидайте остальных игроков или запуска матча."}
        </div>
      }
    >
      {errorMessage ? <div style={errorBannerStyle}>{errorMessage}</div> : null}
      <div style={{ display: "grid", gap: 8 }}>
        {(room?.players ?? []).map((player) => (
          <div
            key={player.playerId}
            style={{
              padding: 12,
              borderRadius: 12,
              background: "rgba(255,255,255,0.08)",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>
              {player.name}
              {player.playerId === selfPlayerId ? " (you)" : ""}
              {player.isHost ? " • host" : ""}
            </span>
            <span style={{ color: player.isConnected ? "#99ffbf" : "#ffcc99" }}>
              {player.isConnected ? "online" : "offline"}
            </span>
          </div>
        ))}
      </div>

      {isHost ? (
        <>
          <button
            style={buttonStyle}
            onClick={() => onStart("simple")}
            disabled={isBusy}
          >
            {isBusy ? "Запуск..." : "Старт: простой"}
          </button>
          <button
            style={buttonStyle}
            onClick={() => onStart("transfer")}
            disabled={isBusy}
          >
            {isBusy ? "Запуск..." : "Старт: переводной"}
          </button>
        </>
      ) : (
        <div style={{ color: "rgba(255,255,255,0.78)" }}>
          Ожидание host. Как только он запустит матч, игра откроется автоматически.
        </div>
      )}

      <button style={buttonStyle} onClick={onLeave} disabled={isBusy}>
        Покинуть комнату
      </button>
    </ScreenShell>
  );
}
