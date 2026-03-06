/**
 * Пример использования core-логики игры "Дурак".
 * Демонстрирует создание игры, проверку атаки и защиты.
 */

import { createInitialGame } from "./setup";
import {
  canAttackWithCard,
  canDefendWithCard,
  canThrowInWithCard,
  getTableRanks,
  findFirstUncoveredPair,
} from "./rules";

// --- Создание начального состояния ---
const state = createInitialGame(4);

console.log("=== Начальная игра (4 игрока) ===");
console.log("Количество игроков:", state.players.length);
console.log("Карт в колоде:", state.deck.length);
console.log("Козырь:", state.trumpCard ? `${state.trumpCard.rank}${state.trumpCard.suit}` : "нет");
console.log("Масть козыря:", state.trumpSuit ?? "—");

// --- Вывод козыря ---
if (state.trumpCard) {
  console.log("\n=== Козырная карта ===");
  console.log(`Ранг: ${state.trumpCard.rank}, масть: ${state.trumpCard.suit}`);
}

// --- Пример проверки атаки ---
const attacker = state.players[0];
const attackCard = attacker.hand[0];

if (attackCard) {
  const canAttack = canAttackWithCard(state, attackCard);
  console.log("\n=== Проверка атаки ===");
  console.log(`Карта: ${attackCard.rank}${attackCard.suit}`);
  console.log(`На столе карт: ${state.tablePairs.length}`);
  console.log(`Можно атаковать: ${canAttack}`);
}

// --- Симуляция стола с картами для проверки правил ---
const stateWithTable = {
  ...state,
  tablePairs: [
    {
      attack: attacker.hand[0]!,
      defense: undefined,
    },
  ],
};

const tableRanks = getTableRanks(stateWithTable);
console.log("\n=== Ранги на столе ===");
console.log("Ранги:", tableRanks.join(", "));

const firstUncovered = findFirstUncoveredPair(stateWithTable);
console.log("Индекс первой небитой пары:", firstUncovered);

// --- Пример проверки защиты ---
const defender = state.players[1];
const defenseCard = defender.hand.find(
  (c) =>
    c.suit === attacker.hand[0]?.suit &&
    ["7", "8", "9", "10", "J", "Q", "K", "A"].includes(c.rank)
) ?? defender.hand[0];

if (attackCard && defenseCard && state.trumpSuit) {
  const canDefend = canDefendWithCard(
    attackCard,
    defenseCard,
    state.trumpSuit
  );
  console.log("\n=== Проверка защиты ===");
  console.log(`Атака: ${attackCard.rank}${attackCard.suit}`);
  console.log(`Защита: ${defenseCard.rank}${defenseCard.suit}`);
  console.log(`Можно отбить: ${canDefend}`);
}

// --- Пример проверки подкидывания ---
const throwCard = attacker.hand.find((c) => tableRanks.includes(c.rank));
if (throwCard) {
  const canThrow = canThrowInWithCard(stateWithTable, throwCard);
  console.log("\n=== Проверка подкидывания ===");
  console.log(`Карта: ${throwCard.rank}${throwCard.suit}`);
  console.log(`Можно подкинуть: ${canThrow}`);
}
