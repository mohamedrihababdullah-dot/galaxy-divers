import { useEffect, useState } from 'react'
import type { Coordinates } from './studio-data'

const collections = [
  ['spherex_qr3', 'QR3 spectral images'],
  ['spherex_dr1', 'DR1 spectral images'],
  ['spherex_dr1_cube', 'DR1 all-sky cubes'],
  ['spherex_qr3_deep', 'QR3 deep fields'],
  ['spherex_dr1_deep', 'DR1 deep fields'],
] as const

type Product = { id: string; url: string; detector: string; mjd: number; released: string; size: number }

function parseProducts(csv: string) {
  const [header, ...lines] = csv.trim().split(/\r?\n/)
  const names = header.split(',')
  if (!names.includes('access_url') || !names.includes('obs_id')) throw new Error('Invalid archive response')
  const rows = lines.flatMap(line => {
    const cells = Array.from(line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g),
      ([, quoted, plain]) => quoted === undefined ? plain : quoted.replaceAll('""', '"'))
    const get = (name: string) => cells[names.indexOf(name)]?.trim() ?? ''
    const url = get('access_url')
    if (!url.startsWith('https://irsa.ipac.caltech.edu/')) return []
    return [{ id: get('obs_id'), url, detector: get('energy_bandpassname'), mjd: Number(get('t_min')),
      released: get('obs_release_date'), size: Number(get('access_estsize')) }]
  }).sort((a, b) => b.released.localeCompare(a.released) || b.mjd - a.mjd)
  return { rows: [...new Map(rows.map(product => [product.url, product])).values()], truncated: lines.length >= 1000 }
}

export function ArchiveSearch({ coords }: { coords: Coordinates }) {
  const [collection, setCollection] = useState<string>(collections[0][0])
  const [width, setWidth] = useState(3)
  const [search, setSearch] = useState(0)
  const [result, setResult] = useState<{ rows: Product[]; truncated: boolean }>()
  const [status, setStatus] = useState('')
  const radius = width * Math.SQRT2 / 120
  const params = new URLSearchParams({ ra: String(coords.ra), dec: String(coords.dec), radius: String(radius), collection })
  const query = params.toString()
  const irsa = new URL('https://irsa.ipac.caltech.edu/SIA')
  irsa.search = new URLSearchParams({ COLLECTION: collection, POS: `CIRCLE ${coords.ra} ${coords.dec} ${radius}`,
    MAXREC: '1000', RESPONSEFORMAT: 'HTML' }).toString()

  useEffect(() => {
    if (!search) return
    const controller = new AbortController()
    setStatus('Searching IRSA…')
    setResult(undefined)
    fetch(`/api/spherex?${query}`, { signal: controller.signal, cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Archive request failed')
      return response.text()
    }).then(parseProducts).then(data => {
      if (controller.signal.aborted) return
      setResult(data)
      setStatus(data.rows.length ? `${data.rows.length} products${data.truncated ? ' · IRSA result limit reached' : ''}` : 'No products found in this collection.')
    }).catch(() => {
      if (!controller.signal.aborted) setStatus('In-page search is unavailable. Open the query directly at IRSA.')
    })
    return () => controller.abort()
  }, [query, search])

  return <details className="panel archive-search">
    <summary>Search the latest SPHEREx releases</summary>
    <p>Search around {coords.ra.toFixed(5)}°, {coords.dec.toFixed(5)}°. Select a field width for the archive query and FITS cutouts.</p>
    <div className="dataset-controls">
      <label>IRSA collection<select value={collection} onChange={event => setCollection(event.target.value)}>
        {collections.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <label>Cutout width<select value={width} onChange={event => setWidth(Number(event.target.value))}>
        {[1, 3, 6, 12, 20].map(value => <option key={value} value={value}>{value}′</option>)}
      </select></label>
      <button type="button" onClick={() => setSearch(value => value + 1)}>Search IRSA</button>
      <a href={irsa.href} target="_blank" rel="noreferrer">Open query at IRSA ↗</a>
    </div>
    {status && <p role="status">{status}</p>}
    {result && result.rows.length > 0 && <div className="archive-results"><table>
      <thead><tr><th>Product</th><th>Detector</th><th>Observation start</th><th>FITS</th></tr></thead>
      <tbody>{result.rows.map(product => {
        const cutout = new URL(product.url)
        cutout.search = new URLSearchParams({ center: `${coords.ra},${coords.dec}`, size: String(width / 60) }).toString()
        const observed = product.mjd > 0 ? new Date((product.mjd - 40587) * 86400000).toISOString().slice(0, 10) : '—'
        return <tr key={product.url}><td>{product.id}</td><td>{product.detector}</td><td>{observed} UTC</td>
          <td><a href={product.url}>Original{product.size > 0 ? ` · ${(product.size / 1000).toFixed(0)} MB` : ''}</a>
            {collection !== 'spherex_dr1_cube' && <> · <a href={cutout.href}>Cutout</a></>}</td>
        </tr>
      })}</tbody>
    </table></div>}
  </details>
}
