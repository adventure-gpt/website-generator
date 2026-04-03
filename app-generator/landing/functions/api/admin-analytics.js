export async function onRequestGet({ request, env }) {
  const cookies = request.headers.get('Cookie') || ''
  const tokenMatch = cookies.match(/admin_token=([^;]+)/)
  if (!tokenMatch) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const session = await env.DB.prepare(
    "SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')"
  ).bind(tokenMatch[1]).first()
  if (!session) return Response.json({ error: 'Session expired' }, { status: 401 })

  const url = new URL(request.url)
  const range = url.searchParams.get('range') || '7d'

  let dateFilter
  if (range === '24h') dateFilter = "datetime('now', '-1 day')"
  else if (range === '7d') dateFilter = "datetime('now', '-7 days')"
  else if (range === '30d') dateFilter = "datetime('now', '-30 days')"
  else if (range === '90d') dateFilter = "datetime('now', '-90 days')"
  else dateFilter = "datetime('now', '-7 days')"

  const [
    totals, pageviewsOverTime, topPages, topCountries, topCities,
    browsers, devices, osSplit, topReferrers, recentEvents,
    uniqueVisitors, downloadsOverTime, hourlyDistribution, languages,
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT COUNT(*) as total_events,
        SUM(CASE WHEN type = 'pageview' THEN 1 ELSE 0 END) as total_pageviews,
        SUM(CASE WHEN type = 'download' THEN 1 ELSE 0 END) as total_downloads,
        COUNT(DISTINCT ip_hash) as unique_visitors,
        COUNT(DISTINCT session_id) as unique_sessions
      FROM analytics_events WHERE created_at > ${dateFilter}
    `).first(),
    env.DB.prepare(`SELECT date(created_at) as date, COUNT(*) as count FROM analytics_events WHERE type = 'pageview' AND created_at > ${dateFilter} GROUP BY date(created_at) ORDER BY date ASC`).all(),
    env.DB.prepare(`SELECT path, COUNT(*) as count FROM analytics_events WHERE type = 'pageview' AND created_at > ${dateFilter} GROUP BY path ORDER BY count DESC LIMIT 10`).all(),
    env.DB.prepare(`SELECT country, COUNT(*) as count, COUNT(DISTINCT ip_hash) as visitors FROM analytics_events WHERE created_at > ${dateFilter} GROUP BY country ORDER BY count DESC LIMIT 20`).all(),
    env.DB.prepare(`SELECT city, country, COUNT(*) as count FROM analytics_events WHERE created_at > ${dateFilter} AND city != 'Unknown' GROUP BY city, country ORDER BY count DESC LIMIT 15`).all(),
    env.DB.prepare(`SELECT browser, COUNT(*) as count FROM analytics_events WHERE created_at > ${dateFilter} GROUP BY browser ORDER BY count DESC`).all(),
    env.DB.prepare(`SELECT device_type, COUNT(*) as count FROM analytics_events WHERE created_at > ${dateFilter} GROUP BY device_type ORDER BY count DESC`).all(),
    env.DB.prepare(`SELECT os, COUNT(*) as count FROM analytics_events WHERE created_at > ${dateFilter} GROUP BY os ORDER BY count DESC`).all(),
    env.DB.prepare(`SELECT referrer, COUNT(*) as count FROM analytics_events WHERE created_at > ${dateFilter} AND referrer IS NOT NULL AND referrer != '' GROUP BY referrer ORDER BY count DESC LIMIT 10`).all(),
    env.DB.prepare(`SELECT type, path, country, city, device_type, browser, os, created_at FROM analytics_events WHERE created_at > ${dateFilter} ORDER BY created_at DESC LIMIT 50`).all(),
    env.DB.prepare(`SELECT date(created_at) as date, COUNT(DISTINCT ip_hash) as visitors FROM analytics_events WHERE created_at > ${dateFilter} GROUP BY date(created_at) ORDER BY date ASC`).all(),
    env.DB.prepare(`SELECT date(created_at) as date, COUNT(*) as count FROM analytics_events WHERE type = 'download' AND created_at > ${dateFilter} GROUP BY date(created_at) ORDER BY date ASC`).all(),
    env.DB.prepare(`SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count FROM analytics_events WHERE created_at > ${dateFilter} GROUP BY hour ORDER BY hour ASC`).all(),
    env.DB.prepare(`SELECT language, COUNT(*) as count FROM analytics_events WHERE created_at > ${dateFilter} AND language IS NOT NULL GROUP BY language ORDER BY count DESC LIMIT 10`).all(),
  ])

  return Response.json({
    totals,
    pageviewsOverTime: pageviewsOverTime.results,
    topPages: topPages.results,
    topCountries: topCountries.results,
    topCities: topCities.results,
    browsers: browsers.results,
    devices: devices.results,
    osSplit: osSplit.results,
    topReferrers: topReferrers.results,
    recentEvents: recentEvents.results,
    uniqueVisitors: uniqueVisitors.results,
    downloadsOverTime: downloadsOverTime.results,
    hourlyDistribution: hourlyDistribution.results,
    languages: languages.results,
  })
}
