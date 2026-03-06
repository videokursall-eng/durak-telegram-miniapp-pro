import Phaser from "phaser";

export type HandCardPlacement = {
  x: number;
  y: number;
  rotation: number;
  exposedWidth: number;
};

export function computeHandFanLayout(params: {
  count: number;
  centerX: number;
  baseY: number;
  cardW: number;
  cardH: number;
  availableW: number;
}): HandCardPlacement[] {
  const { count, centerX, baseY, cardW, cardH, availableW } = params;
  if (count <= 0) return [];

  const maxUsableW = Math.max(cardW, availableW * 0.92);
  const naturalW = count * cardW;

  const overlap = naturalW > maxUsableW
    ? (naturalW - maxUsableW) / Math.max(1, count - 1)
    : 0;

  const step = cardW - overlap;

  // Чем больше карт, тем меньше угол веера
  const maxAngle = count <= 4 ? 14 : count <= 6 ? 11 : 8;
  const lift = Math.min(24, Math.max(12, cardH * 0.12));
  const radiusY = Math.max(28, Math.floor(cardH * 0.32));

  const startX = centerX - (step * (count - 1)) / 2;
  const mid = (count - 1) / 2;

  const placements: HandCardPlacement[] = [];

  for (let i = 0; i < count; i++) {
    const t = i - mid; // -mid ... +mid
    const norm = mid === 0 ? 0 : t / mid; // -1 ... +1

    const x = startX + i * step;

    // Небольшая дуга: центральные карты выше, крайние чуть ниже
    const y = baseY - (1 - Math.cos(norm * Math.PI / 2)) * radiusY + lift;

    // Поворот дугой
    const rotation = Phaser.Math.DegToRad(norm * maxAngle);

    placements.push({
      x,
      y,
      rotation,
      exposedWidth: Math.max(44, Math.floor(step + 10)),
    });
  }

  return placements;
}
