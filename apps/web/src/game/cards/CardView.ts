import Phaser from "phaser";
import { cardLabel, isRedSuit } from "./CardTypes";
import type { CardModel } from "./CardTypes";

export type CardViewOptions = {
  width: number;
  height: number;
};

export class CardView extends Phaser.GameObjects.Container {
  public model: CardModel;

  private cardW: number;
  private cardH: number;

  private shadow!: Phaser.GameObjects.Rectangle;
  private bg!: Phaser.GameObjects.Rectangle;
  private border!: Phaser.GameObjects.Rectangle;
  private innerBorder!: Phaser.GameObjects.Rectangle;
  private topAccent!: Phaser.GameObjects.Rectangle;
  private textTL!: Phaser.GameObjects.Text;
  private textBR!: Phaser.GameObjects.Text;
  private centerRank!: Phaser.GameObjects.Text;
  private centerSuit!: Phaser.GameObjects.Text;
  private backMark!: Phaser.GameObjects.Text;
  private backPattern!: Phaser.GameObjects.Text;

  private _selected = false;

  constructor(scene: Phaser.Scene, model: CardModel, x: number, y: number, opts: CardViewOptions) {
    super(scene, x, y);

    this.model = model;
    this.cardW = opts.width;
    this.cardH = opts.height;

    this.createVisual();
    this.refresh();

    scene.add.existing(this);

    this.setSize(this.cardW, this.cardH);
    this.setInteractive(
      new Phaser.Geom.Rectangle(
        -this.cardW * 0.1,
        -this.cardH / 2,
        this.cardW * 0.6,
        this.cardH
      ),
      Phaser.Geom.Rectangle.Contains
    );
  }

  private createVisual() {
    this.shadow = this.scene.add
      .rectangle(4, 6, this.cardW, this.cardH, 0x03160f, 0.24)
      .setOrigin(0.5);

    this.bg = this.scene.add.rectangle(0, 0, this.cardW, this.cardH, 0xffffff, 1).setOrigin(0.5);
    this.bg.setStrokeStyle?.(0, 0x000000, 0);

    this.border = this.scene.add
      .rectangle(0, 0, this.cardW, this.cardH, 0x000000, 0)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x0a0a0a, 0.55);

    this.innerBorder = this.scene.add
      .rectangle(0, 0, this.cardW - 8, this.cardH - 8, 0x000000, 0)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0xffffff, 0.28);

    this.topAccent = this.scene.add
      .rectangle(0, -this.cardH / 2 + 7, this.cardW - 10, 8, 0x7adfa8, 0.28)
      .setOrigin(0.5);

    this.textTL = this.scene.add
      .text(-this.cardW / 2 + 8, -this.cardH / 2 + 6, "", {
        fontFamily: "Arial",
        fontSize: `${Math.max(14, Math.floor(this.cardW * 0.22))}px`,
        fontStyle: "bold",
        color: "#111111",
      })
      .setOrigin(0, 0);

    this.textBR = this.scene.add
      .text(this.cardW / 2 - 8, this.cardH / 2 - 6, "", {
        fontFamily: "Arial",
        fontSize: `${Math.max(14, Math.floor(this.cardW * 0.22))}px`,
        fontStyle: "bold",
        color: "#111111",
      })
      .setOrigin(1, 1);

    this.centerRank = this.scene.add
      .text(0, -this.cardH * 0.08, "", {
        fontFamily: "Arial",
        fontSize: `${Math.max(22, Math.floor(this.cardW * 0.44))}px`,
        fontStyle: "bold",
        color: "#111111",
      })
      .setOrigin(0.5);

    this.centerSuit = this.scene.add
      .text(0, this.cardH * 0.18, "", {
        fontFamily: "Arial",
        fontSize: `${Math.max(28, Math.floor(this.cardW * 0.38))}px`,
        color: "#111111",
      })
      .setOrigin(0.5);

    this.backMark = this.scene.add
      .text(0, -8, "D", {
        fontFamily: "Arial",
        fontSize: `${Math.max(28, Math.floor(this.cardW * 0.42))}px`,
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.backPattern = this.scene.add
      .text(0, this.cardH * 0.18, "✦ ✦ ✦", {
        fontFamily: "Arial",
        fontSize: `${Math.max(12, Math.floor(this.cardW * 0.16))}px`,
        color: "#d9fff0",
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    this.add([
      this.shadow,
      this.bg,
      this.topAccent,
      this.border,
      this.innerBorder,
      this.textTL,
      this.textBR,
      this.centerRank,
      this.centerSuit,
      this.backMark,
      this.backPattern,
    ]);
  }

  /**
   * Устанавливает интерактивную зону по видимой части карты.
   * Для перекрывающихся карт — правая 60%; для последней — вся карта.
   */
  public setVisibleHitArea(_exposedWidth: number, isLast: boolean) {
    if (isLast) {
      this.setInteractive(
        new Phaser.Geom.Rectangle(-this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH),
        Phaser.Geom.Rectangle.Contains
      );
      return;
    }

    this.setInteractive(
      new Phaser.Geom.Rectangle(
        -this.cardW * 0.1,
        -this.cardH / 2,
        this.cardW * 0.6,
        this.cardH
      ),
      Phaser.Geom.Rectangle.Contains
    );
  }

  public setSelected(v: boolean) {
    this._selected = v;
    this.refresh();
  }

  public toggleSelected() {
    this._selected = !this._selected;
    this.refresh();
  }

  public get selected() {
    return this._selected;
  }

  public refresh() {
    if (this._selected) {
      this.border.setStrokeStyle(3, 0x70ffd0, 0.95);
      this.innerBorder.setStrokeStyle(2, 0xb8ffdf, 0.8);
      this.topAccent.setFillStyle(0x7affc3, 0.7);
      this.shadow.setFillStyle(0x03160f, 0.34);
      this.scale = 1.035;
    } else {
      this.border.setStrokeStyle(2, 0x0a0a0a, 0.55);
      this.innerBorder.setStrokeStyle(1, 0xffffff, 0.28);
      this.topAccent.setFillStyle(0x7adfa8, 0.28);
      this.shadow.setFillStyle(0x03160f, 0.24);
      this.scale = 1;
    }

    if (this.model.faceUp) {
      const label = cardLabel(this.model);
      const red = isRedSuit(this.model.suit);
      const textColor = red ? "#b00020" : "#111111";

      this.bg.setFillStyle(red ? 0xfffbfb : 0xffffff, 1);
      this.backMark.setVisible(false);
      this.backPattern.setVisible(false);

      this.textTL.setVisible(true).setText(label).setColor(textColor);
      this.textBR.setVisible(true).setText(label).setColor(textColor);
      this.centerRank.setVisible(true).setText(this.model.rank).setColor(textColor);
      this.centerSuit.setVisible(true).setText(this.model.suit).setColor(textColor);
    } else {
      this.bg.setFillStyle(0x184638, 1);
      this.backMark.setVisible(true);
      this.backPattern.setVisible(true);
      this.textTL.setVisible(false);
      this.textBR.setVisible(false);
      this.centerRank.setVisible(false);
      this.centerSuit.setVisible(false);
    }
  }
}
