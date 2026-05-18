// Uploads a base64 image to Google Drive via service account and returns a public URL.
// Run via: POST /api/upload-to-drive

const crypto = require('crypto');
const { checkAuth } = require('./_auth');

function base64url(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const jwt = `${header}.${payload}.${base64url(sign.sign(credentials.private_key))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!checkAuth(req, res)) return;

  const { imageBase64, mimeType, filename } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!serviceAccountKey || !folderId) {
    return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_DRIVE_FOLDER_ID not configured' });
  }

  try {
    const credentials = JSON.parse(serviceAccountKey);
    const accessToken = await getAccessToken(credentials);

    const name = filename || `screenshot-${Date.now()}.jpg`;
    const mime = mimeType || 'image/jpeg';
    const boundary = 'bookmark_tool_boundary';

    const body = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}`,
      `--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: base64\r\n\r\n${imageBase64}`,
      `--${boundary}--`,
    ].join('\r\n');

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`,
        },
        body,
      }
    );
    const uploadData = await uploadRes.json();
    if (!uploadData.id) throw new Error(`Drive upload failed: ${JSON.stringify(uploadData)}`);

    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    return res.status(200).json({
      url: `https://drive.google.com/uc?export=view&id=${uploadData.id}`,
    });
  } catch (error) {
    console.error('Drive upload error:', error);
    return res.status(500).json({ error: error.message || 'Failed to upload to Google Drive' });
  }
};
