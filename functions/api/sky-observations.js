import { IRSA, MAX_ROWS, readPosition, parseCsv, normalizeProducts, selectVisits, fetchArchive } from '../lib/sky-archive.js'
import verifiedFields from '../data/verified-observations.json' with { type: 'json' }

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
  const recoveryKey = new Request(`${cacheKey.url}&recovery=1`)
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
    if (cache && products.length) {
      const recovery = new Response(await response.clone().text(), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=2592000' },
      })
      context.waitUntil(Promise.all([cache.put(cacheKey, response.clone()), cache.put(recoveryKey, recovery)]).catch(() => {}))
    }
    return response
  } catch {
    // Never substitute a nearby field: the recovery index must match the requested position.
    const previous = await cache?.match(recoveryKey)
    if (previous) {
      const data = await previous.json()
      return Response.json({ ...data, recovery: true,
        notice: 'Live archive search is temporarily unavailable. Showing the last successful search for these exact coordinates.' },
      { headers: { 'Cache-Control': 'no-store' } })
    }
    const field = verifiedFields.find(field => Math.abs(field.ra - coords.ra) < 1e-8 && Math.abs(field.dec - coords.dec) < 1e-8)
    const products = field ? normalizeProducts(field.products, detector) : []
    if (products.length) return Response.json({ coords, detector, count: products.length, truncated: false,
      visits: selectVisits(products), recovery: true,
      notice: 'Live archive search is temporarily unavailable. Showing previously indexed NASA observations for these exact coordinates.' },
    { headers: { 'Cache-Control': 'no-store' } })
    return Response.json({ error: 'IRSA’s search service is currently unavailable, and no saved observation list exists for these coordinates. Please try again when the archive service is back online.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
