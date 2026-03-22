const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_ARTICLE_DATABASE_ID;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!NOTION_TOKEN || !DATABASE_ID) {
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'NOTION_TOKEN or NOTION_ARTICLE_DATABASE_ID not set in environment variables.',
    });
  }

  try {
    const { url, title, author, releaseDate, language, category, bodyText } = req.body;

    const properties = {
      'Media Title': {
        title: [{ text: { content: title || 'Untitled' } }],
      },
      'Type': {
        select: { name: 'Article' },
      },
      'Category': {
        select: { name: category || 'General' },
      },
    };

    if (url) {
      properties['Link'] = { url };
    }

    if (language) {
      properties['Language'] = { select: { name: language } };
    }

    if (author) {
      properties['Author'] = {
        rich_text: [{ text: { content: author } }],
      };
    }

    if (releaseDate) {
      properties['Release Date'] = { date: { start: releaseDate } };
    }

    // First 100 chunks go in with the page creation
    const allChunks = bodyText ? chunkText(bodyText, 2000) : [];
    const firstBatch = allChunks.slice(0, 100).map(chunk => ({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: chunk } }],
      },
    }));

    const createResponse = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: DATABASE_ID },
        properties,
        children: firstBatch,
      }),
    });

    const data = await createResponse.json();

    if (!createResponse.ok) {
      console.error('Notion API error:', data);
      return res.status(createResponse.status).json({
        error: data.message || 'Failed to save to Notion',
        details: data,
      });
    }

    // Append remaining chunks in batches of 100 if article was very long
    if (allChunks.length > 100) {
      const pageId = data.id;
      for (let i = 100; i < allChunks.length; i += 100) {
        const batch = allChunks.slice(i, i + 100).map(chunk => ({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: chunk } }],
          },
        }));
        await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
          method: 'PATCH',
          headers: notionHeaders(),
          body: JSON.stringify({ children: batch }),
        });
      }
    }

    return res.status(200).json({ success: true, pageId: data.id, url: data.url });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

function notionHeaders() {
  return {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };
}

function chunkText(text, size) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.substring(i, i + size));
  }
  return chunks;
}
