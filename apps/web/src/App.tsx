import { useEffect } from "react";
import { getTg } from "./lib/telegram";
import { PhaserGame } from "./game/PhaserGame";

export default function App() {
  useEffect(() => {
    const tg = getTg();
    if (!tg) return;

    tg.ready();
    tg.expand();
    tg.setBackgroundColor?.("#0b3d2e");
    tg.setHeaderColor?.("#0b3d2e");
    tg.disableClosingConfirmation?.();
  }, []);

  return (
    <div
      style={{
        height: "100dvh",
        width: "100vw",
        overflow: "hidden",
        background: "#0b3d2e",
        touchAction: "none",
      }}
    >
      <PhaserGame />
    </div>
  );
}
