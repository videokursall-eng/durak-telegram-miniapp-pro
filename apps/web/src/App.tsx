import { useEffect, useState } from "react";
import { getTg, isTelegramMiniApp } from "./lib/telegram";
import { PhaserGame } from "./game/PhaserGame";
import { emitUiAction, gameUiBus, type HudState } from "./game/events/gameUiBus";
import { useGameSocket } from "./net/useGameSocket";
import { LobbyScreen } from "./screens/LobbyScreen";
import { WaitingRoomScreen } from "./screens/WaitingRoomScreen";
import { ReconnectScreen } from "./screens/ReconnectScreen";
import { GameStartScreen } from "./screens/GameStartScreen";
import {
  MOBILE_BREAKPOINT,
  ACTION_BAR_HEIGHT,
  ACTION_BAR_HEIGHT_DESKTOP,
  ACTION_BAR_OFFSET,
} from "./game/layoutConstants";

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
  const {
    connectionStatus,
    room,
    roomState,
    roomStatus,
    selfPlayerId,
    isHost,
    lastError,
    isAuthenticating,
    pendingAction,
    sendAction,
    createRoom,
    joinRoom,
    leaveRoom,
    startRoom,
    attemptReconnect,
    enterGame,
    resetToLobby,
    isUsingDemoFallback,
    telegramBootstrapStatus,
    startTelegramBootstrap,
  } = useGameSocket();

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

  useEffect(() => {
    if (roomStatus !== "starting" || !roomState) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      enterGame();
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [enterGame, roomState, roomStatus]);

  const baseButton: React.CSSProperties = {
    width: "100%",
    minHeight: isMobile ? 52 : 48,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "linear-gradient(180deg, rgba(21,29,24,0.98) 0%, rgba(11,16,13,0.98) 100%)",
    color: "#fff",
    fontSize: isMobile ? 13 : 14,
    fontWeight: 600,
    padding: isMobile ? "10px 8px" : "8px 6px",
    lineHeight: 1.2,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    boxShadow: "0 10px 24px rgba(0,0,0,0.2)",
  };

  const disabled: React.CSSProperties = {
    opacity: 0.45,
    cursor: "default",
  };

  const selectedSuffix = hud.selectedCount > 0 ? ` (${hud.selectedCount})` : "";
  const errorMessage = lastError?.message;
  const isBusy = isAuthenticating || pendingAction !== null;
  const loadingLabel =
    pendingAction === "create_room"
      ? "Создаем комнату"
      : pendingAction === "join_room"
        ? "Подключаем к комнате"
        : pendingAction === "start_room"
          ? "Запускаем матч"
          : pendingAction === "reconnect"
            ? "Восстанавливаем матч"
            : isAuthenticating
              ? "Авторизуем игрока"
              : roomStatus === "starting"
                ? "Подготавливаем игровое поле"
                : connectionStatus === "connecting"
                  ? "Подключаемся к серверу"
                  : null;
  const showReconnectBanner =
    !isUsingDemoFallback &&
    (roomStatus === "reconnecting" ||
      (connectionStatus !== "connected" && Boolean(roomIdOrSnapshot(room, roomState))));
  const hudHeight = isMobile ? ACTION_BAR_HEIGHT : ACTION_BAR_HEIGHT_DESKTOP;
  const statusHintText =
    hud.hint ||
    (roomStatus === "starting"
      ? "Раздаем карты и синхронизируем стол"
      : showReconnectBanner
        ? "Соединение потеряно, пытаемся восстановить матч"
        : "Тап по карте выбирает ее, drag помогает прицелиться перед действием");

  // Telegram Mini App bootstrap: show loading or error until auth succeeds.
  if (isTelegramMiniApp() && (telegramBootstrapStatus === "idle" || telegramBootstrapStatus === "loading")) {
    return (
      <div
        style={{
          height: "100dvh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#0b3d2e",
          color: "#e7fff3",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <span className="app-spinner" style={{ width: 40, height: 40 }} aria-hidden="true" />
        <span style={{ fontSize: 16, fontWeight: 600 }}>Авторизация…</span>
        <span style={{ fontSize: 14, opacity: 0.9 }}>Подключение к серверу</span>
      </div>
    );
  }

  if (isTelegramMiniApp() && telegramBootstrapStatus === "error") {
    return (
      <div
        style={{
          height: "100dvh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          background: "#0b3d2e",
          color: "#e7fff3",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderRadius: 14,
            background: "rgba(120, 24, 24, 0.55)",
            border: "1px solid rgba(255,179,179,0.32)",
            color: "#ffd7d7",
            fontSize: 14,
            lineHeight: 1.4,
            maxWidth: 360,
            textAlign: "center",
          }}
        >
          {lastError?.message ?? "Ошибка авторизации"}
        </div>
        <button
          type="button"
          onClick={() => void startTelegramBootstrap()}
          style={{
            padding: "12px 24px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!isUsingDemoFallback && roomStatus === "lobby" && !roomState) {
    return (
      <LobbyScreen
        connectionStatus={connectionStatus}
        errorMessage={errorMessage}
        isBusy={isBusy}
        loadingLabel={loadingLabel}
        onCreateRoom={(playerName) => {
          void createRoom(playerName);
        }}
        onJoinRoom={(roomId, playerName) => {
          void joinRoom(roomId, playerName);
        }}
      />
    );
  }

  if (!isUsingDemoFallback && roomStatus === "reconnecting") {
    return (
      <ReconnectScreen
        roomId={room?.roomId ?? null}
        errorMessage={errorMessage}
        isBusy={isBusy || connectionStatus === "connecting"}
        loadingLabel={loadingLabel ?? "Повторно подключаемся к серверу"}
        onRetry={() => {
          void attemptReconnect();
        }}
        onReset={resetToLobby}
      />
    );
  }

  if (!isUsingDemoFallback && roomStatus === "waiting") {
    return (
      <WaitingRoomScreen
        room={room}
        selfPlayerId={selfPlayerId}
        isHost={isHost}
        connectionStatus={connectionStatus}
        errorMessage={errorMessage}
        isBusy={isBusy}
        loadingLabel={loadingLabel}
        onLeave={leaveRoom}
        onStart={startRoom}
      />
    );
  }

  if (!isUsingDemoFallback && roomStatus === "starting" && !roomState) {
    return <GameStartScreen roomId={room?.roomId ?? null} loadingLabel={loadingLabel} />;
  }

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
          top: "calc(env(safe-area-inset-top) + 8px)",
          right: "calc(env(safe-area-inset-right) + 8px)",
          zIndex: 200,
          padding: "6px 10px",
          borderRadius: 999,
          background: "rgba(0,0,0,0.52)",
          color: "#fff",
          fontSize: 12,
          maxWidth: isMobile ? "calc(100vw - 24px)" : undefined,
        }}
      >
        WS: {connectionStatus}
        {isUsingDemoFallback ? " • demo" : ""}
        {roomState ? ` • v${roomState.version}` : ""}
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          paddingBottom: `calc(${hudHeight}px + env(safe-area-inset-bottom) + ${ACTION_BAR_OFFSET}px)`,
          boxSizing: "border-box",
        }}
      >
        <PhaserGame
          roomState={roomState}
          sendAction={sendAction}
          myPlayerId={selfPlayerId ?? "p1"}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: "calc(env(safe-area-inset-left) + 8px)",
          right: "calc(env(safe-area-inset-right) + 8px)",
          bottom: `calc(env(safe-area-inset-bottom) + ${ACTION_BAR_OFFSET}px)`,
          pointerEvents: "none",
          zIndex: 100,
        }}
      >
        {(loadingLabel || statusHintText) ? (
          <div
            style={{
              maxWidth: 560,
              margin: "0 auto 8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                background: "rgba(8, 14, 10, 0.52)",
                color: "#e7fff3",
                fontSize: 12,
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              {loadingLabel ? <span className="app-spinner" aria-hidden="true" /> : null}
              <span>{loadingLabel ?? statusHintText}</span>
            </div>
            {roomState ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "rgba(8, 14, 10, 0.52)",
                  color: "#d0ffd0",
                  fontSize: 12,
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <span>Выбрано: {hud.selectedCount}</span>
                <span>v{roomState.version}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          style={{
            maxWidth: 560,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
            gridTemplateRows: isMobile ? "auto auto" : "auto",
            gap: 8,
            pointerEvents: "auto",
            padding: isMobile ? 12 : 10,
            borderRadius: 20,
            background: "rgba(8, 14, 10, 0.54)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxSizing: "border-box",
            boxShadow: "0 14px 40px rgba(0,0,0,0.24)",
          }}
        >
          <button
            style={{
              ...baseButton,
              ...((!hud.canAttack || hud.selectedCount === 0) ? disabled : {}),
            }}
            disabled={isBusy || !hud.canAttack || hud.selectedCount === 0}
            onClick={() => emitUiAction("PLAY_SELECTED_ATTACK")}
          >
            Ход{selectedSuffix}
          </button>

          <button
            style={{
              ...baseButton,
              ...((!hud.canAttack || hud.selectedCount === 0) ? disabled : {}),
            }}
            disabled={isBusy || !hud.canAttack || hud.selectedCount === 0}
            onClick={() => emitUiAction("THROW_IN")}
          >
            Подкинуть{selectedSuffix}
          </button>

          <button
            style={{
              ...baseButton,
              ...((!hud.canDefend || hud.selectedCount === 0) ? disabled : {}),
            }}
            disabled={isBusy || !hud.canDefend || hud.selectedCount === 0}
            onClick={() => emitUiAction("DEFEND_SELECTED")}
          >
            Защититься{selectedSuffix}
          </button>

          <button
            style={{
              ...baseButton,
              ...((isBusy || hud.selectedCount === 0) ? disabled : {}),
            }}
            disabled={isBusy || hud.selectedCount === 0}
            onClick={() => emitUiAction("CLEAR_SELECTION")}
          >
            Сбросить
          </button>
        </div>
      </div>

      {showReconnectBanner ? (
        <div
          style={{
            position: "absolute",
            left: "calc(env(safe-area-inset-left) + 12px)",
            right: "calc(env(safe-area-inset-right) + 12px)",
            top: "calc(env(safe-area-inset-top) + 48px)",
            zIndex: 300,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 18,
              background: "rgba(61, 20, 20, 0.88)",
              color: "#ffe6e6",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 12px 30px rgba(0,0,0,0.26)",
            }}
          >
            <span className="app-spinner" aria-hidden="true" />
            <span>{loadingLabel ?? "Восстанавливаем соединение..."}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function roomIdOrSnapshot(
  room: { roomId: string } | null,
  roomState: { matchId: string } | null
) {
  return room?.roomId ?? roomState?.matchId ?? null;
}
