import { useEffect, useRef, useState } from 'react'
import { validateCube, type Coordinates, type Cube } from './studio-data'

export type UploadedObservation = { target: string; coords: Coordinates; cube: Cube }

export function ObservationUpload({ onLoad }: { onLoad: (data: UploadedObservation) => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [wavelength, setWavelength] = useState('')
  const [detector, setDetector] = useState(1)
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
    finish(`Loaded ${data.cube.epochs.length} observations. Choose Blink or Difference to compare them.`)
  }

  async function prepare() {
    if (active.current) return
    if (!isJson && (files.length < 2 || files.length > 8 ||
      files.some(file => !/\.(fits?|fts)(\.gz)?$/i.test(file.name)))) {
      setMessage('Choose 2–8 FITS images, or one prepared observation JSON file.')
      return
    }
    const microns = Number(wavelength)
    if (!isJson && (!Number.isFinite(microns) || microns <= 0)) {
      setMessage('Enter the shared central wavelength in microns.')
      return
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > 128 * 1024 * 1024) {
      setMessage('The files exceed 128 MB in total. Download smaller FITS cutouts and try again.')
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
      task.postMessage({ files, wavelength: microns, detector })
    } catch (error) {
      finish(error instanceof Error ? error.message : 'Could not read the selected files.')
    }
  }

  return <details className="panel upload-panel">
    <summary>Upload observations</summary>
    <form onSubmit={event => { event.preventDefault(); void prepare() }}>
      <p>Choose calibrated FITS cutouts of the same field and wavelength from different dates, or open a saved observation JSON. Files are processed in this browser.</p>
      <label>Observation files
        <input type="file" accept=".fits,.fit,.fts,.gz,.json" multiple disabled={busy}
          onChange={event => { setFiles(Array.from(event.target.files ?? [])); setMessage('') }} />
      </label>
      {!isJson && <div className="studio-controls">
        <label>Shared wavelength (µm)
          <input type="number" min="0" step="any" value={wavelength} disabled={busy}
            onChange={event => setWavelength(event.target.value)} />
        </label>
        <label>Detector
          <select value={detector} disabled={busy} onChange={event => setDetector(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>}
      <div className="upload-actions">
        <button className="primary" disabled={!files.length || busy}>Load into studio</button>
        {busy && !isJson && <button type="button" onClick={() => finish('Import canceled.')}>Cancel</button>}
      </div>
      {message && <p role="status">{message}</p>}
    </form>
  </details>
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
