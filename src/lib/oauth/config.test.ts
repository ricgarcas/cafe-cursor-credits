import { describe, it, expect } from 'vitest'
import {
  parseScopes,
  hasScope,
  scopeForTool,
  resourceMatches,
  SCOPE_READ,
  SCOPE_WRITE,
} from './config'

describe('scopes', () => {
  it('keeps only supported scopes', () => {
    expect(parseScopes('cafecursor:read admin:everything')).toEqual([SCOPE_READ])
  })

  it('treats read tools as read and everything else as write', () => {
    expect(scopeForTool('readiness_check')).toBe(SCOPE_READ)
    expect(scopeForTool('dispatch_codes')).toBe(SCOPE_WRITE)
  })

  it('gates an unknown tool as write, so new tools are not free by default', () => {
    expect(scopeForTool('some_tool_added_next_week')).toBe(SCOPE_WRITE)
  })

  it('does not let a read token satisfy write', () => {
    expect(hasScope(SCOPE_READ, SCOPE_WRITE)).toBe(false)
    expect(hasScope(`${SCOPE_READ} ${SCOPE_WRITE}`, SCOPE_WRITE)).toBe(true)
  })
})

describe('resource matching', () => {
  const canonical = 'https://cc.example.com/api/mcp'

  it('tolerates a trailing slash and case in host', () => {
    expect(resourceMatches('https://cc.example.com/api/mcp/', canonical)).toBe(true)
    expect(resourceMatches('https://CC.example.com/api/mcp', canonical)).toBe(true)
  })

  it('rejects a different host', () => {
    expect(resourceMatches('https://evil.example.com/api/mcp', canonical)).toBe(false)
  })

  it('rejects a different path on the same host', () => {
    expect(resourceMatches('https://cc.example.com/api/other', canonical)).toBe(false)
  })

  it('rejects a missing resource', () => {
    expect(resourceMatches(null, canonical)).toBe(false)
  })
})
