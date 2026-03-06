import Phaser from "phaser";

export const gameUiBus = new Phaser.Events.EventEmitter();

export type UiAction = "PLAY_SELECTED_ATTACK" | "THROW_IN" | "DEFEND_SELECTED" | "CLEAR_SELECTION";

export type HudState = {
  selectedCount: number;
  canAttack: boolean;
  canDefend: boolean;
  hint: string;
};

export function emitUiAction(action: UiAction) {
  gameUiBus.emit("ui-action", action);
}

export function emitHudState(state: HudState) {
  gameUiBus.emit("hud-state", state);
}
