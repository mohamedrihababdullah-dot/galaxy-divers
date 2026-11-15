import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v0.29.1/full/pyodide.mjs'

self.onmessage = async ({ data: { files } }) => {
  try {
    self.postMessage({ progress: 'Loading Python and Astropy…' })
    const python = await loadPyodide()
    const response = await fetch(new URL('prepare-fits.py', import.meta.url))
    if (!response.ok) throw new Error('Could not load the FITS processor.')
    await python.loadPackage(['astropy', 'scipy'])
    await python.runPythonAsync(await response.text())
    const inputs = files.map((file, index) => [
      `/observation-${index}${file.name.toLowerCase().endsWith('.gz') ? '.fits.gz' : '.fits'}`, file.name,
    ])
    python.globals.set('upload_inputs', JSON.stringify(inputs))
    await python.runPythonAsync('observations = prepare_fits(json.loads(upload_inputs))')
    for (const [index, file] of files.entries()) {
      self.postMessage({ progress: `Processing FITS image ${index + 1} of ${files.length}…` })
      const [path] = inputs[index]
      python.FS.writeFile(path, new Uint8Array(await file.arrayBuffer()))
      try {
        await python.runPythonAsync('next(observations)')
      } finally {
        python.FS.unlink(path)
      }
    }
    const result = await python.runPythonAsync('next(observations)')
    self.postMessage({ result: JSON.parse(result) })
  } catch (error) {
    const message = String(error?.message ?? error).trim().split('\n').at(-1)
    self.postMessage({ error: message.replace(/^ValueError: /, '') })
  }
}
