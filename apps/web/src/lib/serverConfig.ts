import { useAppStore } from "../stores/app";

export function getApiBaseUrl() {
  const { serverHost, serverPort, protocol } = useAppStore.getState();
  const host = serverHost.trim();
  const port = serverPort.trim() || "3000";

  if (!host) {
    return "/api";
  }

  return `${protocol}://${host}${port ? `:${port}` : ""}/api`;
}

export function resolveAssetUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//.test(path) || path.startsWith("data:")) return path;

  const { serverHost, serverPort, protocol } = useAppStore.getState();
  if (!serverHost.trim()) return path;

  return `${protocol}://${serverHost.trim()}:${(serverPort || "3000").trim()}${path}`;
}
