// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null;
let currentPage = 1;
let pageTexts = {}; // Store full text for each page
let currentFilename = '';
let currentSelectedText = '';

const pdfUpload = document.getElementById('pdf-upload');
const filenameDisplay = document.getElementById('filename-display');
const pdfViewer = document.getElementById('pdf-viewer');
const pdfControls = document.getElementById('pdf-controls');
const pageInfo = document.getElementById('page-info');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const notification = document.getElementById('notification');

// Action popup elements
const actionPopup = document.getElementById('action-popup');
const btnTranslate = document.getElementById('btn-translate');
const btnAnnotate = document.getElementById('btn-annotate');

// Modal elements
const annotationModal = document.getElementById('annotation-modal');
const selectedTextPreview = document.getElementById('selected-text-preview');
const annotationInput = document.getElementById('annotation-input');
const btnCancel = document.getElementById('btn-cancel');
const btnSave = document.getElementById('btn-save');

// File upload handler
pdfUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    currentFilename = file.name;
    filenameDisplay.textContent = file.name;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.url) {
            loadPdf(data.url);
        } else {
            showNotification('Upload failed: ' + data.error, 'error');
        }
    } catch (err) {
        showNotification('Upload failed: ' + err.message, 'error');
    }
});

// Load PDF
async function loadPdf(url) {
    try {
        pdfDoc = await pdfjsLib.getDocument(url).promise;
        pageTexts = {};
        currentPage = 1;
        pdfControls.classList.remove('hidden');
        updatePageInfo();
        await renderPage(currentPage);

        // Pre-extract text from all pages for context
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            pageTexts[i] = textContent.items.map(item => item.str).join(' ');
        }
    } catch (err) {
        showNotification('Failed to load PDF: ' + err.message, 'error');
    }
}

// Render a page
async function renderPage(pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    // Clear viewer
    pdfViewer.innerHTML = '';

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.style.width = viewport.width + 'px';
    wrapper.style.height = viewport.height + 'px';

    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Create text layer
    const textLayer = document.createElement('div');
    textLayer.className = 'text-layer';
    textLayer.style.width = viewport.width + 'px';
    textLayer.style.height = viewport.height + 'px';

    wrapper.appendChild(canvas);
    wrapper.appendChild(textLayer);
    pdfViewer.appendChild(wrapper);

    // Render PDF page
    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;

    // Render text layer for selection
    const textContent = await page.getTextContent();
    renderTextLayer(textContent, textLayer, viewport);
}

// Render text layer for selection
function renderTextLayer(textContent, container, viewport) {
    textContent.items.forEach(item => {
        const span = document.createElement('span');
        span.textContent = item.str;

        // Calculate position
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);

        span.style.left = tx[4] + 'px';
        span.style.top = (tx[5] - fontSize) + 'px';
        span.style.fontSize = fontSize + 'px';
        span.style.fontFamily = item.fontName || 'sans-serif';

        container.appendChild(span);
    });
}

// Page navigation
prevBtn.addEventListener('click', async () => {
    if (currentPage > 1) {
        currentPage--;
        updatePageInfo();
        await renderPage(currentPage);
    }
});

nextBtn.addEventListener('click', async () => {
    if (currentPage < pdfDoc.numPages) {
        currentPage++;
        updatePageInfo();
        await renderPage(currentPage);
    }
});

function updatePageInfo() {
    pageInfo.textContent = `Page ${currentPage} of ${pdfDoc.numPages}`;
}

// Handle text selection - show action popup
document.addEventListener('mouseup', (e) => {
    // Ignore if clicking on popup or modal
    if (actionPopup.contains(e.target) || annotationModal.contains(e.target)) {
        return;
    }

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText && selectedText.length > 0 && pdfDoc) {
        currentSelectedText = selectedText;

        // Position popup near the selection
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        actionPopup.style.left = rect.left + 'px';
        actionPopup.style.top = (rect.bottom + 10) + 'px';
        actionPopup.classList.remove('hidden');
    } else {
        hideActionPopup();
    }
});

// Hide popup when clicking elsewhere
document.addEventListener('mousedown', (e) => {
    if (!actionPopup.contains(e.target)) {
        hideActionPopup();
    }
});

function hideActionPopup() {
    actionPopup.classList.add('hidden');
}

// Translate button - copy prompt to clipboard
btnTranslate.addEventListener('click', () => {
    generatePrompt(currentSelectedText);
    hideActionPopup();
    window.getSelection().removeAllRanges();
});

// Annotate button - open modal
btnAnnotate.addEventListener('click', () => {
    hideActionPopup();
    selectedTextPreview.textContent = currentSelectedText;
    annotationInput.value = '';
    annotationModal.classList.remove('hidden');
    annotationInput.focus();
});

// Cancel annotation
btnCancel.addEventListener('click', () => {
    annotationModal.classList.add('hidden');
    window.getSelection().removeAllRanges();
});

// Save annotation to Notion
btnSave.addEventListener('click', async () => {
    const annotation = annotationInput.value.trim();
    if (!annotation) {
        showNotification('Please enter an annotation', 'error');
        return;
    }

    btnSave.textContent = 'Saving...';
    btnSave.disabled = true;

    try {
        const response = await fetch('/annotate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pdfName: currentFilename,
                pageNum: currentPage,
                selectedText: currentSelectedText,
                annotation: annotation
            })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Saved to Notion!');
            annotationModal.classList.add('hidden');
            window.getSelection().removeAllRanges();
        } else {
            showNotification('Failed to save: ' + data.error, 'error');
        }
    } catch (err) {
        showNotification('Failed to save: ' + err.message, 'error');
    } finally {
        btnSave.textContent = 'Save to Notion';
        btnSave.disabled = false;
    }
});

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !annotationModal.classList.contains('hidden')) {
        annotationModal.classList.add('hidden');
    }
});

// Generate translation prompt and copy to clipboard
async function generatePrompt(selectedText) {
    // Get context from current page and adjacent pages
    let context = '';
    const pagesToInclude = [currentPage - 1, currentPage, currentPage + 1];

    pagesToInclude.forEach(pageNum => {
        if (pageTexts[pageNum]) {
            context += `[Page ${pageNum}]\n${pageTexts[pageNum]}\n\n`;
        }
    });

    const prompt = `Please translate the following English text to Chinese.
Only translate the [SELECTED TEXT] portion, but use the surrounding context to ensure accurate translation.

=== CONTEXT (for reference only, do NOT translate) ===
${context.trim()}

=== TEXT TO TRANSLATE ===
${selectedText}

Please provide only the Chinese translation of the selected text above, nothing else.`;

    try {
        await navigator.clipboard.writeText(prompt);
        showNotification('Prompt copied to clipboard! Paste it in Claude Web UI.');
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = prompt;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification('Prompt copied to clipboard! Paste it in Claude Web UI.');
    }
}

// Show notification
function showNotification(message, type = 'success') {
    notification.textContent = message;
    notification.style.background = type === 'error' ? '#f44336' : '#4caf50';
    notification.classList.remove('hidden');

    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
}
