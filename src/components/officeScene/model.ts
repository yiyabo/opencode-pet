import type {
  OpenCodeActivityItem,
  OpenCodeAttentionItem,
  OpenCodeSessionLink,
  PetConfig,
  TodoItem,
} from "../../types";
import { activityHeadline } from "../../opencodeDigest";
import { PIXEL_ALERT } from "./layout";
import { compactDeskLabel, shortSessionId } from "./text";
import type { Desk } from "./types";

const CAT_COATS = ["tuxedo", "orange", "calico", "gray"] as const;

function deskStatus(link?: OpenCodeSessionLink): Desk["status"] {
  if (!link) return "empty";
  if (link.status === "linked" || link.status === "title-diff") return "linked";
  if (link.status === "directory-diff") return "drift";
  if (link.status === "server-only") return "server";
  if (link.status === "local-only") return "local";
  return "drift";
}

function deskStatusFromActivity(item?: OpenCodeActivityItem): Desk["status"] {
  if (!item) return "empty";
  if (
    item.status === "working"
    || item.status === "completed"
    || item.status === "ready"
    || item.status === "followed"
    || item.status === "quiet"
  ) return "linked";
  if (item.status === "server-only") return "server";
  if (item.status === "local-only" || item.status === "error") return "local";
  if (item.status === "drift") return "drift";
  return "drift";
}

function linkTitle(link: OpenCodeSessionLink): string {
  return link.local?.title || link.server?.title || link.id;
}

function deskAccent(status: Desk["status"], active: boolean, fallback: string): string {
  if (active) return "#d8fff4";
  switch (status) {
    case "linked":
      return "#55d69e";
    case "drift":
      return "#ffd166";
    case "local":
      return PIXEL_ALERT;
    case "server":
      return "#8ecaff";
    default:
      return fallback;
  }
}

function deskActionLabel(actionKind?: OpenCodeAttentionItem["action_kind"]): string {
  switch (actionKind) {
    case "fix":
      return "FIX";
    case "continue":
      return "GO";
    case "retry-dispatch":
      return "TX";
    case "attach":
      return "TUI";
    case "web":
      return "WEB";
    case "focus":
      return "SYNC";
    case "review":
      return "OK";
    default:
      return "";
  }
}

function attentionForSession(
  sessionId: string,
  attentionItems: OpenCodeAttentionItem[] = [],
): OpenCodeAttentionItem | undefined {
  return attentionItems.find((item) => item.session_id === sessionId);
}

export function orderedSessionLinks(sessionLinks: OpenCodeSessionLink[] = []): OpenCodeSessionLink[] {
  const orderedLinks = [
    ...sessionLinks.filter((link) => link.is_bound || link.is_current),
    ...sessionLinks.filter((link) => !link.is_bound && !link.is_current),
  ];
  return orderedLinks.filter(
    (link, index, items) => items.findIndex((item) => item.id === link.id) === index,
  );
}

export function orderedActivityItems(activityItems: OpenCodeActivityItem[] = []): OpenCodeActivityItem[] {
  const orderedItems = [
    ...activityItems.filter((item) => item.is_bound || item.is_current),
    ...activityItems.filter((item) => !item.is_bound && !item.is_current),
  ];
  return orderedItems.filter(
    (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index,
  );
}

export function visibleSessionCount(
  activityItems: OpenCodeActivityItem[] = [],
  sessionLinks: OpenCodeSessionLink[] = [],
  pets: PetConfig[] = [],
): number {
  if (pets.length > 0) return pets.length;
  return activityItems.length > 0 ? orderedActivityItems(activityItems).length : orderedSessionLinks(sessionLinks).length;
}

function petCoat(pet: PetConfig, index: number): Desk["worker"] {
  if (pet.coat && CAT_COATS.includes(pet.coat as typeof CAT_COATS[number])) {
    return pet.coat as Desk["worker"];
  }
  return CAT_COATS[index % CAT_COATS.length];
}

export function petDesks(
  baseDesks: Desk[],
  pets: PetConfig[] = [],
  activityItems: OpenCodeActivityItem[] = [],
  sessionLinks: OpenCodeSessionLink[] = [],
  focusedSessionId?: string | null,
  attentionItems: OpenCodeAttentionItem[] = [],
  sessionTodos: Record<string, TodoItem[]> = {},
): Desk[] {
  if (pets.length === 0) {
    return activityDesks(baseDesks, activityItems, sessionLinks, focusedSessionId, attentionItems, sessionTodos);
  }

  const activityById = new Map(activityItems.map((item) => [item.id, item]));
  const linkById = new Map(sessionLinks.map((link) => [link.id, link]));

  return baseDesks.map((desk, index) => {
    const pet = pets[index];
    if (!pet) return { ...desk, status: "empty" };

    const worker = petCoat(pet, index);
    const boundSessionId = pet.bound_session_id;
    const petLabel = compactDeskLabel(pet.name);
    if (!boundSessionId) {
      return {
        ...desk,
        label: petLabel,
        worker,
        petId: pet.id,
        petName: pet.name,
        status: "empty",
        activityStatus: "empty",
        active: false,
        focused: false,
      };
    }

    const item = activityById.get(boundSessionId);
    const link = linkById.get(boundSessionId);
    const status = item ? deskStatusFromActivity(item) : deskStatus(link);
    const focused = boundSessionId === focusedSessionId;
    const attention = attentionForSession(boundSessionId, attentionItems);
    const todos = sessionTodos[boundSessionId] ?? [];
    const headline = item ? activityHeadline(item, todos) || item.title : link ? linkTitle(link) : boundSessionId;

    return {
      ...desk,
      label: petLabel,
      accent: deskAccent(status, true, desk.accent),
      worker,
      status,
      activityStatus: item?.status ?? "linked",
      phase: item?.phase,
      bubbleHeadline: headline,
      sessionId: boundSessionId,
      petId: pet.id,
      petName: pet.name,
      detail: shortSessionId(boundSessionId),
      summary: item?.last_message ?? link?.local?.directory ?? link?.server?.directory,
      statusReason: item?.status_reason,
      lastSignal: item?.last_signal,
      source: item?.source ?? link?.status,
      toolName: item?.tool_name,
      model: item?.model ?? link?.server?.model_id,
      messageCount: item?.message_count ?? link?.local?.message_count ?? link?.server?.message_count,
      eventType: item?.last_event?.event_type,
      eventSeverity: item?.last_event?.severity,
      lastRole: item?.last_role,
      lastUserMessage: item?.last_user_message,
      lastAssistantMessage: item?.last_assistant_message,
      awaitingUser: item?.awaiting_user,
      idleMs: item?.idle_ms,
      totalTools: item?.total_tools,
      completedTools: item?.completed_tools,
      actionKind: attention?.action_kind,
      actionLabel: deskActionLabel(attention?.action_kind),
      active: true,
      focused,
    };
  });
}

function sessionDesks(
  baseDesks: Desk[],
  sessionLinks: OpenCodeSessionLink[] = [],
  focusedSessionId?: string | null,
  attentionItems: OpenCodeAttentionItem[] = [],
): Desk[] {
  const uniqueLinks = orderedSessionLinks(sessionLinks);

  return baseDesks.map((desk, index) => {
    const link = uniqueLinks[index];
    if (!link) return { ...desk, status: "empty" };

    const status = deskStatus(link);
    const active = link.is_bound || link.is_current;
    const focused = link.id === focusedSessionId;
    const attention = attentionForSession(link.id, attentionItems);
    return {
      ...desk,
      label: compactDeskLabel(linkTitle(link)),
      accent: deskAccent(status, active || focused, desk.accent),
      status,
      activityStatus: "linked",
      sessionId: link.id,
      detail: shortSessionId(link.id),
      summary: link.local?.directory || link.server?.directory,
      source: link.status,
      messageCount: link.local?.message_count ?? link.server?.message_count,
      model: link.server?.model_id,
      actionKind: attention?.action_kind,
      actionLabel: deskActionLabel(attention?.action_kind),
      active,
      focused,
    };
  });
}

export function activityDesks(
  baseDesks: Desk[],
  activityItems: OpenCodeActivityItem[] = [],
  fallbackLinks: OpenCodeSessionLink[] = [],
  focusedSessionId?: string | null,
  attentionItems: OpenCodeAttentionItem[] = [],
  sessionTodos: Record<string, TodoItem[]> = {},
): Desk[] {
  if (activityItems.length === 0) return sessionDesks(baseDesks, fallbackLinks, focusedSessionId, attentionItems);
  const uniqueItems = orderedActivityItems(activityItems);

  return baseDesks.map((desk, index) => {
    const item = uniqueItems[index];
    if (!item) return { ...desk, status: "empty" };

    const status = deskStatusFromActivity(item);
    const active = item.is_bound || item.is_current || item.status === "working";
    const focused = item.id === focusedSessionId;
    const attention = attentionForSession(item.id, attentionItems);
    return {
      ...desk,
      label: compactDeskLabel(item.title),
      accent: deskAccent(status, active || focused, desk.accent),
      status,
      activityStatus: item.status,
      phase: item.phase,
      bubbleHeadline: activityHeadline(item, sessionTodos[item.id] ?? []),
      sessionId: item.id,
      detail: `${shortSessionId(item.id)} ${item.status === "working" ? "run" : item.source}`,
      summary: item.last_message,
      statusReason: item.status_reason,
      lastSignal: item.last_signal,
      source: item.source,
      toolName: item.tool_name,
      model: item.model,
      messageCount: item.message_count,
      eventType: item.last_event?.event_type,
      eventSeverity: item.last_event?.severity,
      lastRole: item.last_role,
      lastUserMessage: item.last_user_message,
      lastAssistantMessage: item.last_assistant_message,
      awaitingUser: item.awaiting_user,
      idleMs: item.idle_ms,
      totalTools: item.total_tools,
      completedTools: item.completed_tools,
      actionKind: attention?.action_kind,
      actionLabel: deskActionLabel(attention?.action_kind),
      active,
      focused,
    };
  });
}
