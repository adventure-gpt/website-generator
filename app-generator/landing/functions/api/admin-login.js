export async function onRequestPost({ request, env }) {
  try {
    const { password } = await request.json()
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashHex = [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('')

    if (hashHex !== env.ADMIN_HASH) {
      return Response.json({ error: 'Invalid' }, { status: 401 })
    }

    const token = crypto.randomUUID() + '-' + crypto.randomUUID()
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await env.DB.prepare(
      'INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)'
    ).bind(token, expires).run()

    await env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < datetime('now')").run()

    return Response.json({ ok: true }, {
      headers: {
        'Set-Cookie': `admin_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`
      }
    })
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 })
  }
}
