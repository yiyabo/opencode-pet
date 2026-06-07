export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const candidate = (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  if (!candidate || typeof candidate !== "object") return false;
  const internals = candidate as { invoke?: unknown; transformCallback?: unknown };
  return typeof internals.invoke === "function" && typeof internals.transformCallback === "function";
}
