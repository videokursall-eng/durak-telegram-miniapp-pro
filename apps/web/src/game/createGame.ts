import Phaser from "phaser";
import { TableScene } from "./scenes/TableScene";

function getTelegramViewportHeightPx() {
  const w = window as any;
  const tg = w?.Telegram?.WebApp;
  return (tg?.viewportStableHeight ?? tg?.viewportHeight) as number | undefined;
}

export function createGame(parent: HTMLElement) {
  const rect = parent.getBoundingClientRect();
  const tgH = getTelegramViewportHeightPx();

  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(tgH ?? rect.height));

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#0b3d2e",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width,
      height,
    },
    scene: [TableScene],
    fps: { target: 60, forceSetTimeOut: true },
    render: { antialias: true },
  };

  const game = new Phaser.Game(config);

  const onResize = () => {
    const r = parent.getBoundingClientRect();
    const tgH2 = getTelegramViewportHeightPx();
    const w2 = Math.max(1, Math.floor(r.width));
    const h2 = Math.max(1, Math.floor(tgH2 ?? r.height));
    game.scale.resize(w2, h2);
  };

  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  setTimeout(onResize, 250);
  setTimeout(onResize, 800);

  const origDestroy = game.destroy.bind(game);
  game.destroy = (removeCanvas?: boolean) => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
    return origDestroy(!!removeCanvas);
  };

  return game;
}
