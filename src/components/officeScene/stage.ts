import { CANVAS_HEIGHT, officeLayout } from "./layout";
import { renderOfficeScene } from "./renderer";
import type {
  CanvasTransform,
  CatSpriteRegistry,
  HitBox,
  OfficeStageRenderState,
} from "./types";

export class OfficeStage {
  private readonly ctx: CanvasRenderingContext2D;

  private sprites: CatSpriteRegistry = {};

  private transform: CanvasTransform = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  setSprites(sprites: CatSpriteRegistry) {
    this.sprites = sprites;
  }

  resize(canvas: HTMLCanvasElement, isWebviewOpen: boolean): CanvasTransform {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const targetWidth = Math.round(rect.width * dpr);
    const targetHeight = Math.round(rect.height * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const sceneWidth = officeLayout(isWebviewOpen).width;
    const scaleX = targetWidth / sceneWidth;
    const scaleY = targetHeight / CANVAS_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (targetWidth - sceneWidth * scale) / 2;
    const offsetY = (targetHeight - CANVAS_HEIGHT * scale) / 2;

    this.transform = { scale, offsetX, offsetY };
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.translate(offsetX, offsetY);
    this.ctx.scale(scale, scale);

    return this.transform;
  }

  pointFromEvent(event: PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const pixelX = (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
    const pixelY = (event.clientY - rect.top) * (canvas.height / Math.max(1, rect.height));
    return {
      x: (pixelX - this.transform.offsetX) / Math.max(0.01, this.transform.scale),
      y: (pixelY - this.transform.offsetY) / Math.max(0.01, this.transform.scale),
    };
  }

  render(state: OfficeStageRenderState): HitBox[] {
    return renderOfficeScene({
      ...state,
      ctx: this.ctx,
      sprites: this.sprites,
    });
  }
}
