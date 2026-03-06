import Phaser from "phaser";
import type { CardModel } from "./CardTypes";
import { CardView } from "./CardView";

export type HandViewOptions = {
  cardW: number;
  cardH: number;
  bottomMargin: number;
};

type DragState = {
  card: CardView;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

export class HandView {
  private scene: Phaser.Scene;
  private cards: CardView[] = [];
  private opts: HandViewOptions;

  private baseY = 0;
  private baseX = 0;
  private availableW = 0;

  private dragState: DragState | null = null;

  constructor(scene: Phaser.Scene, opts: HandViewOptions) {
    this.scene = scene;
    this.opts = opts;

    scene.input.setTopOnly(true);

    scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragState) return;
      if (pointer.id !== this.dragState.pointerId) return;

      const s = this.dragState;
      if (Math.abs(pointer.x - s.startX) > 5 || Math.abs(pointer.y - s.startY) > 5) {
        s.moved = true;
      }

      s.card.x = pointer.x - s.offsetX;
      s.card.y = pointer.y - s.offsetY;
      s.card.rotation = 0;
    });

    scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragState) return;
      if (pointer.id !== this.dragState.pointerId) return;

      const s = this.dragState;
      this.dragState = null;

      s.card.scale = s.card.selected ? 1.02 : 1;
      s.card.setDepth(10);

      if (s.moved) {
        this.scene.events.emit("hand-card-drop", s.card);
      } else {
        s.card.toggleSelected();
        this.scene.events.emit("hand-selection-changed");
        this.layout();
      }
    });

    scene.input.on("gameout", () => {
      if (!this.dragState) return;
      const s = this.dragState;
      this.dragState = null;
      if (this.cards.includes(s.card)) this.layout();
    });
  }

  public setCards(models: CardModel[]) {
    for (const c of this.cards) c.destroy();
    this.cards = [];

    for (const m of models) {
      const cv = new CardView(this.scene, m, 0, 0, {
        width: this.opts.cardW,
        height: this.opts.cardH,
      });

      cv.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (this.dragState) return;

        this.dragState = {
          card: cv,
          pointerId: pointer.id,
          offsetX: pointer.x - cv.x,
          offsetY: pointer.y - cv.y,
          startX: pointer.x,
          startY: pointer.y,
          moved: false,
        };

        cv.setDepth(5000);
        cv.scale = 1.04;
        cv.rotation = 0;
      });

      this.cards.push(cv);
    }

    this.layout();
  }

  public resize(screenW: number, screenH: number, bottomMarginOverride?: number) {
    this.availableW = screenW;
    this.baseX = screenW / 2;
    const margin = bottomMarginOverride ?? this.opts.bottomMargin;
    this.baseY = screenH - margin - this.opts.cardH / 2;
    this.layout();
  }

  public layout() {
    if (!this.cards.length) return;

    const n = this.cards.length;
    const maxW = Math.max(1, this.availableW * 0.94);
    const totalNatural = n * this.opts.cardW;
    const overlap = totalNatural > maxW ? (totalNatural - maxW) / Math.max(1, n - 1) : 0;
    const step = this.opts.cardW - overlap;
    const visibleStrip = Math.max(52, Math.floor(step + 12));

    const startX = this.baseX - (step * (n - 1)) / 2;

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (this.dragState?.card === card) continue;

      card.x = startX + i * step;
      card.y = this.baseY - (card.selected ? 18 : 0);
      card.rotation = 0;
      card.setDepth(100 + i);
      card.setVisibleHitArea(visibleStrip, i === this.cards.length - 1);
    }
  }

  public removeCard(card: CardView) {
    const idx = this.cards.indexOf(card);
    if (idx >= 0) {
      this.cards.splice(idx, 1);
      this.layout();
      this.scene.events.emit("hand-selection-changed");
    }
  }

  public contains(card: CardView) {
    return this.cards.includes(card);
  }

  public allCards() {
    return this.cards.slice();
  }

  public getSelectedCards() {
    return this.cards.filter((c) => c.selected);
  }

  public clearSelection() {
    for (const c of this.cards) c.setSelected(false);
    this.scene.events.emit("hand-selection-changed");
    this.layout();
  }
}
