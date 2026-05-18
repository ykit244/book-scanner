// Returns 200 if the auth cookie is valid, 401 otherwise
const { checkAuth } = require('./_auth');

module.exports = function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    if (!checkAuth(req, res)) return;
    return res.status(200).json({ ok: true });
};
