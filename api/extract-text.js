// Vercel Serverless Function to extract text using Google Cloud Vision API
// File location: api/extract-text.js

const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

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

  // Check if API key is set
  if (!GOOGLE_VISION_API_KEY) {
    return res.status(500).json({ 
      error: 'Server configuration error',
      message: 'GOOGLE_VISION_API_KEY not set in environment variables'
    });
  }

  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Remove data URL prefix if present (data:image/png;base64,)
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '');

    // Call Google Cloud Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                  maxResults: 1
                }
              ],
              imageContext: {
                languageHints: ['en', 'zh-CN', 'zh-TW'] // English, Simplified Chinese, Traditional Chinese
              }
            }
          ]
        })
      }
    );

    const visionData = await visionResponse.json();

    if (!visionResponse.ok) {
      console.error('Vision API Error:', visionData);
      return res.status(visionResponse.status).json({ 
        error: 'Vision API error',
        details: visionData.error?.message || 'Unknown error'
      });
    }

    // Extract text from response
    const textAnnotations = visionData.responses[0]?.textAnnotations;
    
    if (!textAnnotations || textAnnotations.length === 0) {
      return res.status(200).json({ 
        text: '',
        message: 'No text detected in image'
      });
    }

    // First annotation contains all detected text
    const extractedText = textAnnotations[0].description;

    return res.status(200).json({ 
      text: extractedText,
      confidence: textAnnotations[0].confidence || null
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}