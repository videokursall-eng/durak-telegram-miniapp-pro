import { useGameSession } from "./gameSessionStore";

export function useGameSocket() {
  const session = useGameSession();

  return {
    client: null,
    lastMessage: session.lastMessage,
    lastError: session.lastError,
    roomId: session.roomId,
    room: session.room,
    roomState: session.roomState,
    roomStatus: session.roomStatus,
    selfPlayerId: session.selfPlayerId,
    sessionToken: session.sessionToken,
    isHost: session.isHost,
    isReconnecting: session.isReconnecting,
    isAuthenticating: session.isAuthenticating,
    pendingAction: session.pendingAction,
    connectionStatus: session.connectionStatus,
    isUsingDemoFallback: session.isUsingDemoFallback,
    isConnected: session.connectionStatus === "connected",
    telegramBootstrapStatus: session.telegramBootstrapStatus,
    startTelegramBootstrap: session.startTelegramBootstrap,
    createRoom: session.createRoom,
    joinRoom: session.joinRoom,
    leaveRoom: session.leaveRoom,
    startRoom: session.startRoom,
    attemptReconnect: session.attemptReconnect,
    enterGame: session.enterGame,
    resetToLobby: session.resetToLobby,
    sendAction: session.sendAction,
  };
}
