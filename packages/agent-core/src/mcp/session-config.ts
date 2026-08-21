import type { McpServerConfig } from '#/config/schema';

import { loadMcpServers } from './config-loader';
import type { McpServerSource } from './registry';

export interface SessionMcpConfig {
  readonly servers: Record<string, McpServerConfig>;
  /**
   * Per-server origin tag, aligned with the unified registry's sources
   * (`global` layered files / `plugin` manifest / `caller` SDK injection).
   * The connection manager records it per entry so management operations can
   * tell read-only plugin entries from mutable global ones.
   */
  readonly sources?: Record<string, McpServerSource>;
}

export interface ResolveSessionMcpConfigInput {
  readonly cwd: string;
  readonly homeDir?: string;
}

export async function resolveSessionMcpConfig(
  input: ResolveSessionMcpConfigInput,
): Promise<SessionMcpConfig | undefined> {
  const servers = await loadMcpServers({
    cwd: input.cwd,
    homeDir: input.homeDir,
  });
  if (Object.keys(servers).length === 0) return undefined;
  return {
    servers,
    sources: Object.fromEntries(Object.keys(servers).map((name) => [name, 'global'])),
  };
}

export function mergeCallerMcpServers(
  base: SessionMcpConfig | undefined,
  callerServers: Readonly<Record<string, McpServerConfig>> | undefined,
): SessionMcpConfig | undefined {
  if (callerServers === undefined || Object.keys(callerServers).length === 0) {
    return base;
  }
  return {
    servers: {
      ...base?.servers,
      ...callerServers,
    },
    sources: {
      ...base?.sources,
      ...Object.fromEntries(Object.keys(callerServers).map((name) => [name, 'caller'])),
    },
  };
}

/**
 * Does `server` apply to `modelAlias`? A server with no `models` restriction
 * applies everywhere. A restricted server applies only when `modelAlias`
 * matches one of its entries — exact key match ("example-provider/vision-large")
 * or a trailing-"*" prefix wildcard ("example-provider/*"). When the model is
 * unknown, restricted servers are excluded so a model-specific MCP does not
 * leak into a session whose model is undecided.
 */
export function mcpServerAppliesToModel(
  server: McpServerConfig,
  modelAlias: string | undefined,
): boolean {
  const models = server.models;
  if (models === undefined || models.length === 0) return true;
  if (modelAlias === undefined) return false;
  return models.some((pattern) =>
    pattern.endsWith('*')
      ? modelAlias.startsWith(pattern.slice(0, -1))
      : pattern === modelAlias,
  );
}

/**
 * Drop MCP servers whose `models` restriction excludes `modelAlias`. Servers
 * without a restriction are always kept (backward compatible).
 */
export function filterMcpServersByModel(
  config: SessionMcpConfig | undefined,
  modelAlias: string | undefined,
): SessionMcpConfig | undefined {
  if (config === undefined) return undefined;
  const filtered: Record<string, McpServerConfig> = {};
  for (const [name, server] of Object.entries(config.servers)) {
    if (mcpServerAppliesToModel(server, modelAlias)) {
      filtered[name] = server;
    }
  }
  if (Object.keys(filtered).length === 0) return undefined;
  return { servers: filtered };
}
