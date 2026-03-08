import { ScreenShell } from "./ScreenShell";

type GameStartScreenProps = {
  roomId: string | null;
  loadingLabel?: string | null;
};

export function GameStartScreen({ roomId, loadingLabel }: GameStartScreenProps) {
  return (
    <ScreenShell
      title="Game Start"
      subtitle={`Матч${roomId ? ` в комнате ${roomId}` : ""} запускается.`}
      loadingLabel={loadingLabel ?? "Подготавливаем игровой стол"}
      status={
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 999,
            background: "rgba(122,255,195,0.12)",
            color: "#d9ffea",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span className="app-spinner" aria-hidden="true" />
          <span>Матч запускается</span>
        </div>
      }
    >
      <div style={{ color: "rgba(255,255,255,0.8)" }}>
        Раздаем карты и подготавливаем стол. Через мгновение откроется игровое поле.
      </div>
    </ScreenShell>
  );
}
