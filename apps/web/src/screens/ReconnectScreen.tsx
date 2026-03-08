import { ScreenShell } from "./ScreenShell";

type ReconnectScreenProps = {
  roomId: string | null;
  errorMessage?: string;
  isBusy?: boolean;
  loadingLabel?: string | null;
  onRetry: () => void;
  onReset: () => void;
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

export function ReconnectScreen({
  roomId,
  errorMessage,
  isBusy = false,
  loadingLabel,
  onRetry,
  onReset,
}: ReconnectScreenProps) {
  return (
    <ScreenShell
      title="Reconnect"
      subtitle={`Пытаемся восстановить матч${roomId ? ` в комнате ${roomId}` : ""}.`}
      loadingLabel={loadingLabel}
      status={
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 999,
            background: "rgba(255,179,179,0.12)",
            color: "#ffd5d5",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span className="app-spinner" aria-hidden="true" />
          <span>Соединение восстанавливается</span>
        </div>
      }
      footer={
        errorMessage ? (
          <div style={{ color: "#ffb3b3", fontSize: 13 }}>{errorMessage}</div>
        ) : undefined
      }
    >
      <div style={{ color: "rgba(255,255,255,0.8)" }}>
        Если соединение оборвалось, можно повторить попытку или вернуться в лобби.
      </div>
      <button style={buttonStyle} onClick={onRetry} disabled={isBusy}>
        {isBusy ? "Подключаем..." : "Повторить reconnect"}
      </button>
      <button style={buttonStyle} onClick={onReset} disabled={isBusy}>
        Вернуться в лобби
      </button>
    </ScreenShell>
  );
}
