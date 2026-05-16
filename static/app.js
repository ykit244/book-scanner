let booksList = [];
let selectedOrientation = 'horizontal';
let capturedImages = [];

window.addEventListener('DOMContentLoaded', loadBooks);

async function loadBooks() {
    try {
        const response = await fetch('/api/get-books');
        const data = await response.json();
        booksList = data.books || [];

        const select = document.getElementById('book-title-select');
        select.innerHTML = '<option value="">Select a book...</option>';

        booksList.forEach(book => {
            const option = document.createElement('option');
            option.value = book;
            option.textContent = book;
            select.appendChild(option);
        });

        const otherOption = document.createElement('option');
        otherOption.value = 'other';
        otherOption.textContent = '📝 Other (Manual Input)';
        select.appendChild(otherOption);

    } catch (error) {
        console.error('Error loading books:', error);
        const select = document.getElementById('book-title-select');
        select.innerHTML = '<option value="other">📝 Manual Input</option>';
    }
}

function selectOrientation(orientation) {
    selectedOrientation = orientation;
    document.querySelectorAll('.orientation-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.orientation === orientation);
    });
}

function handleBookTitleChange() {
    const select = document.getElementById('book-title-select');
    const input = document.getElementById('book-title-input');
    if (select.value === 'other') {
        input.style.display = 'block';
        input.focus();
    } else {
        input.style.display = 'none';
        input.value = '';
    }
}

document.getElementById('camera-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        compressImage(file, function(compressedDataUrl) {
            capturedImages.push(compressedDataUrl);
            updateImagesPreview();
            document.getElementById('preview-section').style.display = 'block';
            document.getElementById('text-section').style.display = 'none';
            document.getElementById('book-title-section').style.display = 'none';
            document.getElementById('page-section').style.display = 'none';
            document.getElementById('notes-section').style.display = 'none';
            document.getElementById('status').textContent = '';
            hideMessages();
        });
    }
    e.target.value = '';
});

function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const MAX_WIDTH = 1600;
            const MAX_HEIGHT = 1600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function updateImagesPreview() {
    const grid = document.getElementById('images-grid');
    const imagesPreview = document.getElementById('images-preview');

    if (capturedImages.length === 0) {
        imagesPreview.style.display = 'none';
        return;
    }

    imagesPreview.style.display = 'block';
    grid.innerHTML = '';

    capturedImages.forEach((imageSrc, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'image-item';
        imageItem.innerHTML = `
            <img src="${imageSrc}" alt="Page ${index + 1}">
            <div class="image-number">${index + 1}</div>
            <button class="remove-image" onclick="removeImage(${index})">×</button>
        `;
        grid.appendChild(imageItem);
    });
}

function removeImage(index) {
    capturedImages.splice(index, 1);
    updateImagesPreview();
    if (capturedImages.length === 0) {
        document.getElementById('preview-section').style.display = 'none';
    }
}

function clearAllImages() {
    capturedImages = [];
    updateImagesPreview();
    document.getElementById('preview-section').style.display = 'none';
    document.getElementById('text-section').style.display = 'none';
    document.getElementById('book-title-section').style.display = 'none';
    document.getElementById('page-section').style.display = 'none';
    document.getElementById('notes-section').style.display = 'none';
}

async function processImages() {
    const btn = document.getElementById('process-btn');
    const status = document.getElementById('status');
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');

    if (capturedImages.length === 0) {
        showError('Please add at least one image first.');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Processing...';
    progressBar.style.display = 'block';
    hideMessages();

    let allExtractedText = '';

    try {
        for (let i = 0; i < capturedImages.length; i++) {
            const imageNum = i + 1;
            const totalImages = capturedImages.length;

            status.textContent = `Processing image ${imageNum} of ${totalImages}...`;
            progressFill.style.width = `${(i / totalImages) * 70}%`;

            const response = await fetch('/api/extract-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: capturedImages[i], orientation: selectedOrientation })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('API Error:', data);
                throw new Error(data.details || data.error || 'Failed to extract text');
            }

            const extractedText = data.text ? data.text.trim() : '';
            if (extractedText) {
                allExtractedText += allExtractedText ? '\n\n' + extractedText : extractedText;
            }
        }

        progressFill.style.width = '100%';

        if (!allExtractedText || allExtractedText.length < 3) {
            status.textContent = 'No text detected. Try taking clearer photos with better lighting.';
            document.getElementById('extracted-text').value = '';
            progressBar.style.display = 'none';
        } else {
            document.getElementById('extracted-text').value = allExtractedText;
            document.getElementById('text-section').style.display = 'block';
            document.getElementById('book-title-section').style.display = 'block';
            document.getElementById('page-section').style.display = 'block';
            document.getElementById('notes-section').style.display = 'block';
            status.textContent = `Successfully extracted text from ${capturedImages.length} image(s)!`;
            progressBar.style.display = 'none';
        }

    } catch (error) {
        status.textContent = 'Error: ' + error.message;
        console.error('OCR Error:', error);
        progressBar.style.display = 'none';
        showError('Failed to extract text. Please try again.');
    }

    btn.disabled = false;
    btn.textContent = '📝 Extract Text from All Images';
}

async function saveToNotion() {
    const text = document.getElementById('extracted-text').value;
    const notes = document.getElementById('notes-input').value;
    const pageNumber = document.getElementById('page-number').value;
    const bookTitleSelect = document.getElementById('book-title-select');
    const bookTitleInput = document.getElementById('book-title-input');
    const bookTitle = bookTitleSelect.value === 'other' ? bookTitleInput.value : bookTitleSelect.value;
    const saveBtn = document.getElementById('save-btn');

    if (!text && !notes) {
        showError('Please add some text or notes before saving.');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    hideMessages();

    try {
        const response = await fetch('/api/save-to-notion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                notes,
                pageNumber: pageNumber ? parseInt(pageNumber) : null,
                bookTitle
            })
        });

        const data = await response.json();

        if (response.ok) {
            showSuccess();
            capturedImages = [];
            updateImagesPreview();
            document.getElementById('extracted-text').value = '';
            document.getElementById('notes-input').value = '';
            document.getElementById('page-number').value = '';
            document.getElementById('book-title-select').value = '';
            document.getElementById('book-title-input').value = '';
            document.getElementById('preview-section').style.display = 'none';
            document.getElementById('text-section').style.display = 'none';
            document.getElementById('book-title-section').style.display = 'none';
            document.getElementById('page-section').style.display = 'none';
            document.getElementById('notes-section').style.display = 'none';
        } else {
            showError(data.error || 'Failed to save to Notion');
        }
    } catch (error) {
        console.error('Save error:', error);
        showError('Network error. Please check your connection and try again.');
    }

    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save to Notion';
}

function showSuccess() {
    const successMsg = document.getElementById('success-message');
    successMsg.style.display = 'block';
    setTimeout(() => { successMsg.style.display = 'none'; }, 5000);
}

function showError(message) {
    document.getElementById('error-text').textContent = message;
    document.getElementById('error-message').style.display = 'block';
}

function hideMessages() {
    document.getElementById('success-message').style.display = 'none';
    document.getElementById('error-message').style.display = 'none';
}

// ── Tab switching ──────────────────────────────────────────────
function switchTab(tab) {
    document.getElementById('tab-book').style.display = tab === 'book' ? 'block' : 'none';
    document.getElementById('tab-article').style.display = tab === 'article' ? 'block' : 'none';
    document.getElementById('tab-btn-book').classList.toggle('active', tab === 'book');
    document.getElementById('tab-btn-article').classList.toggle('active', tab === 'article');
}

// ── Article Bookmark ───────────────────────────────────────────
let articleBodyText = '';
let articleMediaUrls = [];

async function fetchArticle() {
    const url = document.getElementById('article-url').value.trim();
    if (!url) {
        showArticleError('Please enter a URL.');
        return;
    }

    const btn = document.getElementById('fetch-btn');
    const status = document.getElementById('article-status');
    btn.disabled = true;
    btn.textContent = 'Fetching…';
    status.textContent = 'Reading article…';
    document.getElementById('article-fields').style.display = 'none';
    hideArticleMessages();

    try {
        const response = await fetch('/api/fetch-article', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch article');
        }

        if (data.warning) {
            showArticleError(data.warning);
        }

        document.getElementById('article-title').value = data.title || '';
        document.getElementById('article-author').value = data.author || '';
        document.getElementById('article-date').value = data.releaseDate || '';
        document.getElementById('article-language').value = data.language || 'Other';

        articleBodyText = data.bodyText || '';
        articleMediaUrls = data.mediaUrls || [];
        document.getElementById('article-text-preview').value = articleBodyText;

        const lengthEl = document.getElementById('article-text-length');
        lengthEl.textContent = articleBodyText
            ? `~${articleBodyText.length.toLocaleString()} characters — will be saved to the Notion page body.`
            : 'No text extracted. You can paste the article text manually above.';

        document.getElementById('article-fields').style.display = 'block';
        status.textContent = '';

    } catch (error) {
        status.textContent = '';
        showArticleError(error.message || 'Failed to fetch article. Check the URL and try again.');
    }

    btn.disabled = false;
    btn.textContent = '🔍 Fetch Article';
}

async function saveArticleToNotion() {
    const saveBtn = document.getElementById('article-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    hideArticleMessages();

    try {
        const response = await fetch('/api/save-article-to-notion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: document.getElementById('article-url').value.trim(),
                title: document.getElementById('article-title').value.trim(),
                author: document.getElementById('article-author').value.trim(),
                releaseDate: document.getElementById('article-date').value,
                language: document.getElementById('article-language').value,
                category: document.getElementById('article-category').value,
                bodyText: articleBodyText,
                mediaUrls: articleMediaUrls,
            }),
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('article-success-message').style.display = 'block';
            setTimeout(() => {
                document.getElementById('article-success-message').style.display = 'none';
            }, 5000);
            document.getElementById('article-url').value = '';
            document.getElementById('article-category').value = 'General';
            document.getElementById('article-fields').style.display = 'none';
            articleBodyText = '';
            articleMediaUrls = [];
        } else {
            showArticleError(data.error || 'Failed to save to Notion.');
        }
    } catch (error) {
        showArticleError('Network error. Please check your connection and try again.');
    }

    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save to Notion';
}

function showArticleError(message) {
    document.getElementById('article-error-text').textContent = message;
    document.getElementById('article-error-message').style.display = 'block';
}

function hideArticleMessages() {
    document.getElementById('article-success-message').style.display = 'none';
    document.getElementById('article-error-message').style.display = 'none';
}