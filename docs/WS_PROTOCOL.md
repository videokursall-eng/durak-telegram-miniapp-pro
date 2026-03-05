# WS Protocol — Durak PRO (client↔server)

## 1. Принципы
- Транспорт: WebSocket.
- Формат сообщений: JSON.
- Сервер — источник истины.
- Все действия клиента — “намерения” (intentions), сервер валидирует.
- Идемпотентность: `actionId` уникален на клиенте (UUID).
- Версионирование: `stateVersion` (int) увеличивается сервером.

## 2. Общий формат
### 2.1 Client → Server
```json
{
  "type": "turn.attack",
  "actionId": "uuid",
  "matchId": "m_123",
  "payload": { }
}
```

### 2.2 Server → Client (ack)
```json
{
  "type": "ack",
  "actionId": "uuid",
  "matchId": "m_123",
  "ok": true,
  "stateVersion": 42
}
```

### 2.3 Server → Client (error)
```json
{
  "type": "error",
  "actionId": "uuid",
  "matchId": "m_123",
  "code": "INVALID_MOVE",
  "message": "Нельзя подкинуть карту этого ранга",
  "details": { }
}
```

### 2.4 Server → Client (state snapshot / patch)
Рекомендуется в MVP отправлять **полный snapshot**, потом оптимизировать на patch.
```json
{
  "type": "state.snapshot",
  "matchId": "m_123",
  "stateVersion": 42,
  "payload": {
    "state": { }
  }
}
```

## 3. События комнаты (Room)
### 3.1 room.join (C→S)
payload:
- `roomId`
- `authToken` (полученный после проверки initData)

### 3.2 room.joined (S→C)
payload:
- `room`
- `selfPlayerId`

### 3.3 room.players (S→C)
payload:
- список игроков, статусы ready, owner

### 3.4 room.start (C→S)
payload:
- `mode`: `simple` | `transfer`
- `maxPlayers`: 2..6

## 4. События матча (Match)
### 4.1 match.started (S→C)
payload:
- `matchId`
- `mode`
- initial snapshot

### 4.2 sync.state (C→S)
payload:
- `matchId`
- `knownStateVersion`

### 4.3 state.snapshot (S→C)
payload:
- полный state

## 5. Игровые действия (Turn)
### 5.1 turn.attack (C→S)
payload:
- `cards`: array of cardIds

### 5.2 turn.defend (C→S)
payload:
- `pairIndex`: int
- `card`: cardId

### 5.3 turn.throwIn (C→S)
payload:
- `cards`: array of cardIds

### 5.4 turn.transfer (C→S) — только transfer mode
payload:
- `card`: cardId

### 5.5 turn.take (C→S)
payload: {}

### 5.6 turn.beat (C→S) — “Бито”
payload: {}

### 5.7 turn.pass (C→S) — “Пас/Не подкидываю”
payload: {}

## 6. Системные события
### 6.1 presence.ping / presence.pong
для keepalive и измерения latency (опционально)

### 6.2 match.ended (S→C)
payload:
- результаты
- кто “дурак”
- статистика

## 7. Требования безопасности
- `authToken` выдаётся только после проверки `initData`.
- На WS канал: rate limiting.
- Сервер игнорирует action с повторным `actionId` (возвращает ack с текущей версией).
- Сервер проверяет роль игрока (attacker/defender/currentTurn).

## 8. Карты (cardId)
Внутренний формат:
- `AS` (Ace of Spades), `TD` (Ten of Diamonds), etc.
или объект `{rank:"A", suit:"S"}` — важно единообразие (в shared).
