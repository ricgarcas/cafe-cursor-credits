import { Resend } from 'resend'

/**
 * Create a Resend client with the provided API key
 * Use this factory function to create instances with database-stored keys
 */
export function createResendClient(apiKey: string): Resend {
  if (!apiKey) {
    throw new Error('Resend API key is required')
  }
  return new Resend(apiKey)
}
