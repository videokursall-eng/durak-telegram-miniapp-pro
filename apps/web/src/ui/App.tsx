/**
 * Main App component — routes to the correct screen based on store phase.
 *
 * Lifecycle:
 *  1. On mount: signal Telegram ready, register WS handlers (once).
 *  2. When phase === 'idle': run auth flow (POST /auth/telegram) once.
 *  3. When phase === 'connecting' (initial or reconnect): call ws.connect().
 *     WS client handles reconnect internally with exponential backoff.
 *  4. WS handler for connection.ready triggers store.setReady() → phase → 'lobby'.
 */

import { useEffect } from 'react';
import { useStore } from '../state/store';
import { getInitData, signalReady } from '../telegram/telegram';
import { authTelegram } from '../net/api';
import { getWsClient } from '../net/wsClient';
import type { MsgRoomJoined, MsgMatchStarted, MsgStateSnapshot, MsgMatchEnded } from '@durak/shared';

import ConnectingScreen from './screens/ConnectingScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';
import FinishedScreen from './screens/FinishedScreen';
import ErrorScreen from './screens/ErrorScreen';

export default function App() {
  const phase = useStore((s) => s.phase);
  const authToken = useStore((s) => s.authToken);
  const startAuth = useStore((s) => s.startAuth);
  const setAuth = useStore((s) => s.setAuth);
  const setError = useStore((s) => s.setError);
  const setRoom = useStore((s) => s.setRoom);
  const setGame = useStore((s) => s.setGame);
  const updateGameState = useStore((s) => s.updateGameState);
  const setFinished = useStore((s) => s.setFinished);

  // ── Signal Telegram that we're ready to show ────────────────────────────────
  useEffect(() => {
    signalReady();
  }, []);

  // ── Register WS handlers ONCE at mount (not phase-dependent) ───────────────
  // This prevents handler accumulation on reconnect.
  useEffect(() => {
    const ws = getWsClient();

    const handleRoomJoined = (msg: MsgRoomJoined) => {
      setRoom({
        id: msg.payload.room.id,
        name: msg.payload.room.name,
        players: [],
        selfPlayerId: msg.payload.selfPlayerId,
      });
    };

    const handleMatchStarted = (msg: MsgMatchStarted) => {
      setGame(msg.payload.matchId, msg.payload.state);
    };

    const handleStateSnapshot = (msg: MsgStateSnapshot) => {
      updateGameState(msg.payload.state);
    };

    const handleMatchEnded = (msg: MsgMatchEnded) => {
      setFinished({
        matchId: msg.payload.matchId,
        durakId: msg.payload.durakId,
        winners: msg.payload.winners,
        stats: msg.payload.stats,
      });
    };

    const handleError = (msg: { code: string; message: string }) => {
      console.error('[WS error]', msg.code, msg.message);
      // Non-fatal WS errors don't kill the whole app
    };

    ws.on('room.joined', handleRoomJoined);
    ws.on('match.started', handleMatchStarted);
    ws.on('state.snapshot', handleStateSnapshot);
    ws.on('match.ended', handleMatchEnded);
    ws.on('error', handleError);

    return () => {
      ws.off('room.joined', handleRoomJoined);
      ws.off('match.started', handleMatchStarted);
      ws.off('state.snapshot', handleStateSnapshot);
      ws.off('match.ended', handleMatchEnded);
      ws.off('error', handleError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps: register once, clean up on unmount

  // ── Auth flow: runs only when phase is 'idle' ───────────────────────────────
  useEffect(() => {
    if (phase !== 'idle') return;

    startAuth();

    (async () => {
      try {
        const initData = getInitData();
        const { token, playerId } = await authTelegram(initData);
        setAuth(token, playerId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── WS connect: runs whenever phase becomes 'connecting' ───────────────────
  // This covers both initial connection and reconnects after WS drops.
  // The WS client internally handles exponential-backoff reconnect, so this
  // effect only needs to call connect() once per 'connecting' phase entry.
  useEffect(() => {
    if (phase !== 'connecting' || !authToken) return;
    getWsClient().connect(authToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, authToken]);

  // ── Render ──────────────────────────────────────────────────────────────────
  switch (phase) {
    case 'idle':
    case 'auth':
    case 'connecting':
      return <ConnectingScreen phase={phase} />;
    case 'lobby':
      return <LobbyScreen />;
    case 'game':
      return <GameScreen />;
    case 'finished':
      return <FinishedScreen />;
    case 'error':
      return <ErrorScreen />;
    default:
      return <ConnectingScreen phase="connecting" />;
  }
}
