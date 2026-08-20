import { createMcpHandler } from 'mcp-handler'
import { requireApiKey } from '@/lib/auth/api-key'
import { registerReadTools } from '@/lib/mcp/tools-read'
import type { ToolServer } from '@/lib/mcp/server-types'

// Bulk dispatch outlives default serverless timeouts.
export const maxDuration = 300

const handler = createMcpHandler((server) => {
  registerReadTools(server as unknown as ToolServer)
})

/** Every MCP request carries a bearer API key — agents have no session cookie. */
async function authed(request: Request) {
  const gate = await requireApiKey(request)
  if ('response' in gate) return gate.response
  return handler(request)
}

export async function GET(request: Request) {
  return authed(request)
}

export async function POST(request: Request) {
  return authed(request)
}

export async function DELETE(request: Request) {
  return authed(request)
}
