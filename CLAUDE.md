# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A local web tool for PDF reading with two main features:
1. **Translation prompt generation** - Select text in a PDF to auto-generate a context-aware English→Chinese translation prompt (copied to clipboard for use with Claude Web UI)
2. **Notion annotation** - Select text and add annotations that are saved directly to a Notion page

## Commands

```bash
# Setup environment
conda env create -f env.yml
conda activate pdf-translate-claude

# Run the server
python app.py
# Opens at http://localhost:5000
```

## Architecture

```
├── app.py              # Flask backend - routes for upload, PDF serving, Notion API
├── config.py           # Notion API credentials (NOTION_API_KEY, NOTION_PAGE_ID)
├── templates/
│   └── index.html      # Main page with PDF viewer container
├── static/
│   ├── css/style.css   # Styling including action popup and annotation modal
│   └── js/app.js       # PDF.js rendering, text selection handling, clipboard/Notion integration
└── uploads/            # Temporary PDF storage
```

**Frontend flow**: PDF.js renders PDF with text layer → user selects text → action popup appears → "Translate" copies prompt to clipboard OR "Annotate" opens modal to save to Notion

**Backend endpoints**:
- `POST /upload` - handles PDF file upload
- `GET /pdf/<filename>` - serves uploaded PDFs
- `POST /annotate` - saves annotation to Notion (formats selected text as bullet points)

## Key Implementation Details

- PDF rendering uses PDF.js from CDN (v3.11.174)
- Text selection context includes current page ± 1 adjacent pages
- Selected text is auto-formatted into sentences/bullet points when saved to Notion
- Translation prompts are designed for manual paste into Claude Web UI (no API calls)
