export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json()
    const { type = 'pageview', path, referrer, screenWidth, screenHeight, language, sessionId } = body

    const country = request.cf?.country || request.headers.get('cf-ipcountry') || 'Unknown'
    const city = request.cf?.city || 'Unknown'
    const region = request.cf?.region || 'Unknown'
    const continent = request.cf?.continent || 'Unknown'
    const timezone = request.cf?.timezone || 'Unknown'

    const ua = request.headers.get('user-agent') || ''
    const browser = parseBrowser(ua)
    const os = parseOS(ua)
    const deviceType = screenWidth && screenWidth < 768 ? 'mobile' : screenWidth && screenWidth < 1024 ? 'tablet' : 'desktop'

    const ip = request.headers.get('cf-connecting-ip') || ''
    const ipHash = await hashIP(ip + new Date().toISOString().slice(0, 10))

    await env.DB.prepare(
      `INSERT INTO analytics_events (type, path, referrer, country, city, region, continent, timezone, device_type, browser, os, screen_width, screen_height, language, ip_hash, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(type, path || '/', referrer || null, country, city, region, continent, timezone, deviceType, browser, os, screenWidth || null, screenHeight || null, language || null, ipHash, sessionId || null).run()

    return new Response('ok', { status: 204 })
  } catch (e) {
    return new Response('ok', { status: 204 })
  }
}

function parseBrowser(ua) {
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera'
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome'
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari'
  return 'Other'
}

function parseOS(ua) {
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Mac OS')) return 'macOS'
  if (ua.includes('Linux') && !ua.includes('Android')) return 'Linux'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  return 'Other'
}

async function hashIP(raw) {
  const data = new TextEncoder().encode(raw)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}
