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
