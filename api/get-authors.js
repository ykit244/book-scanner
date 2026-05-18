// Fetch unique Author values from the Notion articles database schema
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_ARTICLE_DATABASE_ID;
const { checkAuth } = require('./_auth');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    if (!checkAuth(req, res)) return;

    if (!NOTION_TOKEN || !DATABASE_ID) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
            },
        });

        if (!response.ok) {
            const err = await response.json();
            return res.status(response.status).json({ error: err.message || 'Notion API error' });
        }

        const data = await response.json();
        const options = data.properties?.Author?.multi_select?.options || [];
        const authors = options.map(o => o.name).sort((a, b) => a.localeCompare(b));
        return res.status(200).json({ authors });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch authors', message: error.message });
    }
};
