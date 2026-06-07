import type {
  CatSessionDigest,
  OpenCodeActivityItem,
  OpenCodeEvent,
  OpenCodeSessionLink,
  OpenCodeWorkspaceState,
  SessionChoice,
  TodoItem,
} from "./types";

function compactText(value: string | undefined, fallback: string, maxChars: number) {
  const text = (value ?? "").split(/\s+/).filter(Boolean).join(" ").trim() || fallback;
  const chars = Array.from(text);
  return chars.length > maxChars ? `${chars.slice(0, maxChars - 1).join("")}...` : text;
}

function todoProgress(todos: TodoItem[] = []) {
  const completed = todos.filter((todo) => todo.status === "completed").length;
  const active =
    todos.find((todo) => todo.status === "in_progress")
    ?? todos.find((todo) => todo.status === "pending");

  return {
    completed,
    total: todos.length,
    active: active?.content,
  };
}

function statusLabel(status: string) {
  switch (status) {
    case "working":
      return "working";
    case "completed":
    case "followed":
      return "completed";
    case "error":
      return "error";
    case "quiet":
      return "quiet";
    case "drift":
      return "sync drift";
    case "local-only":
      return "local only";
    case "server-only":
      return "server only";
    case "ready":
      return "ready";
    default:
      return status || "idle";
  }
}

function choiceFromLink(
  link: OpenCodeSessionLink,
  activity: OpenCodeActivityItem | undefined,
  sessionTodos: Record<string, TodoItem[]>,
): SessionChoice {
  const todos = todoProgress(sessionTodos[link.id]);
  const title = activity?.title ?? link.local?.title ?? link.server?.title ?? link.id;
  const status = activity?.status ?? link.status;
  return {
    id: link.id,
    title,
    directory: activity?.directory ?? link.local?.directory ?? link.server?.directory,
    status,
    phase: activity?.phase ?? statusLabel(status),
    summary: compactText(activity?.last_message ?? activity?.status_reason ?? link.local?.directory ?? link.server?.directory, "No recent activity", 120),
    last_signal: activity?.last_signal ?? statusLabel(status).toUpperCase(),
    is_bound: activity?.is_bound ?? link.is_bound,
    is_current: activity?.is_current ?? link.is_current,
    is_bindable: Boolean(link.local) || Boolean(activity && activity.source !== "server" && activity.status !== "server-only"),
    todo_completed: todos.completed,
    todo_total: todos.total,
    active_todo: todos.active,
    updated_at: activity?.updated_at ?? link.updated_at ?? link.local?.updated_at ?? link.server?.updated_at,
  };
}

function choiceFromActivity(
  activity: OpenCodeActivityItem,
  sessionTodos: Record<string, TodoItem[]>,
): SessionChoice {
  const todos = todoProgress(sessionTodos[activity.id]);
  return {
    id: activity.id,
    title: activity.title,
    directory: activity.directory,
    status: activity.status,
    phase: activity.phase,
    summary: compactText(activity.last_message || activity.status_reason, "No recent activity", 120),
    last_signal: activity.last_signal,
    is_bound: activity.is_bound,
    is_current: activity.is_current,
    is_bindable: activity.source !== "server" && activity.status !== "server-only",
    todo_completed: todos.completed,
    todo_total: todos.total,
    active_todo: todos.active,
    updated_at: activity.updated_at,
  };
}

export function buildSessionChoices(
  sessionLinks: OpenCodeSessionLink[] = [],
  activityItems: OpenCodeActivityItem[] = [],
  sessionTodos: Record<string, TodoItem[]> = {},
): SessionChoice[] {
  const activityById = new Map(activityItems.map((activity) => [activity.id, activity]));
  const choices = new Map<string, SessionChoice>();

  for (const activity of activityItems) {
    choices.set(activity.id, choiceFromActivity(activity, sessionTodos));
  }

  for (const link of sessionLinks) {
    choices.set(link.id, choiceFromLink(link, activityById.get(link.id), sessionTodos));
  }

  return Array.from(choices.values()).sort((a, b) => {
    const rankA = (a.is_bound ? 0 : a.is_current ? 1 : 2);
    const rankB = (b.is_bound ? 0 : b.is_current ? 1 : 2);
    if (rankA !== rankB) return rankA - rankB;
    return (b.updated_at ?? 0) - (a.updated_at ?? 0);
  });
}

function digestPhase(
  workspaceState: OpenCodeWorkspaceState | null,
  activity: OpenCodeActivityItem | undefined,
  todos: ReturnType<typeof todoProgress>,
): CatSessionDigest["phase"] {
  if (!workspaceState?.database_valid || !workspaceState.server_online) return "offline";
  if (!workspaceState.bound_session_id) return "unbound";
  if (activity?.awaiting_user || activity?.phase === "awaiting-user") return "waiting";
  if (
    activity?.status === "error"
    || activity?.status === "drift"
    || activity?.status === "quiet"
    || workspaceState.session_status === "server-mismatch"
  ) return "blocked";
  if (activity?.status === "working" || workspaceState.progress.status === "working") return "working";
  if (todos.total > 0 && todos.completed === todos.total) return "completed";
  if (activity?.status === "completed" || workspaceState.progress.status === "completed") return "completed";
  return "ready";
}

function digestHeadline(
  phase: CatSessionDigest["phase"],
  title: string,
  activity: OpenCodeActivityItem | undefined,
  toolName: string | undefined,
  todos: ReturnType<typeof todoProgress>,
) {
  switch (phase) {
    case "unbound":
      return "先选择一个 OpenCode 对话";
    case "offline":
      return "还没连上 OpenCode 工作区";
    case "working":
      return toolName ? `正在跑 ${compactText(toolName, "tool", 22)}` : `正在处理 ${compactText(title, "当前任务", 18)}`;
    case "waiting":
      return "OpenCode 正在等你确认";
    case "blocked":
      return activity?.status === "quiet" ? "交给 OpenCode 后还没看到动静" : "这个对话需要处理一下";
    case "completed":
      return todos.total > 0 ? `Todo ${todos.completed}/${todos.total}，这一轮基本完成` : "这一轮基本完成";
    case "ready":
      return `已聚焦 ${compactText(title, "OpenCode 对话", 18)}`;
  }
}

export function buildCatSessionDigest({
  workspaceState,
  activityItems,
  sessionTodos,
  lastEvent,
}: {
  workspaceState: OpenCodeWorkspaceState | null;
  activityItems: OpenCodeActivityItem[];
  sessionTodos: Record<string, TodoItem[]>;
  lastEvent: OpenCodeEvent | null;
}): CatSessionDigest {
  const activeSessionId =
    workspaceState?.bound_session_id
    ?? workspaceState?.session?.id
    ?? activityItems.find((item) => item.is_bound || item.is_current)?.id;
  const activity = activeSessionId ? activityItems.find((item) => item.id === activeSessionId) : undefined;
  const todos = todoProgress(activeSessionId ? sessionTodos[activeSessionId] : []);
  const title = activity?.title ?? workspaceState?.session?.title ?? activeSessionId ?? "OpenCode";
  const toolName = (activity?.tool_name ?? workspaceState?.progress.current_tool) || undefined;
  const phase = digestPhase(workspaceState, activity, todos);
  const progressText = todos.total > 0
    ? `Todo ${todos.completed}/${todos.total}${todos.active ? `，当前：${compactText(todos.active, "", 44)}` : ""}`
    : "还没有 todo 进度";
  const activityText =
    activity?.status_reason
    || activity?.last_message
    || lastEvent?.summary
    || workspaceState?.progress.last_message
    || workspaceState?.server_detail;
  const detail = phase === "unbound"
    ? "先绑定一个对话，小黑再开始跟踪它的工具、消息和 todo。"
    : `${compactText(activityText, "等待 OpenCode 活动", 92)}${todos.total > 0 ? ` · ${progressText}` : ""}`;

  return {
    session_id: activeSessionId,
    title,
    phase,
    headline: digestHeadline(phase, title, activity, toolName, todos),
    detail,
    todo_completed: todos.completed,
    todo_total: todos.total,
    active_todo: todos.active,
    current_tool: toolName,
    last_signal: activity?.last_signal ?? lastEvent?.event_type ?? workspaceState?.progress.status,
    next_action_label: workspaceState?.next_action.label ?? (phase === "unbound" ? "Bind session" : "Review"),
    next_action_summary: workspaceState?.next_action.summary ?? "Select an OpenCode session to begin tracking.",
    updated_at: activity?.updated_at ?? lastEvent?.timestamp ?? workspaceState?.checked_at_ms,
  };
}
