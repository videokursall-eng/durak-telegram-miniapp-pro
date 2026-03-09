import { describe, it, expect, vi } from 'vitest';
import { WsRegistry } from '../registry.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Parameters<
  WsRegistry['add']
>[1];

function makeSocket(readyState = 1 /* OPEN */) {
  return {
    readyState,
    OPEN: 1,
    close: vi.fn(),
  };
}

function makeSession(
  telegramUserId: string,
  connectionId: string,
  socket = makeSocket(),
) {
  return { telegramUserId, connectionId, socket: socket as unknown as WebSocket, connectedAt: Date.now() };
}

describe('WsRegistry', () => {
  it('registers a new connection', () => {
    const reg = new WsRegistry();
    const session = makeSession('user1', 'conn_1');
    reg.add(session, mockLog);
    expect(reg.size).toBe(1);
    expect(reg.getByUser('user1')).toBe(session);
    expect(reg.get('conn_1')).toBe(session);
  });

  it('closes old socket when same user registers a new connection', () => {
    const reg = new WsRegistry();
    const oldSocket = makeSocket(1);
    const oldSession = makeSession('user1', 'conn_old', oldSocket);
    reg.add(oldSession, mockLog);

    const newSocket = makeSocket(1);
    const newSession = makeSession('user1', 'conn_new', newSocket);
    reg.add(newSession, mockLog);

    // Old socket must have been closed
    expect(oldSocket.close).toHaveBeenCalledOnce();
    expect(oldSocket.close).toHaveBeenCalledWith(1001, 'replaced by new connection');

    // New session should be registered
    expect(reg.size).toBe(1);
    expect(reg.getByUser('user1')).toBe(newSession);
  });

  it('does NOT close old socket if it is not OPEN', () => {
    const reg = new WsRegistry();
    const oldSocket = makeSocket(3); // CLOSED
    const oldSession = makeSession('user1', 'conn_old', oldSocket);
    reg.add(oldSession, mockLog);

    const newSession = makeSession('user1', 'conn_new');
    reg.add(newSession, mockLog);

    // Should not attempt close on already-closed socket
    expect(oldSocket.close).not.toHaveBeenCalled();
  });

  it('removes a connection by connectionId', () => {
    const reg = new WsRegistry();
    const session = makeSession('user1', 'conn_1');
    reg.add(session, mockLog);
    reg.remove('conn_1');
    expect(reg.size).toBe(0);
    expect(reg.getByUser('user1')).toBeUndefined();
    expect(reg.get('conn_1')).toBeUndefined();
  });

  it('ignores remove for unknown connectionId', () => {
    const reg = new WsRegistry();
    expect(() => reg.remove('unknown')).not.toThrow();
  });

  it('only removes the correct user entry when connectionId matches', () => {
    const reg = new WsRegistry();
    const session = makeSession('user1', 'conn_1');
    reg.add(session, mockLog);

    // Simulate a stale remove with a different (old) conn id
    reg.remove('conn_old');

    expect(reg.size).toBe(1);
    expect(reg.getByUser('user1')).toBe(session);
  });

  it('handles multiple distinct users', () => {
    const reg = new WsRegistry();
    reg.add(makeSession('user1', 'conn_1'), mockLog);
    reg.add(makeSession('user2', 'conn_2'), mockLog);
    reg.add(makeSession('user3', 'conn_3'), mockLog);

    expect(reg.size).toBe(3);

    reg.remove('conn_2');
    expect(reg.size).toBe(2);
    expect(reg.getByUser('user2')).toBeUndefined();
    expect(reg.getByUser('user1')).toBeDefined();
    expect(reg.getByUser('user3')).toBeDefined();
  });
});
