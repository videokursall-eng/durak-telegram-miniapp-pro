# Cursor Task — Rules Engine в packages/shared

## Цель
Сделать “сердце” игры как чистую логику, которая легко тестируется.

## Задача
1) Определи типы:
- Card, Rank, Suit
- PlayerState (hand: CardId[])
- TableState (pairs)
- GameState (phase, players, attackerId, defenderId, trumpSuit, deck, discard, table, version)

2) Действия:
- Attack, Defend, ThrowIn, Take, Beat, Pass, Transfer

3) Функции:
- `createDeck36()`
- `shuffle(seed?)` (пока можно Math.random, позже seedable)
- `dealInitialHands()`
- `applyAction(state, action)`:
  - возвращает новый state
  - либо бросает/возвращает доменную ошибку

4) Тесты:
- минимум 20 юнит-тестов на простые кейсы
- 20 — на лимит стола и подкидывание
- 20 — на переводной (transfer) цепочки

## Критерии готовности
- тесты проходят
- нет мутаций исходного state
- ошибки возвращаются с кодами (INVALID_MOVE, NOT_YOUR_TURN, etc.)
