import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { McpApp } from './types';
import { MCP_SERVERS, routeTools, type McpServerName } from './generate';
import { dispatchTool } from './dispatch';
import { SERVER_INSTRUCTIONS } from './instructions';

// A low-level MCP Server for one request. tools/list returns every route tagged
// with x-mcp; tools/call dispatches to the real route via app.handle with the
// caller's API key. The low-level Server (not McpServer) is used so the route's
// TypeBox JSON Schema can be served as the tool inputSchema without converting to
// Zod. Arguments are validated by the route itself, not here.
//
// `scope` selects a dedicated endpoint (MCP_SERVERS): only the tools tagged with
// it are served, and `onCall` records each call for that feature's audit log.
export interface McpScope {
  server: McpServerName;
  instructions: string;
  onCall?: (call: {
    tool: string;
    args: Record<string, unknown>;
    isError: boolean;
    durationMs: number;
  }) => Promise<void>;
}

export function buildMcpServer(app: McpApp, apiKey: string, scope?: McpScope): Server {
  const server = new Server(
    // `name` is the stable programmatic identifier; `title` is the human-readable
    // display name a client shows to the user (per the MCP Implementation spec).
    scope
      ? { name: scope.server, title: MCP_SERVERS[scope.server].title, version: '1.0.0' }
      : { name: 'itsaplan', title: 'Itsaplan', version: '1.0.0' },
    // `instructions` reaches the client in the initialize response and covers what
    // no single tool description can: which tool resolves ids, how a column is
    // picked, how far a request to "work on an issue" goes.
    {
      capabilities: { tools: {} },
      instructions: scope?.instructions ?? SERVER_INSTRUCTIONS,
    },
  );

  const table = routeTools(app).filter((tool) => tool.server === scope?.server);
  const byName = new Map(table.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: table.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName.get(req.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    const args = req.params.arguments ?? {};
    const startedAt = Date.now();
    const { text, isError } = await dispatchTool(app, tool, args, apiKey, {
      viaMcpEndpoint: true,
    });
    if (scope?.onCall) {
      // The audit write must not turn a finished tool call into an error.
      await scope
        .onCall({ tool: tool.name, args, isError, durationMs: Date.now() - startedAt })
        .catch((error) => console.error('[mcp] audit of a tool call failed:', error));
    }
    return { content: [{ type: 'text', text }], isError };
  });

  return server;
}
