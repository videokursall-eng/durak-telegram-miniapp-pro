import { useState } from 'react';
import { useStore } from '../../state/store';
import { getWsClient } from '../../net/wsClient';

export default function LobbyScreen() {
  const room = useStore((s) => s.room);
  const playerId = useStore((s) => s.playerId);
  const [joining, setJoining] = useState(false);
  const authToken = useStore((s) => s.authToken)!;

  function handleCreateRoom() {
    if (joining) return;
    setJoining(true);
    const ws = getWsClient();
    ws.send({
      type: 'room.join',
      actionId: crypto.randomUUID(),
      payload: { roomId: 'default', authToken },
    });
    // joining state is cleared when room.joined is received (handled by App.tsx → store)
    // Use a timeout as fallback in case server doesn't respond
    setTimeout(() => setJoining(false), 5000);
  }

  function handleStartMatch() {
    const ws = getWsClient();
    ws.send({
      type: 'room.start',
      actionId: crypto.randomUUID(),
      payload: { mode: 'simple', maxPlayers: 2 },
    });
  }

  const isOwner = room?.players?.find((p) => p.id === playerId)?.isOwner ?? false;
  const playerCount = room?.players?.length ?? 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.logo}>🃏</span>
        <h1 style={styles.title}>Durak PRO</h1>
      </div>

      {!room ? (
        <div style={styles.section}>
          <p style={styles.subtitle}>Найдите игру или создайте комнату</p>
          <button
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={handleCreateRoom}
            disabled={joining}
          >
            {joining ? 'Вход…' : 'Войти в комнату'}
          </button>
        </div>
      ) : (
        <div style={styles.section}>
          <h2 style={styles.roomTitle}>Комната: {room.name || room.id}</h2>
          <div style={styles.playerList}>
            {room.players.map((p) => (
              <div key={p.id} style={styles.player}>
                <span>{p.isOwner ? '👑' : '🃏'}</span>
                <span style={styles.playerName}>
                  {p.name} {p.id === playerId ? '(Вы)' : ''}
                </span>
                <span style={{ ...styles.badge, ...(p.isReady ? styles.badgeReady : styles.badgeWait) }}>
                  {p.isReady ? 'Готов' : 'Ждёт'}
                </span>
              </div>
            ))}
            {playerCount === 0 && (
              <p style={styles.emptyRoom}>Ожидаем игроков…</p>
            )}
          </div>

          {isOwner && playerCount >= 2 && (
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={handleStartMatch}
            >
              Начать игру
            </button>
          )}
          {!isOwner && (
            <p style={styles.waitingMsg}>Ждём хоста…</p>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
    background: 'linear-gradient(135deg, #1a472a 0%, #0d2b18 100%)',
    padding: 24,
    gap: 24,
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  logo: { fontSize: 40 },
  title: { fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 },
  subtitle: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', margin: '0 0 20px' },
  section: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    gap: 12,
  },
  roomTitle: { color: '#fff', fontSize: 18, margin: 0 },
  playerList: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    minHeight: 60,
  },
  player: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  playerName: { color: '#fff', flex: 1, fontSize: 15 },
  badge: {
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
  },
  badgeReady: { background: '#22c55e', color: '#fff' },
  badgeWait: { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' },
  emptyRoom: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 14, margin: 0 },
  btn: {
    width: '100%',
    padding: '14px 24px',
    borderRadius: 12,
    border: 'none',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  btnPrimary: { background: '#22c55e', color: '#fff' },
  waitingMsg: { color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: 0 },
};
