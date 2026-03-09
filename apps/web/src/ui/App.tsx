/**
 * Main App component — routes to the correct screen based on store phase.
 *
 * Also boots the auth → connect lifecycle on mount.
 */

import { useEffect, useRef } from 'react';
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

  const wsBootedRef = useRef(false);

  // ── Signal Telegram that we're ready to show ────────────────────────────────
  useEffect(() => {
    signalReady();
  }, []);

  // ── Auth flow (runs ONCE) ───────────────────────────────────────────────────
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

  // ── WebSocket lifecycle (connect when token is available) ───────────────────
  useEffect(() => {
    if (phase !== 'connecting' || !authToken) return;
    if (wsBootedRef.current) return; // already bootstrapped in this session
    wsBootedRef.current = true;

    const ws = getWsClient();

    // Register server → client handlers
    ws.on('room.joined', (msg: MsgRoomJoined) => {
      setRoom({
        id: msg.payload.room.id,
        name: msg.payload.room.name,
        players: [],
        selfPlayerId: msg.payload.selfPlayerId,
      });
    });

    ws.on('match.started', (msg: MsgMatchStarted) => {
      setGame(msg.payload.matchId, msg.payload.state);
    });

    ws.on('state.snapshot', (msg: MsgStateSnapshot) => {
      updateGameState(msg.payload.state);
    });

    ws.on('match.ended', (msg: MsgMatchEnded) => {
      setFinished({
        matchId: msg.payload.matchId,
        durakId: msg.payload.durakId,
        winners: msg.payload.winners,
        stats: msg.payload.stats,
      });
    });

    ws.on('error', (msg) => {
      console.error('[WS error]', msg.code, msg.message);
      // Non-fatal WS errors don't kill the whole app
    });

    ws.connect(authToken);

    return () => {
      // Don't destroy the singleton — just remove this component's handlers
      wsBootedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, authToken]);

  // ── Reconnect: phase flips back to 'connecting' when WS drops ──────────────
  useEffect(() => {
    if (phase !== 'connecting' || !authToken) return;
    // wsBootedRef being false means this is a reconnect (component already mounted)
    if (!wsBootedRef.current) {
      const ws = getWsClient();
      ws.connect(authToken);
      wsBootedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, authToken]);

  // ── Render ──────────────────────────────────────────────────────────────────
  switch (phase) {
    case 'idle':
    case 'auth':
    case 'connecting':
      return <ConnectingScreen phase={phase} />;
    case 'lobby':
    case 'game':
      return phase === 'lobby' ? <LobbyScreen /> : <GameScreen />;
    case 'finished':
      return <FinishedScreen />;
    case 'error':
      return <ErrorScreen />;
    default:
      return <ConnectingScreen phase="connecting" />;
  }
}
