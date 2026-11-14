const archive = 'https://irsa.ipac.caltech.edu/SIA'
const releases = ['spherex_dr1', 'spherex_qr3', 'spherex_dr1_deep', 'spherex_qr3_deep', 'spherex_dr1_cube']

export async function onRequestGet({ request }) {
  const input = new URL(request.url).searchParams
  const ra = Number(input.get('ra'))
  const dec = Number(input.get('dec'))
  const radius = Number(input.get('radius'))
  const collection = input.get('collection')
  if (!input.get('ra') || !input.get('dec') || !(ra >= 0 && ra < 360) ||
      !(dec >= -90 && dec <= 90) || !(radius > 0 && radius <= 0.25) || !releases.includes(collection)) {
    return new Response('Invalid archive search.', { status: 400 })
  }

  const query = new URLSearchParams({
    COLLECTION: collection, POS: `CIRCLE ${ra} ${dec} ${radius.toFixed(6)}`, MAXREC: '1000', RESPONSEFORMAT: 'CSV',
  })
  try {
    const upstream = await fetch(`${archive}?${query.toString().replaceAll('+', '%20')}`, { signal: AbortSignal.timeout(25000) })
    if (!upstream.ok) throw new Error('Archive unavailable')
    return new Response(upstream.body, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    })
  } catch {
    return new Response('IRSA could not complete the search.', { status: 502 })
  }
}
