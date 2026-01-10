// Vercel Serverless Function to save data to Notion
// File location: api/save-to-notion.js

const NOTION_TOKEN = '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';
const DATABASE_ID = '2e4c43e40672801ebafddb45e167081d';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, notes, pageNumber } = req.body;

    // Prepare properties for Notion
    const properties = {
      'Name': {
        title: [
          {
            text: {
              content: text ? text.substring(0, 100) : 'Untitled'
            }
          }
        ]
      }
    };

    // Add Text property if it exists
    if (text) {
      properties['Text'] = {
        rich_text: [
          {
            text: {
              content: text.substring(0, 2000) // Notion has a 2000 char limit per block
            }
          }
        ]
      };
    }

    // Add Notes property if it exists
    if (notes) {
      properties['Notes'] = {
        rich_text: [
          {
            text: {
              content: notes.substring(0, 2000)
            }
          }
        ]
      };
    }

    // Add Page Number property if it exists
    if (pageNumber !== null && pageNumber !== undefined) {
      properties['Page Number'] = {
        number: pageNumber
      };
    }

    // Call Notion API
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: { database_id: DATABASE_ID },
        properties: properties
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Notion API Error:', data);
      return res.status(response.status).json({ 
        error: data.message || 'Failed to save to Notion',
        details: data
      });
    }

    return res.status(200).json({ 
      success: true, 
      pageId: data.id,
      url: data.url
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}