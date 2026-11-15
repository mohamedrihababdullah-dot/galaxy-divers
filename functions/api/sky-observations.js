import { IRSA, MAX_ROWS, readPosition, parseCsv, normalizeProducts, selectVisits, fetchArchive } from '../lib/sky-archive.js'

export async function onRequestGet(context) {
  const params = new URL(context.request.url).searchParams
  let coords, detector
  try {
    coords = readPosition(params)
    detector = Number(params.get('detector') ?? 2)
    if (!Number.isInteger(detector) || detector < 1 || detector > 6) throw new Error('Choose detector 1–6.')
  } catch (error) { return Response.json({ error: error.message }, { status: 400 }) }
  const cache = globalThis.caches?.default
  const cacheKey = new Request(`${new URL(context.request.url).origin}/api/sky-observations?ra=${coords.ra}&dec=${coords.dec}&detector=${detector}`)
  const cached = await cache?.match(cacheKey)
  if (cached) return cached
  try {
    const query = `SELECT TOP ${MAX_ROWS + 1} a.uri, p.time_bounds_lower, p.energy_bandpassname
      FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid
      WHERE 1 = CONTAINS(POINT('ICRS', ${coords.ra}, ${coords.dec}), p.poly)
      AND p.energy_bandpassname = 'SPHEREx-D${detector}' ORDER BY p.time_bounds_lower`
    let rows
    try {
      const body = new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', QUERY: query })
      const response = await fetchArchive(`${IRSA}/TAP/sync`, { method: 'POST', body })
      rows = parseCsv(await response.text())
    } catch {
      // SIA provides an independent official query path if TAP is unavailable.
      const body = new URLSearchParams({ POS: `CIRCLE ${coords.ra} ${coords.dec} 0.000001`,
        RESPONSEFORMAT: 'CSV', MAXREC: String(MAX_ROWS + 1) })
      body.append('COLLECTION', 'spherex_dr1')
      body.append('COLLECTION', 'spherex_qr3')
      const response = await fetchArchive(`${IRSA}/SIA?${body}`)
      rows = parseCsv(await response.text())
    }
    const products = normalizeProducts(rows, detector)
    const response = Response.json({ coords, detector, count: products.length,
      truncated: rows.length > MAX_ROWS, visits: selectVisits(products), searchedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'public, max-age=900' } })
    if (cache && products.length) context.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  } catch {
    return Response.json({ error: 'NASA/IPAC IRSA could not complete this search. Please retry in a moment.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
