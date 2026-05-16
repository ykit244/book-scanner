// Sends a screenshot to Gemini 2.0 Flash Vision and returns article metadata.
// Run via: POST /api/analyze-screenshot

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

  const { imageBase64, mimeType } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType || 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                text: 'Extract article metadata from this screenshot. Return a JSON object with these exact fields: title (string), author (string, empty if not visible), releaseDate (string in YYYY-MM-DD format, empty if not visible), language (one of: English, Chinese, Other), bodyText (all readable article text from the screenshot, preserve paragraphs with newlines). Return only the JSON object, no markdown.',
              },
            ],
          }],
          generationConfig: {
            response_mime_type: 'application/json',
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini API error ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error('No content returned from Gemini');
    }

    const parsed = JSON.parse(rawText);
    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Analyze screenshot error:', error);
    return res.status(500).json({ error: error.message || 'Failed to analyse screenshot' });
  }
};