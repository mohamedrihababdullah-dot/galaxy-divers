export type Coordinates = { ra: number; dec: number }
export type Band = { wavelength: number; detector: number }
export type Plane = ArrayLike<number | null>
export type Cube = {
  width: number
  height: number
  unit: string
  bands: Band[]
  epochs: { date: string; source?: string; planes: Plane[] }[]
}

export function parseCoordinates(ra: string, dec: string): Coordinates | null {
  function angle(input: string, hours: boolean) {
    const value = input.trim().toLowerCase().replace(/−/g, '-')
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return Number(value)
    const match = value.match(hours
      ? /^(\d{1,2})h(?:(\d{1,2}(?:\.\d+)?)m)?(?:(\d{1,2}(?:\.\d+)?)s)?$/
      : /^([+-]?\d{1,2})[d°](?:(\d{1,2}(?:\.\d+)?)[m′'])?(?:(\d{1,2}(?:\.\d+)?)[s″"])?$/)
    if (!match) return NaN
    const minutes = Number(match[2] ?? 0)
    const seconds = Number(match[3] ?? 0)
    if (minutes >= 60 || seconds >= 60) return NaN
    const magnitude = Math.abs(Number(match[1])) + minutes / 60 + seconds / 3600
    return (match[1].startsWith('-') ? -1 : 1) * magnitude * (hours ? 15 : 1)
  }
  const coords = { ra: angle(ra, true), dec: angle(dec, false) }
  return coords.ra >= 0 && coords.ra < 360 && coords.dec >= -90 && coords.dec <= 90 ? coords : null
}

export function demoCube(target: string): Cube {
  const width = 220
  const height = 118
  const sky = new Float32Array(width * height)
  const variable = target === 'RW Aurigae'
  const isBarnard = target === 'Barnard’s Star'
  let seed = variable ? 719 : isBarnard ? 510 : 638
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  function addStar(pixels: Float32Array, x: number, y: number, strength: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue
        pixels[(y + dy) * width + x + dx] += strength * Math.exp(-(dx * dx + dy * dy) / 3.5)
      }
    }
  }
  for (let i = 0; i < 190; i++) {
    addStar(sky, Math.floor(random() * width), Math.floor(random() * height), .03 + random() ** 3 * .75)
  }
  const bands = Array.from({ length: 102 }, (_, index) => ({
    wavelength: .75 + 4.25 * index / 101,
    detector: 1 + Math.floor(index / 17),
  }))
  const dates = variable ? ['2025-05-01', '2025-11-01', '2026-05-01', '2026-11-01'] : ['2025-05-01', '2025-11-01']
  const epochs = dates.map((date, epoch) => ({
    date,
    planes: bands.map(({ wavelength }) => {
      const pixels = Float32Array.from(sky, (value) =>
        .006 + value * (1.15 - .1 * wavelength) + .006 * (random() - .5))
      if (variable) {
        addStar(pixels, width / 2, height / 2, [.93, .24, .52, .81][epoch] * (1.15 - .1 * wavelength))
      } else {
        addStar(pixels, (isBarnard ? 92 : 105) + epoch * 9, (isBarnard ? 64 : 59) - epoch * 3,
          .18 + .72 * Math.exp(-((wavelength - (isBarnard ? 1.25 : 3.7)) ** 2) / 1.2))
      }
      return pixels
    }),
  }))
  return { width, height, bands, epochs, unit: 'simulated units' }
}

export function validateCube(cube: Cube): Cube {
  const { width, height, unit, bands, epochs } = cube
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
    typeof unit !== 'string' || !Array.isArray(bands) || !bands.length ||
    bands.some(band => !Number.isFinite(band.wavelength) || band.wavelength <= 0 ||
      !Number.isInteger(band.detector) || band.detector < 1 || band.detector > 6) ||
    !Array.isArray(epochs) || epochs.length < 2 || epochs.some(epoch =>
      !Number.isFinite(Date.parse(epoch.date)) || !Array.isArray(epoch.planes) ||
      epoch.planes.length !== bands.length || epoch.planes.some(plane =>
        !Array.isArray(plane) || plane.length !== width * height ||
        plane.some(value => value !== null && !Number.isFinite(value))))) {
    throw new Error('Invalid observation cube')
  }
  return cube
}

export function stack(planes: Plane[], indices: number[], size: number) {
  return Float32Array.from({ length: size }, (_, pixel) => {
    let sum = 0
    let count = 0
    for (const index of indices) {
      const value = planes[index][pixel]
      if (value === null || !Number.isFinite(value)) continue
      sum += value
      count++
    }
    return count ? sum / count : NaN
  })
}
