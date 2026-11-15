import test from 'node:test'
import assert from 'node:assert/strict'
import { readPosition, imageUrl, parseCsv, normalizeProducts, selectVisits } from '../functions/lib/sky-archive.js'
import { onRequestGet } from '../functions/api/sky-observations.js'

const source = 'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W36_2B/l2b-v27-2026-234/2/level2_2025W36_2B_0123_1D2_spx_l2b-v27-2026-234.fits'
test('coordinates accept both poles and RA zero and reject missing/nonfinite values', () => {
  assert.deepEqual(readPosition(new URLSearchParams('ra=0&dec=-90')), { ra: 0, dec: -90 })
  assert.deepEqual(readPosition(new URLSearchParams('ra=359.9999&dec=90')), { ra: 359.9999, dec: 90 })
  for (const input of ['ra=&dec=0', 'ra=NaN&dec=0', 'ra=360&dec=0', 'ra=1&dec=91', 'ra=Infinity&dec=0']) {
    assert.throws(() => readPosition(new URLSearchParams(input)))
  }
})
test('cutout sources are restricted to official spectral image files', () => {
  assert.equal(imageUrl(source), source)
  for (const input of ['https://example.com/file.fits', 'http://irsa.ipac.caltech.edu/file.fits',
    source + '?redirect=1', source.replace('/dr1/level2/', '/dr1/hips5_cube/'), source.replace('https://', 'https://user@')]) {
    assert.throws(() => imageUrl(input))
  }
})
test('CSV preserves quoted fields, embedded newlines and escaped quotes', () => {
  assert.deepEqual(parseCsv('uri,label\r\n"/file","a, b\n""c"""\r\n'), [{ uri: '/file', label: 'a, b\n"c"' }])
  assert.throws(() => parseCsv('<html>upstream failure</html>'))
})
test('normalize keeps one version of each exposure and checks detector', () => {
  const row = { uri: source, time_bounds_lower: '61000', energy_bandpassname: 'SPHEREx-D2' }
  assert.equal(normalizeProducts([row, row, { ...row, uri: 'https://invalid.test/file.fits' }], 2).length, 1)
  assert.equal(normalizeProducts([row], 6).length, 0)
})
test('three visits span the full available timeline with no shared candidates', () => {
  const products = [0, 2, 5, 180, 182, 186, 360, 362, 365].map((offset, id) => ({ mjd: 60000 + offset, id, date: String(id) }))
  const visits = selectVisits(products)
  assert.equal(visits.length, 3)
  assert.deepEqual(visits.map(visit => visit.candidates.map(item => item.id)), [[0, 1, 2], [3, 4, 5], [6, 7, 8]])
})
test('daily exposures are not advertised as separate survey visits', () => {
  assert.equal(selectVisits([0, 1, 2].map(mjd => ({ mjd: 60000 + mjd }))).length, 1)
  assert.equal(selectVisits([]).length, 0)
  assert.equal(selectVisits([{ mjd: 60000 }, { mjd: 60180 }]).length, 2)
})
test('API rejects invalid coordinates before making an archive request', async () => {
  const response = await onRequestGet({ request: new Request('https://example.test/api/sky-observations?ra=361&dec=0') })
  assert.equal(response.status, 400)
})
test('API returns real inventory and falls back to SIA when TAP fails', async () => {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async url => {
    calls.push(String(url))
    if (String(url).includes('/TAP/')) return new Response('Unavailable', { status: 503 })
    return new Response(`access_url,t_min,energy_bandpassname\n${source},61000,SPHEREx-D2\n`, { headers: { 'Content-Type': 'text/csv' } })
  }
  try {
    const response = await onRequestGet({ request: new Request('https://example.test/api/sky-observations?ra=180&dec=30') })
    const data = await response.json()
    assert.equal(response.status, 200)
    assert.equal(data.count, 1)
    assert.equal(data.visits[0].candidates[0].source, source)
    assert.ok(calls.some(url => url.includes('/SIA?')))
  } finally { globalThis.fetch = previous }
})

test('archive outage recovers three verified visits at the exact screenshot coordinates', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('Unavailable', { status: 502 })
  try {
    const response = await onRequestGet({ request: new Request('https://example.test/api/sky-observations?ra=269.444&dec=4.768&detector=2') })
    const data = await response.json()
    assert.equal(response.status, 200)
    assert.equal(data.recovery, true)
    assert.equal(data.visits.length, 3)
    assert.deepEqual(data.visits.map(visit => visit.date.slice(0, 10)), ['2025-08-25', '2026-03-15', '2026-08-18'])
    assert.ok(data.notice.includes('previously indexed'))
    assert.ok(data.visits.every(visit => visit.candidates.every(item => item.detector === 2)))
    for (const position of ['269.445&dec=4.768', '180&dec=30']) {
      const unknown = await onRequestGet({ request: new Request(`https://example.test/api/sky-observations?ra=${position}`) })
      assert.equal(unknown.status, 502, 'Do not replace arbitrary coordinates with a saved target')
    }
  } finally { globalThis.fetch = original }
})

test('an earlier successful arbitrary-coordinate search remains usable during an outage', async () => {
  const originalFetch = globalThis.fetch
  const originalCaches = globalThis.caches
  const saved = new Map()
  const tasks = []
  globalThis.caches = { default: {
    match: async key => saved.get(key.url)?.clone(),
    put: async (key, value) => { saved.set(key.url, value) },
  } }
  const request = new Request('https://example.test/api/sky-observations?ra=180&dec=30')
  try {
    globalThis.fetch = async () => new Response(`uri,time_bounds_lower,energy_bandpassname\n${source},61000,SPHEREx-D2\n`)
    assert.equal((await onRequestGet({ request, waitUntil: task => tasks.push(task) })).status, 200)
    await Promise.all(tasks)
    for (const key of saved.keys()) if (!key.endsWith('&recovery=1')) saved.delete(key)
    globalThis.fetch = async () => new Response('Unavailable', { status: 502 })
    const response = await onRequestGet({ request })
    const data = await response.json()
    assert.equal(response.status, 200)
    assert.equal(data.recovery, true)
    assert.deepEqual(data.coords, { ra: 180, dec: 30 })
    assert.equal(data.count, 1)
  } finally { globalThis.fetch = originalFetch; globalThis.caches = originalCaches }
})
