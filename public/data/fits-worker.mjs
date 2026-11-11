import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v0.29.1/full/pyodide.mjs'

self.onmessage = async ({ data: { files, wavelength, detector } }) => {
  try {
    self.postMessage({ progress: 'Loading Python and Astropy…' })
    const python = await loadPyodide()
    const response = await fetch(new URL('prepare-fits.py', import.meta.url))
    if (!response.ok) throw new Error('Could not load the FITS processor.')
    await python.loadPackage(['astropy', 'scipy'])
    await python.runPythonAsync(await response.text())
    self.postMessage({ progress: 'Aligning observations on the same sky grid…' })
    const inputs = []
    for (const [index, file] of files.entries()) {
      const path = `/observation-${index}${file.name.toLowerCase().endsWith('.gz') ? '.fits.gz' : '.fits'}`
      python.FS.writeFile(path, new Uint8Array(await file.arrayBuffer()))
      inputs.push([path, file.name])
    }
    python.globals.set('upload_inputs', JSON.stringify(inputs))
    python.globals.set('upload_wavelength', wavelength)
    python.globals.set('upload_detector', detector)
    const result = await python.runPythonAsync('prepare_fits(json.loads(upload_inputs), upload_wavelength, upload_detector)')
    self.postMessage({ result: JSON.parse(result) })
  } catch (error) {
    const message = String(error?.message ?? error).trim().split('\n').at(-1)
    self.postMessage({ error: message.replace(/^ValueError: /, '') })
  }
}
