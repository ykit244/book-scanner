// Shared auth check — required by every API handler
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
    if (cookies.app_auth !== secret) {
        res.status(401).json({ error: 'Unauthorized' });
        return false;
    }
    return true;
}

module.exports = { checkAuth };
