/**
 * Mask a secret for display. Preserves prefix (before first `-` or `_`) and
 * last 4 characters so admins can verify the key without exposing it.
 * Used by the settings API and `SecretField` form component.
 */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length < 8) return '••••••••'
  const dashIdx = trimmed.indexOf('-')
  const underscoreIdx = trimmed.indexOf('_')
  const prefixEnd =
    dashIdx > 0 && dashIdx < 10
      ? dashIdx + 1
      : underscoreIdx > 0 && underscoreIdx < 10
        ? underscoreIdx + 1
        : 0
  const prefix = trimmed.slice(0, prefixEnd)
  const tail = trimmed.slice(-4)
  return `${prefix}${'•'.repeat(12)}${tail}`
}

/** Sentinel sent by the client form to mean "value unchanged". */
export const UNCHANGED = '__unchanged__'

/**
 * Returns true if the value is either the sentinel or a mask string the form
 * could have echoed back to us. Lets the server safely skip secret updates.
 */
export function isUnchanged(value: unknown): boolean {
  if (value === UNCHANGED) return true
  if (typeof value !== 'string') return false
  return /^[a-z_-]{0,10}•+[a-zA-Z0-9]{4}$/.test(value)
}
