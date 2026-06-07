export function pixel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

export function strokeRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(width), Math.round(height));
}

export function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
  ctx.stroke();
}

export function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  color: string,
  size = 8,
) {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono", Menlo, Monaco, monospace`;
  ctx.textBaseline = "top";
  ctx.fillText(value, Math.round(x), Math.round(y));
}

export function withAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void) {
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  draw();
  ctx.globalAlpha = previous;
}

export function shadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha = 0.28,
) {
  withAlpha(ctx, alpha, () => pixel(ctx, x, y, width, height, "#000000"));
}
