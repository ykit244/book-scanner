// POST: validate password → set HttpOnly auth cookie
// DELETE: clear cookie (logout)

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const secret = process.env.APP_SECRET;
    const isSecure = process.env.VERCEL_ENV === 'production';

    if (req.method === 'DELETE') {
        res.setHeader('Set-Cookie', 'app_auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
        return res.status(200).json({ ok: true });
    }

    if (req.method === 'POST') {
        const { password } = req.body;
        if (!secret || password !== secret) {
            return res.status(401).json({ error: 'Incorrect password' });
        }
        const maxAge = 60 * 60 * 24 * 365; // 1 year
        res.setHeader('Set-Cookie',
            `app_auth=${secret}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${isSecure ? '; Secure' : ''}`
        );
        return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
