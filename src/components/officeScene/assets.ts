import type { CatCoat, CatSpritePose, CatSpriteRegistry } from "./types";

const CAT_COATS: CatCoat[] = ["tuxedo", "orange", "calico", "gray"];
const SPRITE_POSES: CatSpritePose[] = ["idle", "work", "sleep"];

export function catSpriteKey(coat: CatCoat, pose: CatSpritePose): string {
  return `${coat}-${pose}`;
}

export function createCatSpriteRegistry(): CatSpriteRegistry {
  const registry: CatSpriteRegistry = {};
  for (const coat of CAT_COATS) {
    for (const pose of SPRITE_POSES) {
      const img = new Image();
      img.src = `/pets/sprites/${coat}-${pose}.png`;
      registry[catSpriteKey(coat, pose)] = img;
    }
  }
  return registry;
}
