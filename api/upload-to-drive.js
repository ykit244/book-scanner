// Uploads a base64 image to Google Drive via service account and returns a public URL.
// Run via: POST /api/upload-to-drive

const { google } = require('googleapis');
const { Readable } = require('stream');

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

  const { imageBase64, mimeType, filename } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!serviceAccountKey || !folderId) {
    return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_DRIVE_FOLDER_ID not configured' });
  }

  try {
    const credentials = JSON.parse(serviceAccountKey);

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const buffer = Buffer.from(imageBase64, 'base64');
    const stream = Readable.from(buffer);

    const uploadRes = await drive.files.create({
      requestBody: {
        name: filename || `screenshot-${Date.now()}.jpg`,
        parents: [folderId],
      },
      media: {
        mimeType: mimeType || 'image/jpeg',
        body: stream,
      },
      fields: 'id',
    });

    const fileId = uploadRes.data.id;

    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    return res.status(200).json({
      url: `https://drive.google.com/uc?export=view&id=${fileId}`,
    });

  } catch (error) {
    console.error('Drive upload error:', error);
    return res.status(500).json({ error: error.message || 'Failed to upload to Google Drive' });
  }
};