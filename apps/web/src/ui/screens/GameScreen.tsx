import { useState } from 'react';
import { useStore } from '../../state/store';
import { getWsClient } from '../../net/wsClient';
import type { CardId, TableSlot } from '@durak/shared';

const SUIT_SYMBOL: Record<string, string> = {
  S: '♠', H: '♥', D: '♦', C: '♣',
};
const SUIT_COLOR: Record<string, string> = {
  S: '#fff', H: '#f87171', D: '#f87171', C: '#fff',
};

function parseCard(id: CardId) {
  // Card IDs are like "AS", "TD", "6H" — rank is everything except the last char (suit).
  const suit = id[id.length - 1];
  const rank = id.slice(0, id.length - 1);
  return { rank, suit };
}

function CardView({ id, selected, onClick }: { id: CardId; selected?: boolean; onClick?: () => void }) {
  const { rank, suit } = parseCard(id);
  return (
    <button
      style={{
        ...styles.card,
        borderColor: selected ? '#facc15' : 'rgba(255,255,255,0.2)',
        boxShadow: selected ? '0 0 0 2px #facc15' : 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      <span style={{ color: SUIT_COLOR[suit] ?? '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{rank}</span>
      <span style={{ color: SUIT_COLOR[suit] ?? '#fff', fontSize: 18 }}>{SUIT_SYMBOL[suit] ?? suit}</span>
    </button>
  );
}

function TableView({ slots }: { slots: TableSlot[] }) {
  return (
    <div style={styles.table}>
      {slots.length === 0 && (
        <p style={styles.emptyTable}>Стол пустой</p>
      )}
      {slots.map((slot, i) => (
        <div key={i} style={styles.tableSlot}>
          <CardView id={slot.attack} />
          {slot.defense && (
            <CardView id={slot.defense} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function GameScreen() {
  const gameState = useStore((s) => s.gameState);
  const matchId = useStore((s) => s.matchId);
  const playerId = useStore((s) => s.playerId);
  const [selected, setSelected] = useState<Set<CardId>>(new Set());

  if (!gameState || !matchId) return null;

  const me = gameState.players.find((p) => p.id === playerId);
  const myCards = me?.cards ?? [];
  const isAttacker = gameState.players[gameState.attackerIndex]?.id === playerId;
  const isDefender = gameState.players[gameState.defenderIndex]?.id === playerId;
  const isMyTurn = gameState.currentTurnPlayerId === playerId;

  function toggleCard(id: CardId) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function sendAction(type: 'turn.attack' | 'turn.throwIn') {
    if (selected.size === 0) return;
    getWsClient().send({
      type,
      actionId: crypto.randomUUID(),
      matchId: matchId ?? undefined,
      payload: { cards: [...selected] },
    });
    setSelected(new Set());
  }

  function sendTake() {
    getWsClient().send({ type: 'turn.take', actionId: crypto.randomUUID(), matchId: matchId ?? undefined, payload: {} });
  }

  function sendBeat() {
    getWsClient().send({ type: 'turn.beat', actionId: crypto.randomUUID(), matchId: matchId ?? undefined, payload: {} });
  }

  function sendPass() {
    getWsClient().send({ type: 'turn.pass', actionId: crypto.randomUUID(), matchId: matchId ?? undefined, payload: {} });
  }

  const trumpSymbol = SUIT_SYMBOL[gameState.trump] ?? gameState.trump;
  const phase = gameState.phase;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.trumpBadge}>Козырь: {trumpSymbol}</span>
        <span style={styles.deckBadge}>🃏 {gameState.deckCount}</span>
        <span style={styles.phaseBadge}>{phase}</span>
      </div>

      {/* Opponents */}
      <div style={styles.opponents}>
        {gameState.players
          .filter((p) => p.id !== playerId)
          .map((p) => (
            <div key={p.id} style={{
              ...styles.opponentChip,
              border: gameState.currentTurnPlayerId === p.id ? '2px solid #facc15' : '2px solid transparent',
            }}>
              <span>{p.name}</span>
              <span style={styles.cardCount}>{p.cardCount}🃏</span>
            </div>
          ))}
      </div>

      {/* Table */}
      <TableView slots={gameState.table} />

      {/* My hand */}
      <div style={styles.hand}>
        {myCards.map((id) => (
          <CardView
            key={id}
            id={id}
            selected={selected.has(id)}
            onClick={() => toggleCard(id)}
          />
        ))}
        {myCards.length === 0 && (
          <p style={styles.emptyHand}>Нет карт</p>
        )}
      </div>

      {/* Actions */}
      {isMyTurn && (
        <div style={styles.actions}>
          {isAttacker && phase === 'TRICK_ATTACK' && (
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => sendAction('turn.attack')} disabled={selected.size === 0}>
              Атаковать
            </button>
          )}
          {isAttacker && phase === 'TRICK_THROW_IN' && (
            <>
              <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => sendAction('turn.throwIn')} disabled={selected.size === 0}>
                Подкинуть
              </button>
              <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={sendPass}>
                Пас
              </button>
            </>
          )}
          {isDefender && phase === 'TRICK_DEFENSE' && (
            <button style={{ ...styles.btn, ...styles.btnDanger }} onClick={sendTake}>
              Взять
            </button>
          )}
          {isAttacker && phase === 'TRICK_RESOLUTION' && (
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={sendBeat}>
              Бито ✓
            </button>
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
    height: '100%',
    background: 'linear-gradient(160deg, #14532d 0%, #052e16 100%)',
    padding: '8px 12px',
    gap: 8,
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  trumpBadge: {
    background: 'rgba(255,255,255,0.15)',
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 13,
    color: '#fff',
    fontWeight: 600,
  },
  deckBadge: {
    background: 'rgba(255,255,255,0.1)',
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  phaseBadge: {
    marginLeft: 'auto',
    background: 'rgba(250,204,21,0.2)',
    color: '#facc15',
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
  },
  opponents: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  opponentChip: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    background: 'rgba(255,255,255,0.08)',
    padding: '6px 12px',
    borderRadius: 20,
    fontSize: 13,
    color: '#fff',
  },
  cardCount: {
    fontSize: 12,
    opacity: 0.7,
  },
  table: {
    flex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignContent: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: 16,
    padding: 12,
    minHeight: 120,
  },
  emptyTable: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    margin: 0,
  },
  tableSlot: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    alignItems: 'center',
  },
  hand: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: '8px 0',
  },
  emptyHand: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    margin: 0,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 64,
    background: '#1e293b',
    border: '2px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    padding: 4,
    gap: 2,
  },
  actions: {
    display: 'flex',
    gap: 8,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  btn: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: 10,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    minWidth: 100,
  },
  btnPrimary: { background: '#22c55e', color: '#fff' },
  btnSecondary: { background: 'rgba(255,255,255,0.15)', color: '#fff' },
  btnDanger: { background: '#ef4444', color: '#fff' },
};
