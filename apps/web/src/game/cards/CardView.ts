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

  private bg!: Phaser.GameObjects.Rectangle;
  private border!: Phaser.GameObjects.Rectangle;
  private textTL!: Phaser.GameObjects.Text;
  private textBR!: Phaser.GameObjects.Text;
  private centerSuit!: Phaser.GameObjects.Text;
  private backMark!: Phaser.GameObjects.Text;

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
    this.bg = this.scene.add.rectangle(0, 0, this.cardW, this.cardH, 0xffffff, 1).setOrigin(0.5);

    this.border = this.scene.add
      .rectangle(0, 0, this.cardW, this.cardH, 0x000000, 0)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x0a0a0a, 0.45);

    this.textTL = this.scene.add
      .text(-this.cardW / 2 + 8, -this.cardH / 2 + 6, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#111111",
      })
      .setOrigin(0, 0);

    this.textBR = this.scene.add
      .text(this.cardW / 2 - 8, this.cardH / 2 - 6, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#111111",
      })
      .setOrigin(1, 1);

    this.centerSuit = this.scene.add
      .text(0, 0, "", {
        fontFamily: "Arial",
        fontSize: "30px",
        color: "#111111",
      })
      .setOrigin(0.5);

    this.backMark = this.scene.add
      .text(0, 0, "★", {
        fontFamily: "Arial",
        fontSize: "34px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.add([this.bg, this.border, this.textTL, this.textBR, this.centerSuit, this.backMark]);
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
      this.border.setStrokeStyle(3, 0x1edc83, 0.95);
      this.scale = 1.02;
    } else {
      this.border.setStrokeStyle(2, 0x0a0a0a, 0.45);
      this.scale = 1;
    }

    if (this.model.faceUp) {
      const label = cardLabel(this.model);
      const red = isRedSuit(this.model.suit);

      this.bg.setFillStyle(0xffffff, 1);
      this.backMark.setVisible(false);

      this.textTL.setVisible(true).setText(label).setColor(red ? "#b00020" : "#111111");
      this.textBR.setVisible(true).setText(label).setColor(red ? "#b00020" : "#111111");
      this.centerSuit.setVisible(true).setText(this.model.suit).setColor(red ? "#b00020" : "#111111");
    } else {
      this.bg.setFillStyle(0x173f33, 1);
      this.backMark.setVisible(true);
      this.textTL.setVisible(false);
      this.textBR.setVisible(false);
      this.centerSuit.setVisible(false);
    }
  }
}
