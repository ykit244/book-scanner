// Shared auth check — required by every API handler
const crypto = require('crypto');

const TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

function makeToken(secret) {
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', secret).update(String(ts)).digest('hex');
    return `${ts}.${sig}`;
}

function verifyToken(token, secret) {
    try {
        const dotIdx = token.indexOf('.');
        if (dotIdx < 0) return false;
        const ts = token.slice(0, dotIdx);
        const sig = token.slice(dotIdx + 1);
        const age = Math.floor(Date.now() / 1000) - parseInt(ts, 10);
        if (isNaN(age) || age < 0 || age > TOKEN_MAX_AGE) return false;
        const expected = crypto.createHmac('sha256', secret).update(ts).digest('hex');
        if (sig.length !== expected.length) return false;
        return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
        return false;
    }
}

function parseCookies(cookieHeader) {
    const result = {};
    (cookieHeader || '').split(';').forEach(pair => {
        const idx = pair.indexOf('=');
        if (idx < 0) return;
        result[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    });
    return result;
}

function checkAuth(req, res) {
    const secret = process.env.APP_SECRET;
    if (!secret) return true; // APP_SECRET not configured — open access

    const cookies = parseCookies(req.headers.cookie);
    if (!verifyToken(cookies.app_auth || '', secret)) {
        res.status(401).json({ error: 'Unauthorized' });
        return false;
    }
    return true;
}

module.exports = { checkAuth, makeToken };
