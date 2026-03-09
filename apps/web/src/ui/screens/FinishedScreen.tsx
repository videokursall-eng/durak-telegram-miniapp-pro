import { useStore } from '../../state/store';

export default function FinishedScreen() {
  const matchResult = useStore((s) => s.matchResult);
  const playerId = useStore((s) => s.playerId);
  const reset = useStore((s) => s.reset);

  const isDurak = matchResult?.durakId === playerId;
  const isWinner = matchResult?.winners.includes(playerId ?? '') ?? false;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.emoji}>{isDurak ? '🤡' : isWinner ? '🏆' : '🃏'}</div>
        <h1 style={styles.title}>
          {isDurak ? 'Вы — Дурак!' : isWinner ? 'Победа!' : 'Игра окончена'}
        </h1>
        {matchResult && (
          <p style={styles.subtitle}>
            Дурак: {matchResult.durakId === playerId ? 'Вы' : matchResult.durakId}
          </p>
        )}
        <button style={styles.btn} onClick={reset}>
          Играть снова
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    background: 'linear-gradient(135deg, #1a472a 0%, #0d2b18 100%)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: 32,
    borderRadius: 20,
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(12px)',
    maxWidth: 320,
    width: '90%',
  },
  emoji: { fontSize: 72 },
  title: { fontSize: 26, fontWeight: 700, color: '#fff', margin: 0, textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: 0 },
  btn: {
    marginTop: 8,
    width: '100%',
    padding: '14px 24px',
    borderRadius: 12,
    border: 'none',
    background: '#22c55e',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
