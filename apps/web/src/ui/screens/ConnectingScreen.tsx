import type { AppPhase } from '../../state/store';

interface Props {
  phase: AppPhase;
}

const messages: Partial<Record<AppPhase, string>> = {
  idle: 'Запуск…',
  auth: 'Проверка Telegram…',
  connecting: 'Подключение к серверу…',
};

export default function ConnectingScreen({ phase }: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🃏</div>
        <h1 style={styles.title}>Durak PRO</h1>
        <div style={styles.spinner} />
        <p style={styles.message}>{messages[phase] ?? 'Подключение…'}</p>
      </div>
      <style>{spinnerCss}</style>
    </div>
  );
}

const spinnerCss = `
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`;

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
    minWidth: 240,
  },
  logo: {
    fontSize: 64,
    lineHeight: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: 1,
    margin: 0,
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid rgba(255,255,255,0.2)',
    borderTop: '3px solid #fff',
    borderRadius: '50%',
    animation: 'spin 0.9s linear infinite',
  },
  message: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    margin: 0,
  },
};
