import { useEffect, useRef } from "react";
import type {
  OpenCodeActivityItem,
  OpenCodeAttentionItem,
  OpenCodeEvent,
  OpenCodeSessionLink,
  OpenCodeWorkspaceState,
  PetConfig,
  TodoItem,
} from "../types";
import { createCatSpriteRegistry } from "./officeScene/assets";
import { findHitBoxAt } from "./officeScene/hitTesting";
import { OfficeStage } from "./officeScene/stage";
import type { CatSpriteRegistry, HitBox } from "./officeScene/types";

interface SceneCat {
  id: string;
  name: string;
  provider: string;
  status: string;
  accent: string;
  face: string;
}

interface CatOfficeSceneProps {
  cats: SceneCat[];
  pets?: PetConfig[];
  sessionLinks?: OpenCodeSessionLink[];
  activityItems?: OpenCodeActivityItem[];
  attentionItems?: OpenCodeAttentionItem[];
  workspaceState?: OpenCodeWorkspaceState | null;
  dispatchSignal?: SceneDispatchSignal | null;
  latestEvent?: OpenCodeEvent | null;
  eventHistory?: OpenCodeEvent[];
  focusedSessionId?: string | null;
  sessionTodos?: Record<string, TodoItem[]>;
  isWebviewOpen?: boolean;
  rightInset?: number;
  onSelectCat: (id: string) => void;
  onSelectSession?: (id: string) => void;
  onRunSessionAction?: (id: string) => void;
  onRunOpsAction?: (action: OpsActionKind) => void;
}

type OpsActionKind = "open" | "start" | "align" | "match" | "dispatch" | string;
const OFFICE_SCENE_FPS = 24;
const OFFICE_DOCKED_SCENE_FPS = 12;

interface SceneDispatchSignal {
  state: "pending" | "success" | "warning" | "error";
  targetSessionId?: string;
  dispatchContext?: string;
  dispatchLabel?: string;
  routeCode?: string;
  observation?: "idle" | "watching" | "observed" | "quiet";
  observedEvents?: number;
  observedMessages?: number;
}

export function CatOfficeScene({
  cats,
  pets = [],
  sessionLinks = [],
  activityItems = [],
  attentionItems = [],
  workspaceState = null,
  dispatchSignal = null,
  latestEvent = null,
  eventHistory = [],
  focusedSessionId = null,
  sessionTodos = {},
  isWebviewOpen = false,
  rightInset = 0,
  onSelectCat,
  onSelectSession,
  onRunSessionAction,
  onRunOpsAction,
}: CatOfficeSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onSelectRef = useRef(onSelectCat);
  const onSelectSessionRef = useRef(onSelectSession);
  const onRunSessionActionRef = useRef(onRunSessionAction);
  const onRunOpsActionRef = useRef(onRunOpsAction);
  const catsRef = useRef(cats);
  const petsRef = useRef(pets);
  const sessionLinksRef = useRef(sessionLinks);
  const activityItemsRef = useRef(activityItems);
  const attentionItemsRef = useRef(attentionItems);
  const workspaceStateRef = useRef<OpenCodeWorkspaceState | null>(workspaceState);
  const dispatchSignalRef = useRef<SceneDispatchSignal | null>(dispatchSignal);
  const latestEventRef = useRef<OpenCodeEvent | null>(latestEvent);
  const eventHistoryRef = useRef<OpenCodeEvent[]>(eventHistory);
  const focusedSessionRef = useRef<string | null>(focusedSessionId);
  const sessionTodosRef = useRef<Record<string, TodoItem[]>>(sessionTodos);
  const isWebviewOpenRef = useRef(isWebviewOpen);
  const hitBoxesRef = useRef<HitBox[]>([]);
  const hoverHitRef = useRef<HitBox | null>(null);
  const spritesRef = useRef<CatSpriteRegistry>({});
  const stageRef = useRef<OfficeStage | null>(null);

  useEffect(() => {
    spritesRef.current = createCatSpriteRegistry();
    stageRef.current?.setSprites(spritesRef.current);
  }, []);

  useEffect(() => {
    onSelectRef.current = onSelectCat;
    onSelectSessionRef.current = onSelectSession;
    onRunSessionActionRef.current = onRunSessionAction;
    onRunOpsActionRef.current = onRunOpsAction;
  }, [onSelectCat, onSelectSession, onRunSessionAction, onRunOpsAction]);

  useEffect(() => {
    catsRef.current = cats;
    petsRef.current = pets;
    sessionLinksRef.current = sessionLinks;
    activityItemsRef.current = activityItems;
    attentionItemsRef.current = attentionItems;
    workspaceStateRef.current = workspaceState;
    dispatchSignalRef.current = dispatchSignal;
    latestEventRef.current = latestEvent;
    eventHistoryRef.current = eventHistory;
    focusedSessionRef.current = focusedSessionId;
    sessionTodosRef.current = sessionTodos;
    isWebviewOpenRef.current = isWebviewOpen;
  }, [cats, pets, sessionLinks, activityItems, attentionItems, workspaceState, dispatchSignal, latestEvent, eventHistory, focusedSessionId, sessionTodos, isWebviewOpen]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    stage.resize(canvas, isWebviewOpen);
  }, [isWebviewOpen, rightInset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const stage = new OfficeStage(ctx);
    stage.setSprites(spritesRef.current);
    stageRef.current = stage;

    let frame = 0;
    let animationId = 0;
    let lastRenderAt = 0;

    const resizeCanvas = () => {
      stage.resize(canvas, isWebviewOpenRef.current);
    };

    resizeCanvas();

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);

    const render = (timestamp: number) => {
      const targetFps = isWebviewOpenRef.current ? OFFICE_DOCKED_SCENE_FPS : OFFICE_SCENE_FPS;
      const minFrameMs = 1000 / targetFps;
      if (document.hidden) {
        animationId = window.requestAnimationFrame(render);
        return;
      }
      if (lastRenderAt > 0 && timestamp - lastRenderAt < minFrameMs) {
        animationId = window.requestAnimationFrame(render);
        return;
      }
      lastRenderAt = timestamp;
      frame += 1;
      hitBoxesRef.current = stage.render({
        sessionLinks: sessionLinksRef.current,
        pets: petsRef.current,
        activityItems: activityItemsRef.current,
        attentionItems: attentionItemsRef.current,
        workspaceState: workspaceStateRef.current,
        focusedSessionId: focusedSessionRef.current,
        frame,
        hoverHit: hoverHitRef.current,
        sessionTodos: sessionTodosRef.current,
        isWebviewOpen: isWebviewOpenRef.current,
      });
      animationId = window.requestAnimationFrame(render);
    };

    const canvasPointFromEvent = (event: PointerEvent) => stage.pointFromEvent(event, canvas);

    const onPointerMove = (event: PointerEvent) => {
      const point = canvasPointFromEvent(event);
      const hit = findHitBoxAt(hitBoxesRef.current, point.x, point.y);
      hoverHitRef.current = hit ?? null;
      canvas.style.cursor = hit ? "pointer" : "default";
    };

    const onPointerLeave = () => {
      hoverHitRef.current = null;
      canvas.style.cursor = "default";
    };

    const onPointerDown = (event: PointerEvent) => {
      const point = canvasPointFromEvent(event);
      const hit = findHitBoxAt(hitBoxesRef.current, point.x, point.y);
      if (hit?.kind === "session") {
        onSelectSessionRef.current?.(hit.id);
        return;
      }
      if (hit?.kind === "cat") onSelectRef.current(hit.id);
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointerdown", onPointerDown);
    animationId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animationId);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      if (stageRef.current === stage) stageRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute left-0 top-0 h-full bg-[#050b0e]"
      data-office-scene="pixel-office"
      style={{
        width: `calc(100% - ${rightInset}px)`,
        transition: "width 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    />
  );
}
