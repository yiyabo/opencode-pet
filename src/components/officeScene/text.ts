export function compactDeskLabel(value: string): string {
  const clean = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "session";
  const words = clean.split(" ").filter(Boolean);
  const label = words.length > 1 ? words.slice(0, 2).join(" ") : clean;
  return label.length > 12 ? `${label.slice(0, 11)}.` : label;
}

function charVisualWidth(code: number): number {
  return code > 0x2e7f ? 2 : 1;
}

function textVisualWidth(value: string): number {
  let width = 0;
  for (let index = 0; index < value.length; index += 1) {
    width += charVisualWidth(value.charCodeAt(index));
  }
  return width;
}

export function compactCanvasText(value: string | undefined, maxLength: number): string {
  if (!value) return "";
  const clean = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (textVisualWidth(clean) <= maxLength) return clean;

  const budget = Math.max(1, maxLength - 1);
  let used = 0;
  let out = "";
  for (let index = 0; index < clean.length; index += 1) {
    const charWidth = charVisualWidth(clean.charCodeAt(index));
    if (used + charWidth > budget) break;
    used += charWidth;
    out += clean[index];
  }
  return `${out}.`;
}

export function shortSessionId(id: string): string {
  return id.length > 9 ? `${id.slice(0, 5)}..${id.slice(-2)}` : id;
}
