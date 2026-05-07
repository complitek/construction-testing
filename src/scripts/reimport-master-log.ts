import { readFile } from 'node:fs/promises'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { importMasterLog } from '@/lib/import/master-log'

async function main() {
  const path = process.argv[2]
  if (!path) { console.error('Usage: tsx reimport-master-log.ts <xlsx-path>'); process.exit(1) }

  console.log(`Reading ${path} ...`)
  const buf = await readFile(path)

  const [anyUser] = await db.select().from(users).limit(1)
  if (!anyUser) { console.error('No users in database — log in to the app first.'); process.exit(1) }
  console.log(`Importing as createdBy=${anyUser.email} (${anyUser.id})`)

  const t0 = Date.now()
  const result = await importMasterLog(buf, anyUser.id)
  const secs = ((Date.now() - t0) / 1000).toFixed(1)

  console.log(`\nDone in ${secs}s`)
  console.log('CS sheet:      ', result.cs)
  console.log('Summary sheet: ', result.summary)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
