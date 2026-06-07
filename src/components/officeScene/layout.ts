import type { OfficeLayout } from "./types";

export const CANVAS_HEIGHT = 500;
export const PIXEL_ALERT = "#e8755f";

export const officeLayouts: Record<"full" | "dock", OfficeLayout> = {
  full: {
    width: 840,
    title: "OPEN  CODE  NIGHT  SHIFT",
    footer: "CLICK A DESK",
    shellX: 38,
    windowXs: [88, 182, 276, 370, 464, 558, 652, 746],
    windowWidth: 72,
    noiseMarks: 34,
    desks: [
      { x: 200, y: 150, label: "frontend", accent: "#65b7ff", tone: "blue", worker: "tuxedo" },
      { x: 560, y: 150, label: "core", accent: "#55d69e", tone: "green", worker: "orange" },
      { x: 200, y: 350, label: "tests", accent: "#a7e56f", tone: "mint", worker: "calico" },
      { x: 560, y: 350, label: "review", accent: "#ffd166", tone: "amber", worker: "gray" },
    ],
  },
  dock: {
    width: 420,
    title: "OPEN  CODE  DOCK",
    footer: "WEB DOCK: DESKS STAY LIVE",
    shellX: 20,
    windowXs: [44, 126, 208, 290],
    windowWidth: 64,
    noiseMarks: 18,
    desks: [
      { x: 125, y: 148, label: "frontend", accent: "#65b7ff", tone: "blue", worker: "tuxedo" },
      { x: 295, y: 148, label: "core", accent: "#55d69e", tone: "green", worker: "orange" },
      { x: 125, y: 350, label: "tests", accent: "#a7e56f", tone: "mint", worker: "calico" },
      { x: 295, y: 350, label: "review", accent: "#ffd166", tone: "amber", worker: "gray" },
    ],
  },
};

export function officeLayout(isWebviewOpen: boolean): OfficeLayout {
  return isWebviewOpen ? officeLayouts.dock : officeLayouts.full;
}
