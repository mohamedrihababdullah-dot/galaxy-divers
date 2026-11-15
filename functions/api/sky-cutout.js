import { readPosition, imageUrl, fetchArchive } from '../lib/sky-archive.js'

export async function onRequestGet(context) {
  let url
  try {
    const params = new URL(context.request.url).searchParams
    const { ra, dec } = readPosition(params)
    const size = Number(params.get('size') ?? 0.15)
    if (!Number.isFinite(size) || size < 0.01 || size > 0.25) throw new Error('Choose a cutout width between 0.01 and 0.25 degrees.')
    url = new URL(imageUrl(params.get('source')))
    url.search = new URLSearchParams({ center: `${ra},${dec}`, size: String(size), gzip: 'false' }).toString()
  } catch (error) { return Response.json({ error: error.message }, { status: 400 }) }
  const cache = globalThis.caches?.default
  const cacheKey = new Request(url)
  const cached = await cache?.match(cacheKey)
  if (cached) return cached
  try {
    const upstream = await fetchArchive(url)
    if (/text\/html|text\/xml/.test(upstream.headers.get('content-type') ?? '')) {
      await upstream.body?.cancel()
      throw new Error('IRSA did not return a FITS cutout.')
    }
    const limit = 32 * 1024 * 1024
    if (Number(upstream.headers.get('content-length')) > limit) {
      await upstream.body?.cancel()
      throw new Error('Cutout exceeds the download limit.')
    }
    let bytes = 0
    const body = upstream.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
      bytes += chunk.byteLength
      if (bytes > limit) { controller.error(new Error('Cutout exceeds the download limit.')); return }
      controller.enqueue(chunk)
    } }))
    const response = new Response(body, { headers: { 'Content-Type': 'application/fits',
      'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } })
    if (cache) context.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}))
    return response
  } catch {
    return Response.json({ error: 'This IRSA cutout could not be retrieved. Try another exposure or retry.' }, { status: 502 })
  }
}
