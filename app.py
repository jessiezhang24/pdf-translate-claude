import os
import re
import requests
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from config import NOTION_API_KEY, NOTION_PAGE_ID


def format_text_to_bullets(text):
    """Split text into bullet points by sentences."""
    # Clean up the text - normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    # Split by sentence endings (. ! ?) followed by space or end
    sentences = re.split(r'(?<=[.!?])\s+', text)

    # Filter out empty strings and clean each sentence
    bullets = [s.strip() for s in sentences if s.strip()]

    return bullets

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max

ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        return jsonify({'url': f'/pdf/{filename}', 'filename': filename})

    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/pdf/<filename>')
def serve_pdf(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/annotate', methods=['POST'])
def save_annotation():
    data = request.json
    pdf_name = data.get('pdfName', 'Unknown PDF')
    page_num = data.get('pageNum', 0)
    selected_text = data.get('selectedText', '')
    annotation = data.get('annotation', '')

    # Build Notion blocks
    today = datetime.now().strftime('%Y-%m-%d %H:%M')

    blocks = [
        {
            "object": "block",
            "type": "divider",
            "divider": {}
        },
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{
                    "type": "text",
                    "text": {"content": f"📄 {pdf_name} | Page {page_num} | {today}"},
                    "annotations": {"bold": True, "color": "gray"}
                }]
            }
        }
    ]

    # Format selected text as bullet points
    bullets = format_text_to_bullets(selected_text)
    for bullet in bullets:
        blocks.append({
            "object": "block",
            "type": "bulleted_list_item",
            "bulleted_list_item": {
                "rich_text": [{
                    "type": "text",
                    "text": {"content": bullet}
                }]
            }
        })

    # Add annotation
    blocks.append({
        "object": "block",
        "type": "callout",
        "callout": {
            "rich_text": [{
                "type": "text",
                "text": {"content": annotation}
            }],
            "icon": {"type": "emoji", "emoji": "💬"}
        }
    })

    # Send to Notion
    headers = {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }

    response = requests.patch(
        f"https://api.notion.com/v1/blocks/{NOTION_PAGE_ID}/children",
        headers=headers,
        json={"children": blocks}
    )

    if response.status_code == 200:
        return jsonify({"success": True})
    else:
        return jsonify({"error": response.text}), 400

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    app.run(debug=True, port=5000)
