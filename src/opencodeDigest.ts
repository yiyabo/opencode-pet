import type {
  CatSessionDigest,
  OpenCodeActivityItem,
  OpenCodeEvent,
  OpenCodeSessionLink,
  OpenCodeWorkspaceState,
  PetConfig,
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

function isTechnicalControlSummary(value: string | undefined) {
  const text = value?.trim() ?? "";
  if (!text) return false;
  return (
    /^Bound `.+`; TUI selected$/i.test(text)
    || /^Bound `.+`; TUI select needs attention$/i.test(text)
    || /^Following latest `.+`; TUI selected$/i.test(text)
    || /^Following latest `.+`; TUI select needs attention$/i.test(text)
    || /^Focused in OpenCode$/i.test(text)
    || /^Preview bound .+; TUI selected$/i.test(text)
    || /^Preview kept .+; TUI selected$/i.test(text)
    || /^Preview rebound to .+; TUI selected$/i.test(text)
  );
}

function activitySignal(activity: OpenCodeActivityItem | undefined) {
  if (!activity) return "";
  return [
    activity.status,
    activity.phase,
    activity.link_status,
    activity.last_signal,
    activity.status_reason,
  ].filter(Boolean).join(" ").toLowerCase();
}

function friendlyActivityStatus(
  activity: OpenCodeActivityItem | undefined,
  toolName = activity?.tool_name,
) {
  if (!activity) return undefined;
  const signal = activitySignal(activity);

  if (
    activity.awaiting_user
    || signal.includes("awaiting-user")
    || signal.includes("permission")
    || signal.includes("approval")
    || signal.includes("user input")
    || signal.includes("wait user")
  ) {
    return "OpenCode 在等你确认下一步";
  }
  if (
    activity.status === "quiet"
    || activity.phase === "dispatch-quiet"
    || signal.includes("no later opencode activity")
    || signal.includes("tx quiet")
  ) {
    return "交给 OpenCode 后还没看到新活动";
  }
  if (
    activity.status === "drift"
    || activity.link_status === "directory-diff"
    || activity.phase === "sync-drift"
    || signal.includes("metadata differ")
    || signal.includes("directory differ")
  ) {
    return "本地和 OpenCode Web 的会话信息不一致";
  }
  if (
    activity.status === "local-only"
    || activity.link_status === "local-only"
    || activity.phase === "local-only"
  ) {
    return "这个对话只在本地数据库里";
  }
  if (
    activity.status === "server-only"
    || activity.link_status === "server-only"
    || activity.phase === "server-only"
  ) {
    return "这个对话只在 OpenCode Web 里";
  }
  if (
    activity.status === "error"
    || activity.phase === "failed"
    || signal.includes("failed")
    || signal.includes("failure")
    || signal.includes("runtime.error")
    || signal.includes("tool.failed")
    || signal.includes("reported an error")
  ) {
    return toolName ? `${compactText(toolName, "工具", 22)} 运行失败` : "OpenCode 报错了";
  }

  return undefined;
}

function isInternalStatusSummary(value: string | undefined) {
  const text = value?.trim() ?? "";
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    isTechnicalControlSummary(text)
    || /^session is .* after .* link check/.test(lower)
    || /^latest role is /.test(lower)
    || /^opencode progress status is /.test(lower)
    || /^session exists (locally|on the opencode server)/.test(lower)
    || /^local sqlite session and opencode server metadata differ/.test(lower)
    || /^dispatch was accepted/.test(lower)
    || /^prompt reached opencode/.test(lower)
    || /^prompt dispatch to opencode failed/.test(lower)
    || /^opencode reported (a failure|an error)/.test(lower)
    || /^opencode is actively/.test(lower)
  );
}

function activitySummary(
  activity: OpenCodeActivityItem | undefined,
  fallback: string | undefined,
) {
  const candidates = [
    activity?.ai_summary?.summary,
    activity?.last_user_message,
    isInternalStatusSummary(activity?.last_message) ? undefined : activity?.last_message,
    activity?.last_assistant_message,
    friendlyActivityStatus(activity),
    isInternalStatusSummary(activity?.status_reason) ? undefined : activity?.status_reason,
    fallback,
  ];

  return compactText(candidates.find((item) => item && item.trim()), "No recent activity", 120);
}

function choiceFromLink(
  link: OpenCodeSessionLink,
  activity: OpenCodeActivityItem | undefined,
  sessionTodos: Record<string, TodoItem[]>,
): SessionChoice {
  const todos = todoProgress(sessionTodos[link.id]);
  const title = activity?.title ?? link.local?.title ?? link.server?.title ?? link.id;
  const status = activity?.status ?? link.status;
  const isBound = Boolean(activity?.is_bound || link.is_bound);
  return {
    id: link.id,
    title,
    directory: activity?.directory ?? link.local?.directory ?? link.server?.directory,
    status,
    phase: activity?.phase ?? statusLabel(status),
    summary: activitySummary(activity, link.local?.directory ?? link.server?.directory),
    last_signal: activity?.last_signal ?? statusLabel(status).toUpperCase(),
    is_bound: isBound,
    is_current: activity?.is_current ?? link.is_current,
    is_bindable: Boolean(link.local) || Boolean(activity && activity.source !== "server" && activity.status !== "server-only"),
    is_connected: isBound,
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
    summary: activitySummary(activity, activity.directory),
    last_signal: activity.last_signal,
    is_bound: activity.is_bound,
    is_current: activity.is_current,
    is_bindable: activity.source !== "server" && activity.status !== "server-only",
    is_connected: activity.is_bound,
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
      return "对话在等你的下一步";
    case "blocked":
      return friendlyActivityStatus(activity, toolName) ?? "对话状态需要确认";
    case "completed":
      return todos.total > 0 ? `Todo ${todos.completed}/${todos.total}，可继续对话` : "这一轮可继续对话";
    case "ready":
      return `已聚焦 ${compactText(title, "OpenCode 对话", 18)}`;
  }
}

function activityPhase(
  activity: OpenCodeActivityItem,
  todos: ReturnType<typeof todoProgress>,
): CatSessionDigest["phase"] {
  if (activity.awaiting_user || activity.phase === "awaiting-user") return "waiting";
  if (activity.status === "error" || activity.status === "drift" || activity.status === "quiet") return "blocked";
  if (activity.status === "working") return "working";
  if (todos.total > 0 && todos.completed === todos.total) return "completed";
  if (activity.status === "completed") return "completed";
  return "ready";
}

// Per-cat headline: reuses digestHeadline's 萌文案 for any single activity,
// independent of the globally-focused session that buildCatSessionDigest tracks.
export function activityHeadline(
  activity: OpenCodeActivityItem,
  todoItems: TodoItem[] = [],
): string {
  const todos = todoProgress(todoItems);
  const phase = activityPhase(activity, todos);

  if (!activity.is_bound && !activity.is_current && phase === "ready") {
    return "";
  }

  return digestHeadline(phase, activity.title || activity.id, activity, activity.tool_name || undefined, todos);
}

function petDigestPhase(
  hasBoundSession: boolean,
  workspaceState: OpenCodeWorkspaceState | null,
  activity: OpenCodeActivityItem | undefined,
  todos: ReturnType<typeof todoProgress>,
): CatSessionDigest["phase"] {
  if (!hasBoundSession) return "unbound";
  if (!workspaceState?.database_valid || !workspaceState.server_online) return "offline";
  if (activity?.awaiting_user || activity?.phase === "awaiting-user") return "waiting";
  if (
    activity?.status === "error"
    || activity?.status === "drift"
    || activity?.status === "quiet"
  ) return "blocked";
  if (activity?.status === "working") return "working";
  if (todos.total > 0 && todos.completed === todos.total) return "completed";
  if (activity?.status === "completed") return "completed";
  return "ready";
}

export function buildPetSessionDigest({
  petConfig,
  workspaceState,
  activityItems,
  sessionTodos,
  lastEvent,
}: {
  petConfig: PetConfig;
  workspaceState: OpenCodeWorkspaceState | null;
  activityItems: OpenCodeActivityItem[];
  sessionTodos: Record<string, TodoItem[]>;
  lastEvent: OpenCodeEvent | null;
}): CatSessionDigest {
  const activeSessionId = petConfig.bound_session_id;
  if (!activeSessionId) {
    return {
      title: petConfig.name,
      phase: "unbound",
      headline: "选择 OpenCode 对话",
      detail: `给 ${petConfig.name} 绑定一个 OpenCode 对话后才会显示任务气泡。`,
      todo_completed: 0,
      todo_total: 0,
      next_action_label: "BIND",
      next_action_summary: "Bind an OpenCode session to this pet",
    };
  }

  const activity = activityItems.find((item) => item.id === activeSessionId);
  const sessionEvent =
    lastEvent && lastEvent.session_id === activeSessionId ? lastEvent : null;
  const todos = todoProgress(sessionTodos[activeSessionId] ?? []);
  const title = activity?.title
    ?? (workspaceState?.session?.id === activeSessionId ? workspaceState.session.title : undefined)
    ?? activeSessionId;
  const toolName = activity?.tool_name || undefined;
  const phase = petDigestPhase(Boolean(activeSessionId), workspaceState, activity, todos);
  const progressText = todos.total > 0
    ? `Todo ${todos.completed}/${todos.total}${todos.active ? `，当前：${compactText(todos.active, "", 44)}` : ""}`
    : "还没有 todo 进度";
  const activityText =
    todos.active
    || activity?.ai_summary?.summary
    || activity?.last_user_message
    || (isInternalStatusSummary(sessionEvent?.summary) ? undefined : sessionEvent?.summary)
    || (isInternalStatusSummary(activity?.last_message) ? undefined : activity?.last_message)
    || friendlyActivityStatus(activity, toolName)
    || (isInternalStatusSummary(activity?.status_reason) ? undefined : activity?.status_reason)
    || workspaceState?.server_detail;
  const detail = `${compactText(activityText, "等待 OpenCode 活动", 92)}${todos.total > 0 ? ` · ${progressText}` : ""}`;

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
    last_signal: activity?.last_signal ?? sessionEvent?.summary,
    next_action_label: activity?.next_action_label ?? workspaceState?.next_action.label ?? "OPEN",
    next_action_summary: activity?.next_action_reason ?? workspaceState?.next_action.summary ?? "Open this pet desk",
    updated_at: activity?.updated_at,
  };
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
  const activeSessionId = workspaceState?.bound_session_id;
  const activity = activeSessionId ? activityItems.find((item) => item.id === activeSessionId) : undefined;
  const sessionEvent =
    lastEvent && (!activeSessionId || lastEvent.session_id === activeSessionId) ? lastEvent : null;
  const todos = todoProgress(activeSessionId ? sessionTodos[activeSessionId] : []);
  const title = activity?.title ?? workspaceState?.session?.title ?? activeSessionId ?? "OpenCode";
  const toolName = (activity?.tool_name ?? workspaceState?.progress.current_tool) || undefined;
  const phase = digestPhase(workspaceState, activity, todos);
  const progressText = todos.total > 0
    ? `Todo ${todos.completed}/${todos.total}${todos.active ? `，当前：${compactText(todos.active, "", 44)}` : ""}`
    : "还没有 todo 进度";
  const activityText =
    todos.active
    || activity?.ai_summary?.summary
    || activity?.last_user_message
    || (isInternalStatusSummary(sessionEvent?.summary) ? undefined : sessionEvent?.summary)
    || (isInternalStatusSummary(activity?.last_message) ? undefined : activity?.last_message)
    || (isInternalStatusSummary(workspaceState?.progress.last_message) ? undefined : workspaceState?.progress.last_message)
    || friendlyActivityStatus(activity, toolName)
    || (isInternalStatusSummary(activity?.status_reason) ? undefined : activity?.status_reason)
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
    last_signal: activity?.last_signal ?? sessionEvent?.event_type ?? workspaceState?.progress.status,
    next_action_label: workspaceState?.next_action.label ?? (phase === "unbound" ? "Bind session" : "Review"),
    next_action_summary: workspaceState?.next_action.summary ?? "Select an OpenCode session to begin tracking.",
    updated_at: activity?.updated_at ?? sessionEvent?.timestamp ?? workspaceState?.checked_at_ms,
  };
}
