import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create() {
    const { width, height } = this.scale;

    const title = this.add
      .text(width / 2, height / 2, "Durak: Phaser inside React ✅", {
        fontFamily: "Arial",
        fontSize: "24px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    const info = this.add
      .text(width / 2, height / 2 + 40, `${Math.floor(width)}×${Math.floor(height)}`, {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#d0ffd0",
      })
      .setOrigin(0.5);

    this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
      const w = gameSize.width;
      const h = gameSize.height;
      title.setPosition(w / 2, h / 2);
      info.setPosition(w / 2, h / 2 + 40).setText(`${Math.floor(w)}×${Math.floor(h)}`);
    });

    this.input.mouse?.disableContextMenu();
  }
}