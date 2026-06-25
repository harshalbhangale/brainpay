/** List Tavus stock replicas so we can pick a current (non-deprecated) tutor face. */
const key = process.env.TAVUS_API_KEY as string
async function main() {
  const res = await fetch('https://tavusapi.com/v2/replicas?replica_type=system&limit=50', {
    headers: { 'x-api-key': key },
  })
  const body = (await res.json()) as { data?: { replica_id: string; replica_name?: string; model_name?: string; status?: string }[] }
  for (const r of body.data ?? []) {
    console.log(`${r.replica_id}\t${r.model_name ?? '?'}\t${r.replica_name ?? ''}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
