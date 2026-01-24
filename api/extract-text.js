// Vercel Serverless Function to extract text using Google Cloud Vision API
// File location: api/extract-text.js

const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

module.exports = async function handler(req, res) {
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
    const { image, orientation } = req.body; // orientation can be 'vertical' or 'horizontal'

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Remove data URL prefix if present (data:image/png;base64,)
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '');

    // Call Google Cloud Vision API with DOCUMENT_TEXT_DETECTION for better structure
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
                  type: 'DOCUMENT_TEXT_DETECTION', // Better for structured text
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
    const fullTextAnnotation = visionData.responses[0]?.fullTextAnnotation;
    
    if (!fullTextAnnotation || !fullTextAnnotation.text) {
      return res.status(200).json({ 
        text: '',
        message: 'No text detected in image'
      });
    }

    let extractedText = '';

    // If vertical orientation is selected (traditional Chinese style)
    if (orientation === 'vertical') {
      // Get pages and blocks to reorder for vertical reading
      const pages = fullTextAnnotation.pages || [];
      
      if (pages.length > 0) {
        const blocks = pages[0].blocks || [];
        
        // Sort blocks by X coordinate (right to left) then Y coordinate (top to bottom)
        const sortedBlocks = blocks.sort((a, b) => {
          const aX = a.boundingBox?.vertices?.[0]?.x || 0;
          const bX = b.boundingBox?.vertices?.[0]?.x || 0;
          const aY = a.boundingBox?.vertices?.[0]?.y || 0;
          const bY = b.boundingBox?.vertices?.[0]?.y || 0;
          
          // Right to left (higher X first), then top to bottom (lower Y first)
          if (Math.abs(aX - bX) > 50) { // If blocks are in different columns
            return bX - aX; // Right to left
          }
          return aY - bY; // Top to bottom within same column
        });
        
        // Extract text from sorted blocks
        extractedText = sortedBlocks.map(block => {
          const paragraphs = block.paragraphs || [];
          return paragraphs.map(para => {
            const words = para.words || [];
            return words.map(word => {
              const symbols = word.symbols || [];
              return symbols.map(symbol => symbol.text || '').join('');
            }).join('');
          }).join('\n');
        }).join('\n\n');
      } else {
        extractedText = fullTextAnnotation.text;
      }
    } else {
      // Horizontal orientation (default) - use the text as-is
      extractedText = fullTextAnnotation.text;
    }

    // Clean the text to remove problematic characters
    extractedText = extractedText
      .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '') // Remove control characters but keep newlines
      .trim();

    return res.status(200).json({ 
      text: extractedText,
      confidence: fullTextAnnotation.pages?.[0]?.confidence || null
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};