// Sends one or more screenshots to Gemini Vision and returns article metadata.
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

  const { imageBase64, mimeType, images } = req.body;

  // Accept either an images array or a single imageBase64 (legacy)
  const imageList = Array.isArray(images) && images.length > 0
    ? images
    : imageBase64 ? [{ imageBase64, mimeType }] : [];

  if (imageList.length === 0) {
    return res.status(400).json({ error: 'At least one image is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const imageParts = imageList.map(img => ({
    inline_data: {
      mime_type: img.mimeType || 'image/jpeg',
      data: img.imageBase64,
    },
  }));

  const promptText = imageList.length === 1
    ? 'Extract article metadata from this screenshot. Return a JSON object with these exact fields: title (string), author (string, empty if not visible), releaseDate (string in YYYY-MM-DD format, empty if not visible), language (one of: English, Chinese, Other), bodyText (all readable article text from the screenshot, preserve paragraphs with newlines). Return only the JSON object, no markdown.'
    : `These ${imageList.length} screenshots are consecutive pages of the same article, provided in reading order (first image is the top of the article). Extract the article metadata and combine the full body text. Important: consecutive screenshots often overlap — the last few lines of one screenshot repeat as the first few lines of the next. Carefully deduplicate these overlapping words or sentences so the final bodyText reads as one continuous, clean text without any repetition. Return a JSON object with these exact fields: title (string), author (string, empty if not visible), releaseDate (string in YYYY-MM-DD format, empty if not visible), language (one of: English, Chinese, Other), bodyText (full article text merged in order with all overlapping content removed, preserve paragraphs with newlines). Return only the JSON object, no markdown.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              ...imageParts,
              { text: promptText },
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