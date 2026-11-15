import { useEffect, useRef, useState } from 'react'
import { validateCube, type Coordinates, type Cube } from './studio-data'

export type UploadedObservation = { target: string; coords: Coordinates; cube: Cube }

export function ObservationUpload({ onLoad }: { onLoad: (data: UploadedObservation) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const worker = useRef<Worker | null>(null)
  const active = useRef(false)
  const isJson = files.length === 1 && /\.json$/i.test(files[0].name)

  useEffect(() => () => { worker.current?.terminate() }, [])

  function finish(message: string) {
    worker.current?.terminate()
    worker.current = null
    active.current = false
    setBusy(false)
    setMessage(message)
  }

  function load(data: UploadedObservation) {
    const { ra, dec } = data.coords
    if (typeof data.target !== 'string' || !data.target.trim() ||
      !Number.isFinite(ra) || ra < 0 || ra >= 360 || !Number.isFinite(dec) || dec < -90 || dec > 90) {
      throw new Error('Invalid target or sky coordinates in prepared JSON.')
    }
    onLoad({ ...data, cube: validateCube(data.cube) })
    const count = data.cube.epochs.length
    finish(count === 1 ? 'Observation ready to preview.' : `Loaded ${count} observations. Choose Blink or Difference to compare them.`)
  }

  async function prepare() {
    if (active.current) return
    if (!isJson && (files.length < 1 || files.length > 8 ||
      files.some(file => !/\.(fits?|fts)(\.gz)?$/i.test(file.name)))) {
      setMessage('Choose 1–8 FITS images, or one prepared observation JSON file.')
      return
    }
    if (files.some(file => file.size > 128 * 1024 * 1024)) {
      setMessage('Each file must be 128 MB or smaller. Try a FITS cutout for larger observations.')
      return
    }
    active.current = true
    setBusy(true)
    setMessage('Reading files…')
    try {
      if (isJson) {
        load(JSON.parse(await files[0].text()))
        return
      }
      const task = new Worker('/data/fits-worker.mjs', { type: 'module' })
      worker.current = task
      task.onmessage = ({ data }) => {
        if (data.progress) setMessage(data.progress)
        else if (data.error) finish(data.error)
        else {
          try { load(data.result) }
          catch (error) { finish(error instanceof Error ? error.message : 'Could not load the prepared observations.') }
        }
      }
      task.onerror = () => finish('The FITS processor could not start. Check your internet connection and retry.')
      task.postMessage({ files })
    } catch (error) {
      finish(error instanceof Error ? error.message : 'Could not read the selected files.')
    }
  }

  return <section className="panel upload-panel" aria-labelledby="upload-observations-title">
    <h3 id="upload-observations-title">Upload observations</h3>
    <form onSubmit={event => { event.preventDefault(); void prepare() }}>
      <p>Choose one calibrated FITS image to preview, or up to eight overlapping images to align, blink, and subtract. For the clearest motion comparison, use similar wavelengths from different dates. Files are processed in your browser.</p>
      <label>Observation files
        <input type="file" accept=".fits,.fit,.fts,.gz,.json" multiple disabled={busy}
          onChange={event => { setFiles(Array.from(event.target.files ?? [])); setMessage('') }} />
      </label>
      <div className="upload-actions">
        <button className="primary" disabled={!files.length || busy}>{files.length > 1 ? 'Compare in studio' : 'Preview in studio'}</button>
        <a href="https://irsa.ipac.caltech.edu/applications/spherex/search-spectral-images" target="_blank" rel="noopener noreferrer">
          Click Here To Download Nasa's Official Fits Data
        </a>
        {busy && !isJson && <button type="button" onClick={() => finish('Import canceled.')}>Cancel</button>}
      </div>
      {message && <p role="status">{message}</p>}
    </form>
  </section>
}

export function saveObservation(data: UploadedObservation) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'prepared-observations.json'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
