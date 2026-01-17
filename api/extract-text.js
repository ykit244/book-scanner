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
    const { image, boundingBox } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Remove data URL prefix if present (data:image/png;base64,)
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '');

    // Build the request for Vision API
    const visionRequest = {
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
    };

    // If bounding box is provided, crop the image or filter results
    // Note: Vision API doesn't support direct region selection, so we'll filter results by coordinates
    
    // Call Google Cloud Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [visionRequest]
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

    let extractedText = '';

    // If bounding box is provided, filter text annotations within the box
    if (boundingBox && textAnnotations.length > 1) {
      const { x1, y1, x2, y2 } = boundingBox;
      
      // Skip first annotation (full text) and check individual words
      const filteredAnnotations = textAnnotations.slice(1).filter(annotation => {
        const vertices = annotation.boundingPoly.vertices;
        if (!vertices || vertices.length === 0) return false;
        
        // Get center point of the text bounding box
        const centerX = vertices.reduce((sum, v) => sum + (v.x || 0), 0) / vertices.length;
        const centerY = vertices.reduce((sum, v) => sum + (v.y || 0), 0) / vertices.length;
        
        // Check if center is within selection box
        return centerX >= x1 && centerX <= x2 && centerY >= y1 && centerY <= y2;
      });
      
      // Combine filtered text
      extractedText = filteredAnnotations.map(a => a.description).join(' ');
    } else {
      // No bounding box - use full text
      extractedText = textAnnotations[0].description || '';
    }
    
    // Clean the text to remove problematic characters
    extractedText = extractedText
      .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '') // Remove control characters but keep newlines
      .trim();

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
};