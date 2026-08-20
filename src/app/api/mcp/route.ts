import { createMcpHandler } from 'mcp-handler'
import { requireMcpAuth } from '@/lib/oauth/guard'
import { tokenOwnerEmail } from '@/lib/oauth/tokens'
import { registerReadTools } from '@/lib/mcp/tools-read'
import { registerSetupTools } from '@/lib/mcp/tools-setup'
import { registerOpsTools } from '@/lib/mcp/tools-ops'
import { scopedServer, type ToolServer } from '@/lib/mcp/server-types'

// Bulk dispatch outlives default serverless timeouts.
export const maxDuration = 300

function buildHandler(ownerEmail: string, scope: string) {
  return createMcpHandler(
    (server) => {
      const s = scopedServer(server as unknown as ToolServer, scope)
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

/**
 * Every MCP request carries an OAuth bearer token — agents have no session
 * cookie. The token is minted by this app against its own users table; no
 * external account is involved.
 */
async function authed(request: Request) {
  const gate = await requireMcpAuth(request)
  if ('response' in gate) return gate.response
  const { token } = gate
  // client_credentials tokens act as the app, so fall back to the configured
  // from-address for anything that needs a human recipient.
  const ownerEmail = (await tokenOwnerEmail(token)) ?? ''
  return buildHandler(ownerEmail, token.scope)(request)
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
