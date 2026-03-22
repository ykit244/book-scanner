# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Book Scanner is a web-based OCR app that captures book pages via camera, extracts text using Google Cloud Vision API, and saves results to a Notion database. It supports English, Simplified Chinese, and Traditional Chinese (including vertical text orientation).

## Development & Deployment

This project has **no build step** and **no npm dependencies to install**. It's a static HTML file + Vercel serverless functions.

**Deploy to Vercel:**
Vercel is connected to the GitHub repo and **auto-deploys on every push to main**. To deploy, commit and push your changes — no manual `vercel deploy` needed.

**Local development** requires the Vercel CLI to run serverless functions locally:
```bash
vercel dev
```

**Test the Vision API connection:**
```
GET /api/test-vision
```

## Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `GOOGLE_VISION_API_KEY` | Google Cloud Vision API key |
| `NOTION_TOKEN` | Notion integration token |
| `NOTION_DATABASE_ID` | Target Notion database ID |

Set these in the Vercel dashboard (not in code).

## Architecture

**Frontend:** Single file — `index.html` contains all HTML, CSS, and JavaScript inline. The UI is progressively revealed: camera capture → image preview → text extraction → save to Notion.

**Backend:** Four Vercel serverless functions in `/api/`:
- `extract-text.js` — POSTs base64 images to Google Vision API, handles vertical/horizontal text orientation, supports language hints
- `save-to-notion.js` — Creates Notion database entries with extracted text + metadata (book title, page number, notes)
- `get-books.js` — Reads `config/books.json` and returns the book list for the dropdown
- `test-vision.js` — Diagnostic endpoint to verify API credentials

**Book list:** `config/books.json` — edit this to add/remove books from the dropdown.

## Key Implementation Details

**Image compression** happens client-side before sending (max 1600×1600px, JPEG quality 0.85) to avoid payload-too-large errors.

**Vertical text orientation:** When selected, the Vision API response blocks are reordered right-to-left by X coordinate, then top-to-bottom — matching traditional Chinese reading order.

**Notion text limit:** The save function splits text into 2000-character chunks to respect Notion's property size limit.

**Multi-image support:** Multiple pages can be captured and processed in a single session; all extracted text is concatenated before saving.
