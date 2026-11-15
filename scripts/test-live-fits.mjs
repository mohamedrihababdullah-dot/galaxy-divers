// Run with a local Pyodide 0.29.1 distribution (including astropy/scipy packages):
// node scripts/test-live-fits.mjs PATH/TO/pyodide.mjs
import fs from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

try {
  if (!process.argv[2]) throw new Error('Pass the path to a local Pyodide 0.29.1 module.')
  const runtime = path.resolve(process.argv[2])
  const { loadPyodide } = await import(pathToFileURL(runtime).href)
  const python = await loadPyodide({ indexURL: path.dirname(runtime) })
  await python.loadPackage(['astropy', 'scipy'])
  const root = new URL('../', import.meta.url)
  for (const filename of ['prepare-fits.py', 'prepare-sky.py']) {
    await python.runPythonAsync(await fs.readFile(new URL(`public/data/${filename}`, root), 'utf8'))
  }
  const manifest = JSON.parse(await fs.readFile(new URL('public/data/barnards-star/observations.json', root), 'utf8'))
  const inputs = []
  for (const [visit, survey] of manifest.surveys.entries()) {
    const entry = survey.observations.find(item => item.file.includes('detector-2'))
    const bytes = process.argv[3]
      ? await fs.readFile(path.join(process.argv[3], entry.file.replace(/\.gz$/, '')))
      : gunzipSync(await fs.readFile(new URL(`public/data/barnards-star/${entry.file}`, root)))
    const filename = `/visit-${visit}.fits`
    python.FS.writeFile(filename, bytes)
    inputs.push({ filename, visit, source: entry.source, id: entry.file })
  }
  python.globals.set('test_inputs_json', JSON.stringify(inputs))
  python.globals.set('test_coords_json', JSON.stringify(manifest.coords))
  const report = await python.runPythonAsync(`
coords = json.loads(test_coords_json)
inputs = json.loads(test_inputs_json)
outputs = []
for item in inputs:
    with fits.open(item["filename"]) as hdus:
        date = observation_date(hdus["IMAGE"].header, hdus[0].header)
        mjd = float(Time(date.rstrip("Z")).mjd)
    entry = {**item, "detector": 2, "mjd": mjd}
    result = read_sky_candidate(item["filename"], entry, coords, item["visit"])
    assert result["coverage"] >= .25
    assert len(result["planes"][0]) == 59 * 59
    assert result["fitsMetadata"]["wavelength"] > 0
    assert result["fitsMetadata"]["bandwidth"] > 0
    outputs.append(result)
    for wrong, position, reason in [({**entry, "detector": 6}, coords, "detector"),
                                    ({**entry, "mjd": mjd + 100}, coords, "date"),
                                    (entry, {"ra": 10, "dec": -60}, "coordinates")]:
        try:
            read_sky_candidate(item["filename"], wrong, position, item["visit"])
        except ValueError as error:
            assert reason in str(error), str(error)
        else:
            raise AssertionError("Invalid " + reason + " was accepted")
result = json.loads(finish_sky(outputs, coords))
assert len(result["images"]) == 3
assert [item["date"] for item in result["images"]] == sorted(item["date"] for item in result["images"])
grid, sky = sky_grid(coords)
center = SkyCoord(coords["ra"], coords["dec"], unit="deg")
assert sky[29, 29].separation(center).arcsec < 1e-6
assert sky[28, 29].dec.deg > sky[29, 29].dec.deg
assert sky[29, 28].ra.deg > sky[29, 29].ra.deg
for edge in [{"ra": 0., "dec": 0.}, {"ra": 359.9999, "dec": 89.999}, {"ra": 0., "dec": -90.}]:
    edge_grid, edge_sky = sky_grid(edge)
    assert np.isfinite(edge_sky.ra.deg).all() and np.isfinite(edge_sky.dec.deg).all()
    assert edge_sky[29, 29].separation(SkyCoord(edge["ra"], edge["dec"], unit="deg")).arcsec < 1e-6
json.dumps({"dates": [item["date"] for item in result["images"]],
            "coverage": [round(item["coverage"], 3) for item in result["images"]],
            "wavelengths": [item["fitsMetadata"]["wavelength"] for item in result["images"]],
            "checks": "Three real FITS files; date/detector/coverage rejection; center, orientation, RA wrap and poles"})
`)
  console.log(report)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
