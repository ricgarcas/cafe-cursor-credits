import { Resend } from 'resend'

// Create Resend client lazily to avoid build-time errors
let resendClient: Resend | null = null

export function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

// For backward compatibility
export const resend = {
  emails: {
    send: async (...args: Parameters<Resend['emails']['send']>) => {
      return getResend().emails.send(...args)
    }
  }
}
