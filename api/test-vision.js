// Test endpoint to verify Google Vision API setup
// File location: api/test-vision.js

const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Check if API key is set
  if (!GOOGLE_VISION_API_KEY) {
    return res.status(500).json({ 
      success: false,
      error: 'GOOGLE_VISION_API_KEY not set in environment variables',
      hint: 'Add it in Vercel Settings → Environment Variables'
    });
  }

  // Test with a simple API call
  try {
    const response = await fetch(
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
                content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
              },
              features: [{ type: 'TEXT_DETECTION' }]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(200).json({
        success: false,
        error: 'API key is invalid or Vision API not enabled',
        details: data.error?.message || data,
        hints: [
          '1. Make sure Vision API is enabled in Google Cloud Console',
          '2. Check that billing is enabled (required even for free tier)',
          '3. Verify API key has no restrictions preventing Vision API access',
          '4. Wait a few minutes if you just created the API key'
        ]
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Google Vision API is working correctly!',
      apiKeyPrefix: GOOGLE_VISION_API_KEY.substring(0, 10) + '...',
      response: data
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to connect to Google Vision API',
      message: error.message,
      hint: 'Check your internet connection and API key'
    });
  }
};