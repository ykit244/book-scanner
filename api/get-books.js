// Vercel Serverless Function to get book list
// File location: api/get-books.js

const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read the books config file
    const configPath = path.join(process.cwd(), 'config', 'books.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);

    return res.status(200).json({
      books: config.books || []
    });
  } catch (error) {
    console.error('Error reading books config:', error);
    // Return empty array if file doesn't exist
    return res.status(200).json({
      books: []
    });
  }
};