import { useEffect, useState } from "react";
import { getTg } from "./lib/telegram";
import { PhaserGame } from "./game/PhaserGame";
import { emitUiAction, gameUiBus, type HudState } from "./game/events/gameUiBus";
import {
  MOBILE_BREAKPOINT,
  ACTION_BAR_HEIGHT,
  ACTION_BAR_OFFSET,
} from "./game/layoutConstants";

/** Реэкспорт для использования в других модулях */
export { ACTION_BAR_HEIGHT };

const initialHud: HudState = {
  selectedCount: 0,
  canAttack: true,
  canDefend: false,
  hint: "",
};

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

export default function App() {
  const [hud, setHud] = useState<HudState>(initialHud);
  const isMobile = useIsMobile();

  useEffect(() => {
    const tg = getTg();
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setBackgroundColor?.("#0b3d2e");
      tg.setHeaderColor?.("#0b3d2e");
    }

    const onHud = (state: HudState) => setHud(state);
    gameUiBus.on("hud-state", onHud);

    return () => {
      gameUiBus.off("hud-state", onHud);
    };
  }, []);

  const baseButton: React.CSSProperties = {
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(12,18,14,0.96)",
    color: "#fff",
    fontSize: isMobile ? 13 : 14,
    fontWeight: 600,
    padding: "8px 6px",
    lineHeight: 1.2,
    cursor: "pointer",
  };

  const disabled: React.CSSProperties = {
    opacity: 0.45,
    cursor: "default",
  };

  const selectedSuffix = hud.selectedCount > 0 ? ` (${hud.selectedCount})` : "";

  return (
    <div
      style={{
        height: "100dvh",
        width: "100vw",
        overflow: "hidden",
        background: "#0b3d2e",
        position: "relative",
        touchAction: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          paddingBottom: `calc(${ACTION_BAR_HEIGHT}px + env(safe-area-inset-bottom) + ${ACTION_BAR_OFFSET}px)`,
          boxSizing: "border-box",
        }}
      >
        <PhaserGame />
      </div>

      <div
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          bottom: `calc(env(safe-area-inset-bottom) + ${ACTION_BAR_OFFSET}px)`,
          pointerEvents: "none",
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
            gridTemplateRows: isMobile ? "auto auto" : "auto",
            gap: 8,
            pointerEvents: "auto",
            padding: 10,
            borderRadius: 16,
            background: "rgba(8, 14, 10, 0.42)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxSizing: "border-box",
          }}
        >
          <button
            style={{
              ...baseButton,
              ...((!hud.canAttack || hud.selectedCount === 0) ? disabled : {}),
            }}
            disabled={!hud.canAttack || hud.selectedCount === 0}
            onClick={() => emitUiAction("PLAY_SELECTED_ATTACK")}
          >
            Ход{selectedSuffix}
          </button>

          <button
            style={{
              ...baseButton,
              ...((!hud.canAttack || hud.selectedCount === 0) ? disabled : {}),
            }}
            disabled={!hud.canAttack || hud.selectedCount === 0}
            onClick={() => emitUiAction("THROW_IN")}
          >
            Подкинуть{selectedSuffix}
          </button>

          <button
            style={{
              ...baseButton,
              ...((!hud.canDefend || hud.selectedCount === 0) ? disabled : {}),
            }}
            disabled={!hud.canDefend || hud.selectedCount === 0}
            onClick={() => emitUiAction("DEFEND_SELECTED")}
          >
            Защититься{selectedSuffix}
          </button>

          <button
            style={{
              ...baseButton,
              ...(hud.selectedCount === 0 ? disabled : {}),
            }}
            disabled={hud.selectedCount === 0}
            onClick={() => emitUiAction("CLEAR_SELECTION")}
          >
            Сбросить
          </button>
        </div>
      </div>
    </div>
  );
}
