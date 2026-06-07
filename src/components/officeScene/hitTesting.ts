import type { HitBox } from "./types";

export function findHitBoxAt(hitBoxes: HitBox[], x: number, y: number): HitBox | undefined {
  return hitBoxes.find(
    (box) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height,
  );
}
