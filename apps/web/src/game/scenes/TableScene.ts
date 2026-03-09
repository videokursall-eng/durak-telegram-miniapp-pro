import Phaser from "phaser";
import type { Card, GameAction, GameState, PlayerState, Suit } from "@durak/shared";
import { HandView } from "../cards/HandView";
import type { CardModel } from "../cards/CardTypes";
import { CardView } from "../cards/CardView";
import { emitHudState, gameUiBus, type UiAction } from "../events/gameUiBus";
import { getTableMetrics } from "../tableLayout";

type Seat = {
  i: number;
  x: number;
  y: number;
  angleRad: number;
  label: string;
};

export class TableScene extends Phaser.Scene {
  private myPlayerId = "p1";
  private gameState: GameState | null = null;
  private sendAction?: (action: GameAction) => void;
  private playerCount = 4;
  private statusHint = "";
  private isSceneReady = false;
  private handCardW = 80;
  private handCardH = 116;

  private bg!: Phaser.GameObjects.Rectangle;
  private feltGlow!: Phaser.GameObjects.Ellipse;
  private centerZone!: Phaser.GameObjects.Rectangle;
  private attackZone!: Phaser.GameObjects.Rectangle;
  private defenseZone!: Phaser.GameObjects.Rectangle;

  private attackLabel!: Phaser.GameObjects.Text;
  private defenseLabel!: Phaser.GameObjects.Text;

  private deckZone!: Phaser.GameObjects.Rectangle;
  private trumpZone!: Phaser.GameObjects.Rectangle;
  private discardZone!: Phaser.GameObjects.Rectangle;
  private deckCountText!: Phaser.GameObjects.Text;
  private trumpText!: Phaser.GameObjects.Text;
  private discardText!: Phaser.GameObjects.Text;
  private turnBanner!: Phaser.GameObjects.Text;
  private deckPreview: CardView[] = [];
  private trumpPreview?: CardView;
  private discardPreview?: CardView;

  private seatRects: Phaser.GameObjects.Rectangle[] = [];
  private seatTexts: Phaser.GameObjects.Text[] = [];
  private seatBadges: Phaser.GameObjects.Text[] = [];

  private hand!: HandView;
  private attackCards: CardView[] = [];
  private defenseCards: (CardView | undefined)[] = [];
  private tablePlaceholderText!: Phaser.GameObjects.Text;

  private debugText!: Phaser.GameObjects.Text;
  private lastRenderedVersion = -1;
  private readonly onUiAction = (action: UiAction) => {
    this.handleUiAction(action);
  };
  private readonly onResize = () => {
    this.layout();
  };

  constructor() {
    super("TableScene");
  }

  setSessionData(
    gameState: GameState | null,
    options?: {
      myPlayerId?: string;
      sendAction?: (action: GameAction) => void;
    }
  ) {
    this.gameState = gameState;
    this.myPlayerId = options?.myPlayerId ?? this.myPlayerId;
    this.sendAction = options?.sendAction;
    this.playerCount = gameState?.players.length ?? this.playerCount;

    if (!this.isSceneReady) {
      return;
    }

    this.renderFromState();
  }

  create() {
    this.bg = this.add.rectangle(0, 0, 10, 10, 0x0b3d2e).setOrigin(0);
    this.feltGlow = this.add.ellipse(0, 0, 10, 10, 0x1b8f63, 0.12);

    this.centerZone = this.add
      .rectangle(0, 0, 10, 10, 0x114b3a, 0.42)
      .setStrokeStyle(2, 0x3ff3ab, 0.78);

    this.attackZone = this.add
      .rectangle(0, 0, 10, 10, 0x1b5f4a, 0.26)
      .setStrokeStyle(2, 0xffffff, 0.26);

    this.defenseZone = this.add
      .rectangle(0, 0, 10, 10, 0x1b5f4a, 0.26)
      .setStrokeStyle(2, 0xffffff, 0.26);

    this.attackLabel = this.add.text(0, 0, "АТАКА", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffffff",
    }).setOrigin(0.5);

    this.defenseLabel = this.add.text(0, 0, "ЗАЩИТА", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffffff",
    }).setOrigin(0.5);

    this.deckZone = this.add.rectangle(0, 0, 10, 10, 0x143f33, 0.45)
      .setStrokeStyle(2, 0xffffff, 0.25);

    this.trumpZone = this.add.rectangle(0, 0, 10, 10, 0x143f33, 0.45)
      .setStrokeStyle(2, 0xffd166, 0.85);

    this.discardZone = this.add.rectangle(0, 0, 10, 10, 0x143f33, 0.25)
      .setStrokeStyle(2, 0xffffff, 0.25);

    this.deckCountText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#ffffff",
      fontStyle: "bold",
      align: "center",
    }).setOrigin(0.5);

    this.trumpText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#ffe7a8",
      fontStyle: "bold",
      align: "center",
    }).setOrigin(0.5);

    this.discardText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#d0ffd0",
      fontStyle: "bold",
      align: "center",
    }).setOrigin(0.5);

    this.turnBanner = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#dffff1",
      fontStyle: "bold",
      backgroundColor: "#000000",
      padding: {
        left: 12,
        right: 12,
        top: 6,
        bottom: 6,
      },
    }).setOrigin(0.5).setDepth(1600);

    this.tablePlaceholderText = this.add.text(0, 0, "Разыграйте первую карту", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#c5f7dc",
      fontStyle: "bold",
      align: "center",
    }).setOrigin(0.5).setAlpha(0.7).setDepth(50);

    this.debugText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#d0ffd0",
    }).setDepth(2000);

    this.layout();

    const metrics = getTableMetrics(
      this.scale.width,
      this.scale.height,
      this.playerCount
    );
    this.handCardW = metrics.zoneLayout === "vertical" ? 68 : 80;
    this.handCardH = Math.floor(this.handCardW * 1.45);
    this.hand = new HandView(this, {
      cardW: this.handCardW,
      cardH: this.handCardH,
      bottomMargin: metrics.reservedBottom,
    });
    this.hand.resize(this.scale.width, this.scale.height, metrics.reservedBottom);

    this.events.on("hand-card-drop", () => {
      this.hand.layout();
      this.pushHudState();
    });

    this.events.on("hand-selection-changed", () => {
      this.pushHudState();
    });

    gameUiBus.on("ui-action", this.onUiAction);

    this.input.on("pointermove", () => {
      const activeCard = this.hand.allCards().find((c) => c.depth >= 5000);
      if (!activeCard) {
        this.attackZone.setStrokeStyle(2, 0xffffff, 0.35);
        this.defenseZone.setStrokeStyle(2, 0xffffff, 0.35);
        return;
      }

      const inAttack = this.attackZone.getBounds().contains(activeCard.x, activeCard.y);
      const inDefense = this.defenseZone.getBounds().contains(activeCard.x, activeCard.y);

      this.attackZone.setStrokeStyle(inAttack ? 3 : 2, inAttack ? 0x1edc83 : 0xffffff, inAttack ? 0.85 : 0.35);
      this.defenseZone.setStrokeStyle(inDefense ? 3 : 2, inDefense ? 0x1edc83 : 0xffffff, inDefense ? 0.85 : 0.35);
    });

    this.scale.on("resize", this.onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      gameUiBus.off("ui-action", this.onUiAction);
      this.scale.off("resize", this.onResize);
      this.destroyTableCards();
      this.destroyPileCards();
    });

    this.isSceneReady = true;
    this.renderFromState();
    requestAnimationFrame(() => {
      this.renderFromState();
    });
  }

  private getMyPlayer() {
    return this.gameState?.players.find((player) => player.id === this.myPlayerId);
  }

  private mapCurrentHandToView(): CardModel[] {
    const me = this.getMyPlayer();
    return (me?.hand ?? []).map((card) => ({
      id: card.id,
      suit: this.mapSuitToView(card.suit),
      rank: card.rank,
      faceUp: true,
    }));
  }

  private mapSuitToView(suit: Suit): "♣" | "♦" | "♥" | "♠" {
    switch (suit) {
      case "clubs":
        return "♣";
      case "diamonds":
        return "♦";
      case "hearts":
        return "♥";
      case "spades":
        return "♠";
    }
  }

  private mapCardToView(card: Card, faceUp = true): CardModel {
    return {
      id: card.id,
      suit: this.mapSuitToView(card.suit),
      rank: card.rank,
      faceUp,
    };
  }

  private getFirstUncoveredPairIndexFromState(): number {
    return this.gameState?.table.pairs.findIndex((pair) => !pair.defense) ?? -1;
  }

  private handleUiAction(action: UiAction) {
    if (!this.hand) {
      return;
    }

    if (action === "CLEAR_SELECTION") {
      this.statusHint = "";
      this.hand.clearSelection();
      this.pushHudState();
      return;
    }

    if (!this.gameState) {
      this.statusHint = "Ожидание состояния комнаты";
      this.pushHudState();
      return;
    }

    const selected = this.hand.getSelectedCards();
    if (!selected.length) {
      this.statusHint = "Выберите карту";
      this.pushHudState();
      return;
    }

    if (!this.sendAction) {
      this.statusHint = "Сокет не подключен";
      this.pushHudState();
      return;
    }

    const selectedCardIds = selected.map((card) => card.model.id);

    if (action === "PLAY_SELECTED_ATTACK") {
      this.sendGameAction({
        type: "attack",
        playerId: this.myPlayerId,
        cardIds: selectedCardIds,
      });
      return;
    }

    if (action === "THROW_IN") {
      this.sendGameAction({
        type: "throw_in",
        playerId: this.myPlayerId,
        cardIds: selectedCardIds,
      });
      return;
    }

    if (action === "DEFEND_SELECTED") {
      if (selectedCardIds.length > 1) {
        this.statusHint = "Для защиты выберите одну карту";
        this.pushHudState();
        return;
      }

      const attackIndex = this.getFirstUncoveredPairIndexFromState();
      if (attackIndex === -1) {
        this.statusHint = "Нет открытой карты для защиты";
        this.pushHudState();
        return;
      }

      this.sendGameAction({
        type: "defend",
        playerId: this.myPlayerId,
        attackIndex,
        cardId: selectedCardIds[0],
      });
      return;
    }
  }

  private sendGameAction(action: GameAction) {
    this.sendAction?.(action);
    this.statusHint = "";
    this.hand.clearSelection();
    this.pushHudState();
  }

  private pushHudState() {
    const selectedCount = this.hand?.getSelectedCards().length ?? 0;
    const isMyTurn = this.gameState?.currentTurnPlayerId === this.myPlayerId;

    const canAttack =
      this.gameState?.phase === "attack" &&
      this.gameState.attackerId === this.myPlayerId &&
      isMyTurn;

    const canDefend =
      this.gameState?.phase === "defense" &&
      this.gameState.defenderId === this.myPlayerId &&
      isMyTurn &&
      this.getFirstUncoveredPairIndexFromState() !== -1;

    emitHudState({
      selectedCount,
      canAttack,
      canDefend,
      hint: this.statusHint,
    });

    this.updateDebugText();
  }

  private updateDebugText() {
    if (!this.gameState) {
      this.debugText.setText("Ожидание room.state");
      this.turnBanner.setText("");
      return;
    }

    const phaseLabel =
      this.gameState.phase === "attack"
        ? "Атака"
        : this.gameState.phase === "defense"
          ? "Защита"
          : this.gameState.phase;

    const turnOwner =
      this.gameState.currentTurnPlayerId === this.myPlayerId
        ? "Ваш ход"
        : `Ход: ${this.gameState.currentTurnPlayerId ?? "-"}`;

    const base =
      `Игроков: ${this.playerCount} | Фаза: ${phaseLabel} | ${turnOwner}` +
      ` | Версия: ${this.gameState.version}`;
    this.debugText.setText(this.statusHint ? `${base} | ${this.statusHint}` : base);

    const currentPlayer = this.gameState.players.find(
      (player) => player.id === this.gameState?.currentTurnPlayerId
    );
    this.turnBanner.setText(
      currentPlayer
        ? currentPlayer.id === this.myPlayerId
          ? "Ваш ход"
          : `Ходит ${currentPlayer.name}`
        : ""
    );
  }

  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;

    const metrics = getTableMetrics(w, h, this.playerCount);

    this.bg.setSize(w, h);
    this.feltGlow.setPosition(metrics.centerX, metrics.centerY).setSize(metrics.playW * 1.08, metrics.playH * 1.06);

    this.centerZone
      .setPosition(metrics.centerX, metrics.centerY)
      .setSize(metrics.playW, metrics.playH);

    this.attackZone
      .setPosition(metrics.attackZone.x, metrics.attackZone.y)
      .setSize(metrics.attackZone.w, metrics.attackZone.h);

    this.defenseZone
      .setPosition(metrics.defenseZone.x, metrics.defenseZone.y)
      .setSize(metrics.defenseZone.w, metrics.defenseZone.h);

    const { labelStyle } = metrics;
    this.attackLabel.setFontSize(labelStyle.fontSize);
    this.defenseLabel.setFontSize(labelStyle.fontSize);

    const attackLabelY =
      metrics.attackZone.y - metrics.attackZone.h / 2 + labelStyle.offsetFromTop;
    const defenseLabelY =
      metrics.defenseZone.y - metrics.defenseZone.h / 2 + labelStyle.offsetFromTop;

    this.attackLabel.setPosition(metrics.attackZone.x, attackLabelY);
    this.defenseLabel.setPosition(metrics.defenseZone.x, defenseLabelY);

    const pileCardW = Math.max(50, Math.floor(metrics.sideW * 0.85));
    const pileCardH = Math.max(72, Math.floor(pileCardW * 1.45));

    const deckY = metrics.centerY - pileCardH * 0.9;
    const trumpY = metrics.centerY;
    const discardY = metrics.centerY + pileCardH * 0.95;

    this.deckZone.setSize(pileCardW, pileCardH).setPosition(metrics.sideX, deckY);
    this.trumpZone.setSize(pileCardW, pileCardH).setPosition(metrics.sideX, trumpY);
    this.discardZone
      .setSize(pileCardW * 1.2, pileCardH * 0.9)
      .setPosition(metrics.sideX, discardY);

    this.deckCountText.setPosition(metrics.sideX, deckY + pileCardH / 2 + 16);
    this.trumpText.setPosition(metrics.sideX, trumpY + pileCardH / 2 + 16);
    this.discardText.setPosition(metrics.sideX, discardY + pileCardH / 2 + 14);
    this.turnBanner.setPosition(metrics.centerX, metrics.pad + 22);
    this.tablePlaceholderText.setPosition(metrics.centerX, metrics.centerY);

    this.layoutSeats(
      metrics.centerX,
      metrics.centerY,
      metrics.centerW,
      metrics.centerH
    );

    this.hand?.resize(w, h, metrics.reservedBottom);
    this.layoutPairs();
    this.layoutPileCards();
    this.debugText.setPosition(metrics.pad, metrics.pad);
    this.updateDebugText();
  }

  private layoutSeats(cx: number, cy: number, cw: number, ch: number) {
    this.seatRects.forEach((r) => r.destroy());
    this.seatTexts.forEach((t) => t.destroy());
    this.seatBadges.forEach((badge) => badge.destroy());
    this.seatRects = [];
    this.seatTexts = [];
    this.seatBadges = [];

    const playerCount = this.gameState?.players.length ?? this.playerCount;
    const seats = this.computeSeats(playerCount, cx, cy, cw, ch);
    const orderedPlayers = this.getOrderedPlayers();
    const seatBoxW = Math.max(90, Math.floor(cw * 0.15));
    const seatBoxH = Math.max(52, Math.floor(ch * 0.11));

    for (const [index, s] of seats.entries()) {
      const rect = this.add
        .rectangle(s.x, s.y, seatBoxW, seatBoxH, 0x0e2f26, 0.52)
        .setStrokeStyle(2, 0xffffff, 0.18);

      const txt = this.add.text(s.x, s.y, this.formatSeatLabel(orderedPlayers[index], s.label), {
        fontFamily: "Arial",
        fontSize: "13px",
        color: "#ffffff",
        align: "center",
      }).setOrigin(0.5);

      const badge = this.add.text(s.x, s.y - seatBoxH / 2 - 10, "", {
        fontFamily: "Arial",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#082118",
        backgroundColor: "#8ef0b8",
        padding: {
          left: 6,
          right: 6,
          top: 3,
          bottom: 3,
        },
      }).setOrigin(0.5).setVisible(false);

      const player = orderedPlayers[index];
      const isCurrent = player && this.gameState?.currentTurnPlayerId === player.id;
      const isAttacker = player?.isAttacker;
      const isDefender = player?.isDefender;
      const badgeParts = [
        isCurrent ? "TURN" : "",
        isAttacker ? "ATK" : "",
        isDefender ? "DEF" : "",
      ].filter(Boolean);
      const isSelf = player?.id === this.myPlayerId;

      rect.setStrokeStyle(
        isCurrent ? 3 : 2,
        isCurrent ? 0x7affc3 : isSelf ? 0xffd166 : 0xffffff,
        isCurrent ? 0.9 : isSelf ? 0.75 : 0.18
      );
      rect.setFillStyle(isCurrent ? 0x124232 : 0x0e2f26, isCurrent ? 0.72 : 0.52);
      txt.setColor(isCurrent ? "#f3fff9" : "#ffffff");
      badge.setVisible(badgeParts.length > 0).setText(badgeParts.join(" • "));

      this.seatRects.push(rect);
      this.seatTexts.push(txt);
      this.seatBadges.push(badge);
    }
  }

  private getOrderedPlayers(): PlayerState[] {
    if (!this.gameState?.players.length) {
      return [];
    }

    const players = this.gameState.players;
    const myIndex = players.findIndex((player) => player.id === this.myPlayerId);
    if (myIndex <= 0) {
      return players;
    }

    return [...players.slice(myIndex), ...players.slice(0, myIndex)];
  }

  private formatSeatLabel(player: PlayerState | undefined, fallbackLabel: string) {
    if (!player) {
      return fallbackLabel;
    }

    const title = player.id === this.myPlayerId ? "You" : player.name;
    const badges = [
      player.isAttacker ? "ATK" : "",
      player.isDefender ? "DEF" : "",
      this.gameState?.currentTurnPlayerId === player.id ? "TURN" : "",
    ].filter(Boolean);

    const suffix = badges.length ? `\n${badges.join(" • ")}` : "";
    return `${title} (${player.hand.length})${suffix}`;
  }

  private computeSeats(playerCount: number, cx: number, cy: number, cw: number, ch: number): Seat[] {
    const seats: Seat[] = [];
    const rx = Math.max(1, cw * 0.39);
    const ry = Math.max(1, ch * 0.42);

    const addSeat = (i: number, angleDeg: number, label: string) => {
      const a = Phaser.Math.DegToRad(angleDeg);
      seats.push({
        i,
        x: cx + Math.cos(a) * rx,
        y: cy + Math.sin(a) * ry,
        angleRad: a,
        label,
      });
    };

    if (playerCount === 2) {
      addSeat(0, 90, "You");
      addSeat(1, 270, "P2");
      return seats;
    }
    if (playerCount === 3) {
      addSeat(0, 90, "You");
      addSeat(1, 250, "P2");
      addSeat(2, 290, "P3");
      return seats;
    }
    if (playerCount === 4) {
      addSeat(0, 90, "You");
      addSeat(1, 180, "P2");
      addSeat(2, 270, "P3");
      addSeat(3, 0, "P4");
      return seats;
    }
    if (playerCount === 5) {
      addSeat(0, 90, "You");
      addSeat(1, 170, "P2");
      addSeat(2, 240, "P3");
      addSeat(3, 300, "P4");
      addSeat(4, 10, "P5");
      return seats;
    }

    addSeat(0, 90, "You");
    addSeat(1, 140, "P2");
    addSeat(2, 200, "P3");
    addSeat(3, 270, "P4");
    addSeat(4, 340, "P5");
    addSeat(5, 20, "P6");
    return seats;
  }

  private renderFromState() {
    const previousVersion = this.lastRenderedVersion;
    this.playerCount = this.gameState?.players.length ?? this.playerCount;
    this.hand?.setCards(this.mapCurrentHandToView());
    this.layout();
    this.rebuildTableCards(previousVersion !== -1 && previousVersion !== this.gameState?.version);
    this.refreshPileInfo();
    this.pushHudState();
    this.lastRenderedVersion = this.gameState?.version ?? -1;
  }

  private rebuildTableCards(animate = false) {
    this.destroyTableCards();

    if (!this.gameState) {
      this.tablePlaceholderText.setVisible(false);
      return;
    }

    for (const pair of this.gameState.table.pairs) {
      this.attackCards.push(this.createTableCard(pair.attack));
      this.defenseCards.push(pair.defense ? this.createTableCard(pair.defense) : undefined);
    }

    this.tablePlaceholderText.setVisible(this.gameState.table.pairs.length === 0);
    this.layoutPairs(animate);
  }

  private destroyTableCards() {
    this.attackCards.forEach((card) => card.destroy());
    this.defenseCards.forEach((card) => card?.destroy());
    this.attackCards = [];
    this.defenseCards = [];
  }

  private destroyPileCards() {
    this.deckPreview.forEach((card) => card.destroy());
    this.deckPreview = [];
    this.trumpPreview?.destroy();
    this.trumpPreview = undefined;
    this.discardPreview?.destroy();
    this.discardPreview = undefined;
  }

  private createTableCard(card: Card) {
    const cardView = new CardView(this, this.mapCardToView(card), this.centerZone.x, this.centerZone.y, {
      width: this.handCardW,
      height: this.handCardH,
    });
    cardView.disableInteractive();
    cardView.setScale(0.92);
    cardView.setAlpha(0.94);
    return cardView;
  }

  private layoutPairs(animate = false) {
    const bounds = this.attackZone.getBounds();

    const cols = 2;
    const rows = 3;
    const pad = 10;

    const cellW = (bounds.width - pad * 2) / cols;
    const cellH = (bounds.height - pad * 2) / rows;

    const dx = Math.max(24, Math.floor(cellW * 0.28));
    const dy = Math.max(16, Math.floor(cellH * 0.22));

    for (let i = 0; i < 6; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const x = bounds.left + pad + (col + 0.5) * cellW;
      const y = bounds.top + pad + (row + 0.5) * cellH;

      const a = this.attackCards[i];
      const d = this.defenseCards[i];

      if (a) {
        a.setDepth(100 + i * 2);
        if (animate) {
          this.animateCardTo(a, x, y, Phaser.Math.DegToRad(-4));
        } else {
          a.x = x;
          a.y = y;
          a.rotation = Phaser.Math.DegToRad(-4);
          a.setScale(1);
          a.setAlpha(1);
        }
      }
      if (d) {
        d.setDepth(101 + i * 2);
        if (animate) {
          this.animateCardTo(d, x + dx, y + dy, Phaser.Math.DegToRad(7));
        } else {
          d.x = x + dx;
          d.y = y + dy;
          d.rotation = Phaser.Math.DegToRad(7);
          d.setScale(1);
          d.setAlpha(1);
        }
      }
    }
  }

  private animateCardTo(card: CardView, x: number, y: number, rotation: number) {
    this.tweens.add({
      targets: card,
      x,
      y,
      rotation,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 220,
      ease: "Cubic.Out",
    });
  }

  private refreshPileInfo() {
    if (!this.gameState) {
      this.deckCountText.setText("");
      this.trumpText.setText("");
      this.discardText.setText("");
      this.destroyPileCards();
      return;
    }

    this.deckCountText.setText(`КОЛОДА\n${this.gameState.deck.length}`);
    this.trumpText.setText(
      this.gameState.trumpCard
        ? `КОЗЫРЬ\n${this.gameState.trumpCard.rank}${this.mapSuitToView(this.gameState.trumpCard.suit)}`
        : "КОЗЫРЬ\n-"
    );
    this.discardText.setText(`СБРОС\n${this.gameState.discard.length}`);
    this.rebuildPileCards();
  }

  private rebuildPileCards() {
    this.destroyPileCards();
    const pileW = this.deckZone.width;
    const pileH = this.deckZone.height;
    const centerX = this.deckZone.x;
    const centerY = this.deckZone.y;

    for (let i = 0; i < Math.min(3, Math.max(1, this.gameState?.deck.length ?? 0)); i++) {
      const preview = new CardView(
        this,
        {
          id: `deck_${i}`,
          suit: "♠",
          rank: "A",
          faceUp: false,
        },
        centerX - i * 2,
        centerY - i * 2,
        {
          width: pileW,
          height: pileH,
        }
      );
      preview.disableInteractive();
      preview.setDepth(20 + i);
      this.deckPreview.push(preview);
    }

    if (this.gameState?.trumpCard) {
      this.trumpPreview = new CardView(
        this,
        this.mapCardToView(this.gameState.trumpCard),
        this.trumpZone.x,
        this.trumpZone.y,
        {
          width: this.trumpZone.width,
          height: this.trumpZone.height,
        }
      );
      this.trumpPreview.disableInteractive();
      this.trumpPreview.setDepth(24);
      this.trumpPreview.rotation = Phaser.Math.DegToRad(-90);
      this.trumpPreview.setAlpha(0.96);
    }

    const discardTop = this.gameState?.discard.at(-1);
    if (discardTop) {
      this.discardPreview = new CardView(
        this,
        this.mapCardToView(discardTop),
        this.discardZone.x,
        this.discardZone.y,
        {
          width: Math.min(this.discardZone.width, this.deckZone.width),
          height: this.deckZone.height,
        }
      );
      this.discardPreview.disableInteractive();
      this.discardPreview.setDepth(24);
      this.discardPreview.rotation = Phaser.Math.DegToRad(12);
      this.discardPreview.setAlpha(0.96);
    }
  }

  private layoutPileCards() {
    this.deckPreview.forEach((card, index) => {
      card.x = this.deckZone.x - index * 2;
      card.y = this.deckZone.y - index * 2;
    });
    if (this.trumpPreview) {
      this.trumpPreview.x = this.trumpZone.x;
      this.trumpPreview.y = this.trumpZone.y;
    }
    if (this.discardPreview) {
      this.discardPreview.x = this.discardZone.x;
      this.discardPreview.y = this.discardZone.y;
    }
  }
}
