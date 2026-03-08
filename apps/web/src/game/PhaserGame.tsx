import { useEffect, useRef } from "react";
import type Phaser from "phaser";
import type { GameAction, GameState } from "@durak/shared";
import { createGame } from "./createGame";

type PhaserGameProps = {
  roomState: GameState | null;
  sendAction: (action: GameAction) => void;
  myPlayerId?: string;
};

export function PhaserGame({ roomState, sendAction, myPlayerId = "p1" }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<ReturnType<typeof createGame>["tableScene"] | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (gameRef.current) return;

    const { game, tableScene } = createGame(containerRef.current);
    gameRef.current = game;
    sceneRef.current = tableScene;
    tableScene.setSessionData(roomState, { sendAction, myPlayerId });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setSessionData(roomState, { sendAction, myPlayerId });
  }, [myPlayerId, roomState, sendAction]);

  return (
    <div
      ref={containerRef}
      id="phaser-container"
      style={{ width: "100%", height: "100%", position: "relative" }}
    />
  );
}