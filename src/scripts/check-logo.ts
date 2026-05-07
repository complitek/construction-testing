import { db } from '@/lib/db'
import { appSettings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { list } from '@vercel/blob'

async function main() {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'logo_url'))
  console.log('appSettings.logo_url:', row?.value ?? '(not set)')

  console.log('\nBlobs under branding/:')
  const res = await list({ prefix: 'branding/' })
  if (res.blobs.length === 0) console.log('  (none)')
  for (const b of res.blobs) {
    console.log(`  ${b.uploadedAt.toISOString()}  ${b.pathname}  ${(b.size / 1024).toFixed(1)} KB  ${b.url}`)
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
