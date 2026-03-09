import { useStore } from '../../state/store';

export default function ErrorScreen() {
  const errorMessage = useStore((s) => s.errorMessage);
  const reset = useStore((s) => s.reset);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.emoji}>⚠️</div>
        <h1 style={styles.title}>Ошибка</h1>
        <p style={styles.message}>{errorMessage ?? 'Произошла неизвестная ошибка'}</p>
        <button style={styles.btn} onClick={reset}>
          Попробовать снова
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
  emoji: { fontSize: 56 },
  title: { fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 },
  message: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    margin: 0,
    lineHeight: 1.5,
  },
  btn: {
    marginTop: 8,
    width: '100%',
    padding: '14px 24px',
    borderRadius: 12,
    border: 'none',
    background: '#ef4444',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
