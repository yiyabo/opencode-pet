import type {
  OpenCodeActivityItem,
  OpenCodeAttentionItem,
  OpenCodeSessionLink,
  OpenCodeWorkspaceState,
  TodoItem,
} from "../../types";

export interface HitBox {
  id: string;
  kind: "cat" | "session";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export type CatCoat = "tuxedo" | "orange" | "calico" | "gray";
export type CatSpritePose = "idle" | "work" | "sleep";
export type CatSpriteRegistry = Record<string, HTMLImageElement>;

export interface Desk {
  x: number;
  y: number;
  label: string;
  accent: string;
  tone: "blue" | "green" | "amber" | "mint";
  worker: CatCoat;
  status?: "linked" | "drift" | "local" | "server" | "empty";
  activityStatus?: OpenCodeActivityItem["status"] | "linked" | "empty";
  phase?: string;
  sessionId?: string;
  detail?: string;
  summary?: string;
  statusReason?: string;
  lastSignal?: string;
  source?: string;
  toolName?: string;
  model?: string;
  messageCount?: number;
  eventType?: string;
  eventSeverity?: string;
  lastRole?: string;
  lastUserMessage?: string;
  lastAssistantMessage?: string;
  awaitingUser?: boolean;
  idleMs?: number;
  totalTools?: number;
  completedTools?: number;
  actionKind?: OpenCodeAttentionItem["action_kind"];
  actionLabel?: string;
  active?: boolean;
  focused?: boolean;
  hovered?: boolean;
}

export interface OfficeLayout {
  width: number;
  title: string;
  footer: string;
  shellX: number;
  windowXs: number[];
  windowWidth: number;
  noiseMarks: number;
  desks: Desk[];
}

export interface OfficeStageRenderState {
  sessionLinks: OpenCodeSessionLink[];
  activityItems: OpenCodeActivityItem[];
  attentionItems: OpenCodeAttentionItem[];
  workspaceState: OpenCodeWorkspaceState | null;
  focusedSessionId: string | null;
  frame: number;
  hoverHit: HitBox | null;
  sessionTodos: Record<string, TodoItem[]>;
  isWebviewOpen: boolean;
}
