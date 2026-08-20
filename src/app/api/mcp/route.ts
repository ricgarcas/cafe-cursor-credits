import { createMcpHandler } from 'mcp-handler'
import { NextResponse } from 'next/server'
import { apiKeyOwnerEmail, requireApiKey } from '@/lib/auth/api-key'
import { registerReadTools } from '@/lib/mcp/tools-read'
import { registerSetupTools } from '@/lib/mcp/tools-setup'
import { registerOpsTools } from '@/lib/mcp/tools-ops'
import type { ToolServer } from '@/lib/mcp/server-types'

// Bulk dispatch outlives default serverless timeouts.
export const maxDuration = 300

function buildHandler(ownerEmail: string) {
  return createMcpHandler(
    (server) => {
      const s = server as unknown as ToolServer
      registerReadTools(s)
      registerSetupTools(s, ownerEmail)
      registerOpsTools(s)
    },
    {
      serverInfo: { name: 'cafe-cursor', version: '1.0.0' },
      instructions: [
        'Cafe Cursor runs community meetups that hand out Cursor credit codes.',
        'Call readiness_check before an event to see what is still missing.',
        'Tools that email people or burn codes (dispatch_codes, resend_failed,',
        'sync_luma with dispatch, configure_email) default to dry_run:true and',
        'return a confirm_token. Always show the projection to the user and get',
        'their approval before re-running with dry_run:false — codes and emails',
        'cannot be taken back.',
      ].join(' '),
    },
  )
}

/** Every MCP request carries a bearer API key — agents have no session cookie. */
async function authed(request: Request) {
  const gate = await requireApiKey(request)
  if ('response' in gate) return gate.response
  const ownerEmail = await apiKeyOwnerEmail(gate.key)
  if (!ownerEmail) {
    return NextResponse.json(
      { error: 'API key has no owner to send test mail to' },
      { status: 400 },
    )
  }
  return buildHandler(ownerEmail)(request)
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
