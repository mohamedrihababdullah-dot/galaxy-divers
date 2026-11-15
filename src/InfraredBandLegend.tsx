import { useState } from 'react'

// Nominal channel centers (µm) from the DR1 SPECTRAL_CHANNELS table,
// also stored in the Barnard’s Star DR1 spectrum cube.
const detectorWavelengths = [
  [0.753, 0.771, 0.790, 0.809, 0.828, 0.848, 0.868, 0.889, 0.910, 0.932, 0.955, 0.978, 1.001, 1.025, 1.050, 1.075, 1.102],
  [1.113, 1.139, 1.167, 1.195, 1.224, 1.254, 1.284, 1.315, 1.346, 1.378, 1.412, 1.446, 1.481, 1.517, 1.554, 1.592, 1.631],
  [1.656, 1.695, 1.735, 1.775, 1.818, 1.861, 1.905, 1.949, 1.995, 2.041, 2.089, 2.139, 2.189, 2.240, 2.292, 2.345, 2.399],
  [2.445, 2.506, 2.575, 2.646, 2.719, 2.794, 2.871, 2.951, 3.033, 3.118, 3.204, 3.293, 3.383, 3.476, 3.570, 3.667, 3.768],
  [3.833, 3.867, 3.901, 3.935, 3.970, 4.005, 4.040, 4.076, 4.112, 4.148, 4.184, 4.220, 4.257, 4.294, 4.331, 4.368, 4.405],
  [4.435, 4.467, 4.500, 4.533, 4.566, 4.600, 4.635, 4.669, 4.704, 4.739, 4.773, 4.808, 4.843, 4.879, 4.915, 4.951, 4.988],
]
const wavelengths = detectorWavelengths.flat()
const speedOfLight = 299.792458 // THz × µm

export function InfraredBandLegend() {
  const [selected, setSelected] = useState(0)
  const wavelength = wavelengths[selected]
  const channelsPerDetector = detectorWavelengths[0].length
  const describeBand = (index: number) => `Band ${index + 1} · ${wavelengths[index].toFixed(3)} µm · ${(speedOfLight / wavelengths[index]).toFixed(1)} THz`

  return <section className="panel infrared-legend" aria-labelledby="infrared-legend-title">
    <h2 id="infrared-legend-title">102 SPHEREx infrared bands</h2>
    <p>Each swatch assigns a visible color to an infrared band for reference. Select a swatch to see its nominal wavelength and frequency.</p>
    <div className="infrared-detectors">
      {detectorWavelengths.map((channels, detector) => <div key={detector}>
        <h3>Detector {detector + 1}</h3>
        <div className="infrared-swatches">
          {channels.map((_, index) => {
            const band = detector * channelsPerDetector + index
            return <button key={band} type="button" tabIndex={-1}
              title={describeBand(band)} aria-label={describeBand(band)} aria-pressed={selected === band}
              style={{ backgroundColor: `hsl(${285 * (1 - band / (wavelengths.length - 1))} 80% 60%)` }}
              onClick={() => setSelected(band)} />
          })}
        </div>
        <div className="infrared-endpoints">
          <span>{channels[0].toFixed(3)} µm</span>
          <span>{channels.at(-1)?.toFixed(3)} µm</span>
        </div>
      </div>)}
    </div>
    <label className="infrared-selection">
      <output htmlFor="infrared-band">{describeBand(selected)} · Detector {Math.floor(selected / channelsPerDetector) + 1}</output>
      <input id="infrared-band" type="range" min={0} max={wavelengths.length - 1} value={selected}
        aria-label="Infrared band" aria-valuetext={`Band ${selected + 1}, ${wavelength.toFixed(3)} micrometers, ${(speedOfLight / wavelength).toFixed(1)} terahertz`}
        onChange={event => setSelected(Number(event.target.value))} />
    </label>
  </section>
}
