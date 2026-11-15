export const IRSA = 'https://irsa.ipac.caltech.edu'
export const MAX_ROWS = 12000

export function readPosition(params) {
  const ra = Number(params.get('ra'))
  const dec = Number(params.get('dec'))
  if (!params.get('ra')?.trim() || !params.get('dec')?.trim() ||
      !Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || dec < -90 || dec > 90) {
    throw new Error('Enter RA from 0 to less than 360° and declination from −90 to 90°.')
  }
  return { ra, dec }
}

export function imageUrl(value) {
  const url = new URL(value, IRSA)
  if (url.origin !== IRSA || url.username || url.password || url.search || url.hash ||
      !/^\/ibe\/data\/spherex\/(dr1|qr3)\/level2\/[A-Za-z0-9_./-]+\.fits$/.test(url.pathname)) {
    throw new Error('Expected an official IRSA SPHEREx spectral image.')
  }
  return url.href
}

// CSV records may contain quoted commas, newlines and escaped quotes.
export function parseCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++ }
      else quoted = !quoted
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = ''
      if (char === '\n') { rows.push(row); row = [] }
    } else cell += char
  }
  if (quoted) throw new Error('Incomplete archive response.')
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row) }
  const names = rows.shift()?.map(name => name.replace(/^\uFEFF/, '').trim()) ?? []
  if (!names.includes('uri') && !names.includes('access_url')) throw new Error('Invalid archive response.')
  return rows.filter(row => row.length === names.length).map(row => Object.fromEntries(names.map((name, i) => [name, row[i]])))
}

export function normalizeProducts(rows, detector) {
  const unique = new Map()
  for (const row of rows) {
    const mjd = Number(row.time_bounds_lower ?? row.t_min)
    const band = String(row.energy_bandpassname ?? '')
    if (!(mjd > 50000) || !Number.isFinite(mjd) || !band.endsWith(`D${detector}`)) continue
    try {
      const source = imageUrl(row.uri ?? row.access_url)
      const id = new URL(source).pathname.split('/').at(-1)
      // A reprocessed exposure is one observation, even if listed multiple times.
      const key = id.split('_spx_')[0]
      const product = { id, source, mjd, detector, date: new Date((mjd - 40587) * 86400000).toISOString() }
      const previous = unique.get(key)
      if (!previous || source.localeCompare(previous.source, undefined, { numeric: true }) > 0) unique.set(key, product)
    } catch { /* Ignore non-science artifacts and unsupported releases. */ }
  }
  return [...unique.values()].sort((a, b) => a.mjd - b.mjd)
}

export function selectVisits(products) {
  if (!products.length) return []
  const anchors = [products[0]]
  while (anchors.length < 3) {
    const ranked = products.map(product => ({ product,
      distance: Math.min(...anchors.map(anchor => Math.abs(product.mjd - anchor.mjd))) }))
      .sort((a, b) => b.distance - a.distance)
    if (ranked[0].distance < 30) break
    anchors.push(ranked[0].product)
  }
  return anchors.sort((a, b) => a.mjd - b.mjd).map(anchor => {
    const nearby = products.filter(product => Math.abs(product.mjd - anchor.mjd) <= 14)
    // Sample different exposures in each visit; the FITS worker compares their local wavelengths.
    const indices = [...new Set([0, Math.floor((nearby.length - 1) / 2), nearby.length - 1])]
    return { date: anchor.date, candidates: indices.map(index => nearby[index]) }
  })
}

export async function fetchArchive(url, options = {}) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) })
      if (!response.ok) { await response.body?.cancel(); throw new Error(`IRSA returned ${response.status}`) }
      return response
    } catch (error) { lastError = error }
  }
  throw lastError
}
