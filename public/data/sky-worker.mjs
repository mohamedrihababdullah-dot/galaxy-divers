import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v0.29.1/full/pyodide.mjs'

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(150000) })
  if (!response.ok) throw new Error('The archive could not return this cutout.')
  if (!response.body) throw new Error('Empty cutout response.')
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > 32 * 1024 * 1024) throw new Error('Cutout exceeds 32 MB.')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  if (new TextDecoder().decode(bytes.slice(0, 6)) !== 'SIMPLE') throw new Error('The archive returned an invalid FITS file.')
  return bytes
}

self.onmessage = async ({ data: { visits, coords } }) => {
  try {
    self.postMessage({ progress: 'Starting the FITS processor…' })
    const python = await loadPyodide()
    await python.loadPackage(['astropy', 'scipy'])
    for (const filename of ['prepare-fits.py', 'prepare-sky.py']) {
      const response = await fetch(new URL(filename, import.meta.url))
      if (!response.ok) throw new Error('The FITS processor could not load. Reload and retry.')
      await python.runPythonAsync(await response.text())
    }
    python.globals.set('sky_coords_json', JSON.stringify(coords))
    await python.runPythonAsync('sky_coords = json.loads(sky_coords_json)\nsky_candidates = []')
    const failures = []
    const tasks = visits.flatMap((visit, group) => visit.candidates.map(entry => ({ entry, group })))
    for (const [index, { entry, group }] of tasks.entries()) {
      const path = '/live-cutout.fits'
      self.postMessage({ progress: `Checking observation ${index + 1} of ${tasks.length} · ${entry.date.slice(0, 10)}` })
      try {
        const params = new URLSearchParams({ ra: String(coords.ra), dec: String(coords.dec), source: entry.source, size: '0.15' })
        const bytes = await download(`/api/sky-cutout?${params}`)
        python.FS.writeFile(path, bytes)
        python.globals.set('sky_entry_json', JSON.stringify(entry))
        python.globals.set('sky_visit', group)
        await python.runPythonAsync("sky_candidates.append(read_sky_candidate('/live-cutout.fits', json.loads(sky_entry_json), sky_coords, sky_visit))")
      } catch (error) {
        failures.push({ source: entry.source, error: String(error?.message ?? error).trim().split('\n').at(-1) })
      } finally {
        try { python.FS.unlink(path) } catch { /* Download may have failed before writing. */ }
      }
    }
    self.postMessage({ progress: 'Matching wavelengths and preparing your sky images…' })
    const result = JSON.parse(await python.runPythonAsync('finish_sky(sky_candidates, sky_coords)'))
    self.postMessage({ result: { ...result, failures } })
  } catch (error) {
    self.postMessage({ error: String(error?.message ?? error).trim().split('\n').at(-1).replace(/^ValueError: /, '') })
  }
}
