// Usage: npm run reset-password -- admin@email.com [new-password]
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

const email = process.argv[2]?.toLowerCase()
if (!email) {
  console.error('Usage: npm run reset-password -- <email> [new-password]')
  process.exit(1)
}
const password = process.argv[3] ?? randomBytes(9).toString('base64url')

const RAW = process.env.DATABASE_URL ?? 'file:./data/app.db'
const url = RAW.startsWith('file:') || RAW.startsWith('libsql:') ? RAW : `file:${RAW}`
const db = createClient({ url, authToken: url.startsWith('libsql:') ? process.env.DATABASE_AUTH_TOKEN : undefined })

const hash = bcrypt.hashSync(password, 10)
const res = await db.execute({
  sql: `UPDATE users SET password_hash = ?, must_change_password = 1,
        reset_token_hash = NULL, reset_token_expires_at = NULL WHERE email = ?`,
  args: [hash, email],
})
if (res.rowsAffected === 0) {
  console.error(`No user with email ${email}`)
  process.exit(1)
}
console.log(`Password for ${email} reset to: ${password}\nThey'll be asked to change it on next login.`)
