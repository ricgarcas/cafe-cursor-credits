import { hasScope, scopeForTool } from '@/lib/oauth/config'

/**
 * Shared shape for tool registration. `mcp-handler` hands us an McpServer, but
 * typing against the SDK's deep generics buys nothing here — every tool returns
 * the same text envelope.
 */
export type ToolServer = {
  registerTool: (
    name: string,
    config: {
      title?: string
      description?: string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema?: Record<string, any>
      annotations?: Record<string, unknown>
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb: (args: any) => Promise<{ content: { type: 'text'; text: string }[] }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => any
}

/** Every tool answers with one text block — JSON unless it is already a string. */
export function text(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  }
}

/**
 * Wraps a ToolServer so every tool checks the granted scope before running.
 *
 * Doing it here rather than in each tool means a newly added tool is gated by
 * default: `scopeForTool` treats anything not on the read list as a write.
 */
export function scopedServer(server: ToolServer, grantedScope: string): ToolServer {
  return {
    registerTool: (name, config, cb) =>
      server.registerTool(name, config, async (args) => {
        const needed = scopeForTool(name)
        if (!hasScope(grantedScope, needed)) {
          return text({
            error: `This token lacks the ${needed} scope, so ${name} is not available.`,
            required_scope: needed,
            granted_scope: grantedScope,
            hint: 'Reconnect the server in Cursor and approve the write permission.',
          })
        }
        return cb(args)
      }),
  }
}
