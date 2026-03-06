import Phaser from "phaser";
import { HandView } from "../cards/HandView";
import type { CardModel, Suit, Rank } from "../cards/CardTypes";
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
  private playerCount = 4;

  private bg!: Phaser.GameObjects.Rectangle;
  private centerZone!: Phaser.GameObjects.Rectangle;
  private attackZone!: Phaser.GameObjects.Rectangle;
  private defenseZone!: Phaser.GameObjects.Rectangle;

  private attackLabel!: Phaser.GameObjects.Text;
  private defenseLabel!: Phaser.GameObjects.Text;

  private deckZone!: Phaser.GameObjects.Rectangle;
  private trumpZone!: Phaser.GameObjects.Rectangle;
  private discardZone!: Phaser.GameObjects.Rectangle;

  private seatRects: Phaser.GameObjects.Rectangle[] = [];
  private seatTexts: Phaser.GameObjects.Text[] = [];

  private hand!: HandView;
  private attackCards: CardView[] = [];
  private defenseCards: (CardView | undefined)[] = [];

  private debugText!: Phaser.GameObjects.Text;

  constructor() {
    super("TableScene");
  }

  create() {
    this.bg = this.add.rectangle(0, 0, 10, 10, 0x0b3d2e).setOrigin(0);

    this.centerZone = this.add.rectangle(0, 0, 10, 10, 0x114b3a, 0.35)
      .setStrokeStyle(2, 0x1edc83, 0.9);

    this.attackZone = this.add.rectangle(0, 0, 10, 10, 0x1b5f4a, 0.35)
      .setStrokeStyle(2, 0xffffff, 0.35);

    this.defenseZone = this.add.rectangle(0, 0, 10, 10, 0x1b5f4a, 0.35)
      .setStrokeStyle(2, 0xffffff, 0.35);

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

    this.debugText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#d0ffd0",
    }).setDepth(2000);

    this.input.keyboard?.on("keydown-TWO", () => this.setPlayerCount(2));
    this.input.keyboard?.on("keydown-THREE", () => this.setPlayerCount(3));
    this.input.keyboard?.on("keydown-FOUR", () => this.setPlayerCount(4));
    this.input.keyboard?.on("keydown-FIVE", () => this.setPlayerCount(5));
    this.input.keyboard?.on("keydown-SIX", () => this.setPlayerCount(6));

    this.layout();

    const metrics = getTableMetrics(
      this.scale.width,
      this.scale.height,
      this.playerCount
    );
    const cardW = metrics.zoneLayout === "vertical" ? 68 : 80;
    const cardH = Math.floor(cardW * 1.45);
    this.hand = new HandView(this, {
      cardW,
      cardH,
      bottomMargin: metrics.reservedBottom,
    });
    this.hand.setCards(this.makeTestHand(6));
    this.hand.resize(this.scale.width, this.scale.height, metrics.reservedBottom);

    this.events.on("hand-card-drop", (card: CardView) => {
      if (!this.hand.contains(card)) return;

      const a = this.attackZone.getBounds();
      const d = this.defenseZone.getBounds();

      if (a.contains(card.x, card.y)) {
        this.placeToAttack(card);
      } else if (d.contains(card.x, card.y)) {
        this.placeToDefense(card);
      } else {
        this.hand.layout();
      }

      this.pushHudState();
    });

    this.events.on("hand-selection-changed", () => {
      this.pushHudState();
    });

    gameUiBus.on("ui-action", (action: UiAction) => {
      this.handleUiAction(action);
    });

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

    this.scale.on("resize", () => this.layout());

    this.pushHudState();
  }

  private handleUiAction(action: UiAction) {
    const selected = this.hand.getSelectedCards();
    if (!selected.length && action !== "CLEAR_SELECTION") return;

    if (action === "CLEAR_SELECTION") {
      this.hand.clearSelection();
      this.pushHudState();
      return;
    }

    if (action === "PLAY_SELECTED_ATTACK" || action === "THROW_IN") {
      for (const card of selected) {
        this.placeToAttack(card);
      }
    }

    if (action === "DEFEND_SELECTED") {
      for (const card of selected) {
        if (this.findFirstUncoveredAttack() === -1) break;
        this.placeToDefense(card);
      }
    }

    this.pushHudState();
  }

  private pushHudState() {
    const selectedCount = this.hand?.getSelectedCards().length ?? 0;
    const canDefend = this.findFirstUncoveredAttack() !== -1;
    emitHudState({
      selectedCount,
      canAttack: true,
      canDefend,
      hint: "",
    });
  }

  private setPlayerCount(n: number) {
    this.playerCount = Phaser.Math.Clamp(n, 2, 6);
    this.layout();
  }

  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;

    const metrics = getTableMetrics(w, h, this.playerCount);

    this.bg.setSize(w, h);

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

    this.layoutSeats(
      metrics.centerX,
      metrics.centerY,
      metrics.centerW,
      metrics.centerH
    );

    this.hand?.resize(w, h, metrics.reservedBottom);
    this.layoutPairs();

    this.debugText.setText(`Игроков: ${this.playerCount} | Клавиши 2..6`);
    this.debugText.setPosition(metrics.pad, metrics.pad);
  }

  private layoutSeats(cx: number, cy: number, cw: number, ch: number) {
    this.seatRects.forEach((r) => r.destroy());
    this.seatTexts.forEach((t) => t.destroy());
    this.seatRects = [];
    this.seatTexts = [];

    const seats = this.computeSeats(this.playerCount, cx, cy, cw, ch);
    const seatBoxW = Math.max(90, Math.floor(cw * 0.15));
    const seatBoxH = Math.max(40, Math.floor(ch * 0.09));

    for (const s of seats) {
      const rect = this.add.rectangle(s.x, s.y, seatBoxW, seatBoxH, 0x0e2f26, 0.45)
        .setStrokeStyle(2, 0xffffff, 0.25);

      const txt = this.add.text(s.x, s.y, s.label, {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#ffffff",
      }).setOrigin(0.5);

      this.seatRects.push(rect);
      this.seatTexts.push(txt);
    }
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

  private makeTestHand(n: number): CardModel[] {
    const suits: Suit[] = ["♠", "♥", "♦", "♣"];
    const ranks: Rank[] = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    const cards: CardModel[] = [];

    for (let i = 0; i < n; i++) {
      cards.push({
        id: "c" + i,
        suit: suits[i % 4],
        rank: ranks[(i * 2) % ranks.length],
        faceUp: true,
      });
    }

    return cards;
  }

  private placeToAttack(card: CardView) {
    this.hand.removeCard(card);
    card.setSelected(false);
    this.attackCards.push(card);
    this.layoutPairs();
  }

  private placeToDefense(card: CardView) {
    const idx = this.findFirstUncoveredAttack();
    if (idx === -1) {
      this.hand.layout();
      return;
    }

    this.hand.removeCard(card);
    card.setSelected(false);
    this.defenseCards[idx] = card;
    this.layoutPairs();
  }

  private findFirstUncoveredAttack() {
    for (let i = 0; i < this.attackCards.length; i++) {
      if (!this.defenseCards[i]) return i;
    }
    return -1;
  }

  private layoutPairs() {
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
        a.x = x;
        a.y = y;
        a.setDepth(100 + i * 2);
      }
      if (d) {
        d.x = x + dx;
        d.y = y + dy;
        d.setDepth(101 + i * 2);
      }
    }
  }
}
