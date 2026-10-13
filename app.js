/* ============================================
   FreelancerAI — Application Logic
   Local-First Invoice & Receipt Sorter
   Powered by Tesseract.js (Open-Source OCR)
   ============================================ */

// ---- State Management ----
const AppState = {
    receipts: JSON.parse(localStorage.getItem('freelancerAI_receipts') || '[]'),
    currentView: 'upload',
    editingId: null,
    ocrWorker: null,
    isProcessing: false,
};

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initNavigation();
    initUploadZone();
    renderDashboard();
    renderReceiptsTable();
    updateStats();

    // Show results if we have existing data
    if (AppState.receipts.length > 0) {
        showResults();
    }
});

// ---- Navigation ----
function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.classList.add('active');
        // Re-trigger animation
        targetView.style.animation = 'none';
        targetView.offsetHeight; // force reflow
        targetView.style.animation = '';
    }

    AppState.currentView = viewName;

    // Refresh dashboard data when switching to it
    if (viewName === 'dashboard') {
        renderDashboard();
        renderReceiptsTable();
        updateStats();
    }
}

// ---- Upload Zone ----
function initUploadZone() {
    const zone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');

    // Click to upload
    zone.addEventListener('click', () => fileInput.click());

    // Drag & drop
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) processFiles(files);
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) processFiles(files);
        fileInput.value = ''; // Reset for re-upload of same file
    });

    // Clear all button
    document.getElementById('clear-all-btn').addEventListener('click', () => {
        if (confirm('Clear all extracted receipts? This cannot be undone.')) {
            AppState.receipts = [];
            saveState();
            document.getElementById('recent-section').style.display = 'none';
            document.getElementById('results-grid').innerHTML = '';
            updateStats();
            renderDashboard();
            renderReceiptsTable();
            showToast('All receipts cleared', 'info');
        }
    });
}

// ---- File Processing Pipeline ----
async function processFiles(files) {
    const processingSection = document.getElementById('processing-section');
    const processingList = document.getElementById('processing-list');
    processingSection.style.display = 'block';
    processingList.innerHTML = '';

    // Set status
    setAIStatus('processing');

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const itemId = `proc-${Date.now()}-${i}`;

        // Add processing item
        const itemEl = createProcessingItem(file.name, itemId);
        processingList.appendChild(itemEl);
        lucide.createIcons({ nodes: [itemEl] });

        try {
            // Step 1: Read image
            updateProgress(itemId, 10, 'Reading image...');
            const imageUrl = await readFileAsDataURL(file);

            // Step 2: Run OCR
            updateProgress(itemId, 30, 'Running OCR...');
            const ocrText = await runOCR(imageUrl, (progress) => {
                const pct = 30 + Math.round(progress * 50);
                updateProgress(itemId, pct, 'Extracting text...');
            });

            // Step 3: AI Parse
            updateProgress(itemId, 85, 'AI parsing...');
            const parsed = parseReceiptData(ocrText);

            // Step 4: Store result
            updateProgress(itemId, 100, 'Done ✓');
            const receipt = {
                id: generateId(),
                ...parsed,
                rawText: ocrText,
                fileName: file.name,
                createdAt: new Date().toISOString(),
                thumbnail: imageUrl,
            };
            AppState.receipts.push(receipt);
            saveState();

            // Show result card
            addResultCard(receipt);

            showToast(`Extracted: ${parsed.vendor || file.name}`, 'success');
        } catch (err) {
            console.error('OCR Error:', err);
            updateProgress(itemId, 100, 'Failed ✗');
            showToast(`Failed to process ${file.name}`, 'error');
        }
    }

    setAIStatus('ready');
    updateStats();
    renderDashboard();
    renderReceiptsTable();

    // Auto-hide processing after delay
    setTimeout(() => {
        processingSection.style.display = 'none';
        processingList.innerHTML = '';
    }, 2000);
}

function createProcessingItem(fileName, id) {
    const div = document.createElement('div');
    div.className = 'processing-item';
    div.id = id;
    div.innerHTML = `
        <i data-lucide="file-image" style="width:20px;height:20px;color:var(--accent-primary-light);flex-shrink:0;"></i>
        <span class="file-name">${escapeHtml(fileName)}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div>
        <span class="status-label">Queued...</span>
    `;
    return div;
}

function updateProgress(itemId, percent, label) {
    const item = document.getElementById(itemId);
    if (!item) return;
    const fill = item.querySelector('.progress-fill');
    const statusLabel = item.querySelector('.status-label');
    if (fill) fill.style.width = `${percent}%`;
    if (statusLabel) statusLabel.textContent = label;
}

// ---- OCR Engine (Tesseract.js) ----
async function runOCR(imageUrl, onProgress) {
    const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
            if (m.status === 'recognizing text' && onProgress) {
                onProgress(m.progress || 0);
            }
        }
    });

    const result = await worker.recognize(imageUrl);
    await worker.terminate();
    return result.data.text;
}

// ---- Intelligent Receipt Parser (Rule-Based AI) ----
function parseReceiptData(rawText) {
    const text = rawText.trim();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    return {
        vendor: extractVendor(lines, text),
        date: extractDate(text),
        amount: extractAmount(text, lines),
        category: classifyCategory(text, lines),
        items: extractLineItems(lines),
        taxAmount: extractTax(text),
        subtotal: extractSubtotal(text),
    };
}

function extractVendor(lines, fullText) {
    // Strategy: Vendor is usually the first meaningful line(s)
    // Skip very short or numeric-only lines
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i];
        // Skip lines that are mostly numbers, dates, or very short
        if (line.length < 3) continue;
        if (/^\d[\d\s.,-/]*$/.test(line)) continue;
        if (/^(receipt|invoice|bill|order|transaction|date|time|tel|phone|fax)/i.test(line)) continue;
        if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line)) continue;
        // This is likely the vendor name
        return titleCase(line.substring(0, 60));
    }
    return 'Unknown Vendor';
}

function extractDate(text) {
    // Multiple date format patterns
    const patterns = [
        // MM/DD/YYYY or MM-DD-YYYY
        /(\d{1,2})[/-](\d{1,2})[/-](20\d{2}|\d{2})/,
        // YYYY-MM-DD (ISO)
        /(20\d{2})[/-](\d{1,2})[/-](\d{1,2})/,
        // Month DD, YYYY
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2}),?\s*(20\d{2})/i,
        // DD Month YYYY
        /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s*(20\d{2})/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            try {
                // Try to construct a valid date
                const dateStr = match[0];
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                    return d.toISOString().split('T')[0];
                }
                // For MM/DD/YY format
                if (match[1] && match[2] && match[3]) {
                    let year = parseInt(match[3]);
                    if (year < 100) year += 2000;
                    const month = parseInt(match[1]) - 1;
                    const day = parseInt(match[2]);
                    const dt = new Date(year, month, day);
                    if (!isNaN(dt.getTime())) {
                        return dt.toISOString().split('T')[0];
                    }
                }
            } catch (e) { /* continue */ }
        }
    }
    // Default to today
    return new Date().toISOString().split('T')[0];
}

function extractAmount(text, lines) {
    // Look for total amount with various keywords
    const totalPatterns = [
        /(?:total|grand\s*total|amount\s*due|balance\s*due|total\s*due|total\s*amount|net\s*total)\s*[:=]?\s*\$?\s*(\d{1,6}[.,]\d{2})/gi,
        /\$\s*(\d{1,6}[.,]\d{2})\s*(?:total|due)/gi,
    ];

    let maxAmount = 0;
    let totalFound = false;

    for (const pattern of totalPatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const val = parseFloat(match[1].replace(',', '.'));
            if (!isNaN(val) && val > maxAmount) {
                maxAmount = val;
                totalFound = true;
            }
        }
    }

    if (totalFound) return maxAmount;

    // Fallback: find the largest dollar amount
    const allAmounts = [];
    const amountRegex = /\$\s*(\d{1,6}[.,]\d{2})/g;
    let m;
    while ((m = amountRegex.exec(text)) !== null) {
        allAmounts.push(parseFloat(m[1].replace(',', '.')));
    }

    // Also check for amounts without dollar sign on lines that look like totals
    for (const line of lines) {
        if (/total|amount|due|balance/i.test(line)) {
            const numMatch = line.match(/(\d{1,6}[.,]\d{2})\s*$/);
            if (numMatch) {
                allAmounts.push(parseFloat(numMatch[1].replace(',', '.')));
            }
        }
    }

    if (allAmounts.length > 0) {
        return Math.max(...allAmounts);
    }

    // Last resort: any number that looks like currency
    const lastResort = text.match(/(\d{1,6}\.\d{2})/);
    return lastResort ? parseFloat(lastResort[1]) : 0;
}

function extractTax(text) {
    const taxPatterns = [
        /(?:tax|gst|hst|vat|sales\s*tax)\s*[:=]?\s*\$?\s*(\d{1,6}[.,]\d{2})/gi,
    ];
    for (const pattern of taxPatterns) {
        const match = pattern.exec(text);
        if (match) return parseFloat(match[1].replace(',', '.'));
    }
    return null;
}

function extractSubtotal(text) {
    const subPatterns = [
        /(?:subtotal|sub[\s-]*total)\s*[:=]?\s*\$?\s*(\d{1,6}[.,]\d{2})/gi,
    ];
    for (const pattern of subPatterns) {
        const match = pattern.exec(text);
        if (match) return parseFloat(match[1].replace(',', '.'));
    }
    return null;
}

function extractLineItems(lines) {
    const items = [];
    const itemPattern = /^(.+?)\s+\$?\s*(\d{1,6}\.\d{2})\s*$/;
    for (const line of lines) {
        if (/total|subtotal|tax|change|cash|card|payment/i.test(line)) continue;
        const match = line.match(itemPattern);
        if (match) {
            items.push({
                name: match[1].trim(),
                price: parseFloat(match[2])
            });
        }
    }
    return items;
}

function classifyCategory(text, lines) {
    const lowerText = text.toLowerCase();
    const categories = {
        'Food & Dining': [
            'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'food', 'dining',
            'starbucks', 'mcdonald', 'subway', 'chipotle', 'doordash', 'grubhub',
            'uber eats', 'ubereats', 'lunch', 'dinner', 'breakfast', 'bakery',
            'sushi', 'thai', 'chinese', 'mexican', 'indian', 'meal', 'kitchen',
            'diner', 'grill', 'bar', 'pub', 'brunch', 'snack', 'smoothie',
            'juice', 'tea house', 'boba', 'ice cream', 'dessert', 'catering'
        ],
        'Transportation': [
            'uber', 'lyft', 'taxi', 'gas', 'fuel', 'petrol', 'diesel', 'parking',
            'toll', 'transit', 'metro', 'bus', 'subway fare', 'airline', 'flight',
            'car rental', 'hertz', 'avis', 'enterprise', 'shell', 'exxon',
            'chevron', 'bp', 'speedway', 'citgo', 'sunoco', 'valero'
        ],
        'Office Supplies': [
            'staples', 'office depot', 'officemax', 'paper', 'printer', 'ink',
            'toner', 'pen', 'notebook', 'binder', 'folder', 'desk', 'chair',
            'monitor stand', 'usb', 'cable', 'mouse', 'keyboard', 'supplies'
        ],
        'Software & Subscriptions': [
            'software', 'subscription', 'saas', 'license', 'annual', 'monthly',
            'adobe', 'microsoft', 'google', 'aws', 'azure', 'heroku', 'github',
            'slack', 'zoom', 'notion', 'figma', 'canva', 'dropbox', 'icloud',
            'spotify', 'netflix', 'hulu', 'app store', 'play store', 'digital'
        ],
        'Travel': [
            'hotel', 'motel', 'airbnb', 'booking.com', 'expedia', 'marriott',
            'hilton', 'hyatt', 'lodging', 'accommodation', 'resort', 'inn',
            'travel', 'trip', 'vacation', 'flight', 'baggage', 'luggage'
        ],
        'Utilities': [
            'electric', 'electricity', 'water', 'gas bill', 'internet', 'cable',
            'phone bill', 'cellular', 'verizon', 'at&t', 'comcast', 'spectrum',
            'utility', 'power', 'heating', 'cooling', 'waste', 'sewage'
        ],
        'Professional Services': [
            'legal', 'attorney', 'lawyer', 'accountant', 'cpa', 'consultant',
            'consulting', 'coaching', 'therapy', 'dentist', 'doctor', 'medical',
            'health', 'insurance', 'payroll', 'bookkeeping', 'tax prep'
        ],
        'Marketing': [
            'advertising', 'marketing', 'facebook ads', 'google ads', 'seo',
            'social media', 'print', 'business card', 'brochure', 'flyer',
            'banner', 'promotion', 'campaign', 'ad spend', 'mailchimp'
        ],
        'Equipment': [
            'computer', 'laptop', 'macbook', 'dell', 'lenovo', 'hp', 'camera',
            'microphone', 'tripod', 'lighting', 'monitor', 'display', 'server',
            'hardware', 'router', 'switch', 'appliance', 'machine', 'tool'
        ],
    };

    let bestCategory = 'Other';
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(categories)) {
        let score = 0;
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                score += keyword.length; // Longer matches = higher confidence
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestCategory = category;
        }
    }

    return bestCategory;
}

// ---- Results Display ----
function showResults() {
    const section = document.getElementById('recent-section');
    const grid = document.getElementById('results-grid');
    section.style.display = 'block';
    grid.innerHTML = '';

    // Show most recent first
    const sorted = [...AppState.receipts].reverse();
    sorted.forEach(receipt => addResultCard(receipt, false));
}

function addResultCard(receipt, prepend = true) {
    const section = document.getElementById('recent-section');
    const grid = document.getElementById('results-grid');
    section.style.display = 'block';

    const card = document.createElement('div');
    card.className = 'result-card';
    card.id = `card-${receipt.id}`;
    card.innerHTML = `
        <div class="result-card-header">
            <span class="result-category-badge">${escapeHtml(receipt.category)}</span>
            <span class="result-amount">$${formatAmount(receipt.amount)}</span>
        </div>
        <div class="result-card-body">
            <div class="result-field">
                <span class="result-field-label">Vendor</span>
                <span class="result-field-value">${escapeHtml(receipt.vendor || 'Unknown')}</span>
            </div>
            <div class="result-field">
                <span class="result-field-label">Date</span>
                <span class="result-field-value">${formatDate(receipt.date)}</span>
            </div>
            ${receipt.taxAmount ? `
            <div class="result-field">
                <span class="result-field-label">Tax</span>
                <span class="result-field-value">$${formatAmount(receipt.taxAmount)}</span>
            </div>
            ` : ''}
            ${receipt.items && receipt.items.length > 0 ? `
            <div class="result-field">
                <span class="result-field-label">Items</span>
                <span class="result-field-value">${receipt.items.length} line items</span>
            </div>
            ` : ''}
        </div>
        <div class="result-card-actions">
            <button class="btn-ghost" onclick="openEditModal('${receipt.id}')">
                <i data-lucide="pencil"></i> Edit
            </button>
            <button class="btn-ghost" onclick="viewRawText('${receipt.id}')">
                <i data-lucide="eye"></i> Raw Text
            </button>
            <button class="btn-icon danger" onclick="deleteReceipt('${receipt.id}')" title="Delete">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `;

    if (prepend) {
        grid.prepend(card);
    } else {
        grid.appendChild(card);
    }
    lucide.createIcons({ nodes: [card] });
}

// ---- Dashboard Rendering ----
function updateStats() {
    const receipts = AppState.receipts;
    const total = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
    const count = receipts.length;
    const avg = count > 0 ? total / count : 0;
    const categories = new Set(receipts.map(r => r.category)).size;

    animateValue('stat-total-value', `$${formatAmount(total)}`);
    animateValue('stat-count-value', count.toString());
    animateValue('stat-avg-value', `$${formatAmount(avg)}`);
    animateValue('stat-categories-value', categories.toString());
}

function animateValue(elementId, newValue) {
    const el = document.getElementById(elementId);
    if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(5px)';
        setTimeout(() => {
            el.textContent = newValue;
            el.style.transition = 'all 0.3s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, 100);
    }
}

function renderDashboard() {
    renderCategoryBars();
    renderTimeline();
    updateFilterOptions();
}

function renderCategoryBars() {
    const container = document.getElementById('category-bars');
    const receipts = AppState.receipts;

    if (receipts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="bar-chart-3"></i>
                <p>Scan receipts to see category breakdown</p>
            </div>
        `;
        lucide.createIcons({ nodes: [container] });
        return;
    }

    // Group by category
    const categoryTotals = {};
    receipts.forEach(r => {
        const cat = r.category || 'Other';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + (r.amount || 0);
    });

    const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    const maxAmount = Math.max(...sorted.map(([, v]) => v), 1);

    container.innerHTML = sorted.map(([cat, amount]) => {
        const pct = Math.round((amount / maxAmount) * 100);
        return `
            <div class="category-bar-item" data-category="${escapeHtml(cat)}">
                <div class="category-bar-info">
                    <span class="category-bar-name">${escapeHtml(cat)}</span>
                    <span class="category-bar-amount">$${formatAmount(amount)}</span>
                </div>
                <div class="category-bar-track">
                    <div class="category-bar-fill" style="width: 0%;" data-width="${pct}%"></div>
                </div>
            </div>
        `;
    }).join('');

    // Animate bars in
    requestAnimationFrame(() => {
        container.querySelectorAll('.category-bar-fill').forEach(bar => {
            setTimeout(() => {
                bar.style.width = bar.dataset.width;
            }, 100);
        });
    });
}

function renderTimeline() {
    const container = document.getElementById('timeline-chart');
    const receipts = AppState.receipts;

    if (receipts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="calendar-days"></i>
                <p>Scan receipts to see monthly trends</p>
            </div>
        `;
        lucide.createIcons({ nodes: [container] });
        return;
    }

    // Group by month
    const monthlyTotals = {};
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    receipts.forEach(r => {
        const d = new Date(r.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyTotals[key] = (monthlyTotals[key] || 0) + (r.amount || 0);
    });

    const sortedMonths = Object.keys(monthlyTotals).sort();
    // Show last 6 months
    const recentMonths = sortedMonths.slice(-6);
    const maxVal = Math.max(...recentMonths.map(k => monthlyTotals[k]), 1);

    container.innerHTML = recentMonths.map(key => {
        const amount = monthlyTotals[key];
        const height = Math.max(Math.round((amount / maxVal) * 140), 8);
        const [year, month] = key.split('-');
        const label = monthLabels[parseInt(month) - 1];

        return `
            <div class="timeline-bar">
                <span class="timeline-bar-amount">$${formatAmount(amount)}</span>
                <div class="timeline-bar-fill" style="height: 0px;" data-height="${height}px"></div>
                <span class="timeline-bar-label">${label}</span>
            </div>
        `;
    }).join('');

    // Animate bars
    requestAnimationFrame(() => {
        container.querySelectorAll('.timeline-bar-fill').forEach((bar, i) => {
            setTimeout(() => {
                bar.style.height = bar.dataset.height;
            }, 100 + i * 80);
        });
    });
}

function renderReceiptsTable() {
    const tbody = document.getElementById('receipts-tbody');
    const filterCat = document.getElementById('filter-category').value;
    const sortBy = document.getElementById('sort-by').value;

    let filtered = [...AppState.receipts];

    // Filter
    if (filterCat !== 'all') {
        filtered = filtered.filter(r => r.category === filterCat);
    }

    // Sort
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'date-desc': return new Date(b.date) - new Date(a.date);
            case 'date-asc': return new Date(a.date) - new Date(b.date);
            case 'amount-desc': return (b.amount || 0) - (a.amount || 0);
            case 'amount-asc': return (a.amount || 0) - (b.amount || 0);
            default: return 0;
        }
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="5">
                    <div class="empty-state small">
                        <i data-lucide="inbox"></i>
                        <p>No receipts yet — scan some to get started</p>
                    </div>
                </td>
            </tr>
        `;
        lucide.createIcons({ nodes: [tbody] });
        return;
    }

    tbody.innerHTML = filtered.map(r => `
        <tr>
            <td>${formatDate(r.date)}</td>
            <td>${escapeHtml(r.vendor || 'Unknown')}</td>
            <td><span class="category-cell">${escapeHtml(r.category)}</span></td>
            <td class="amount-cell">$${formatAmount(r.amount)}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-icon" onclick="openEditModal('${r.id}')" title="Edit">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="btn-icon danger" onclick="deleteReceipt('${r.id}')" title="Delete">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    lucide.createIcons({ nodes: [tbody] });

    // Add event listeners for filters
    document.getElementById('filter-category').onchange = renderReceiptsTable;
    document.getElementById('sort-by').onchange = renderReceiptsTable;
}

function updateFilterOptions() {
    const select = document.getElementById('filter-category');
    const categories = [...new Set(AppState.receipts.map(r => r.category))].sort();
    const currentVal = select.value;

    select.innerHTML = '<option value="all">All Categories</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });

    select.value = currentVal;
}

// ---- Edit Modal ----
function openEditModal(id) {
    const receipt = AppState.receipts.find(r => r.id === id);
    if (!receipt) return;

    AppState.editingId = id;

    document.getElementById('edit-vendor').value = receipt.vendor || '';
    document.getElementById('edit-date').value = receipt.date || '';
    document.getElementById('edit-amount').value = receipt.amount || '';
    document.getElementById('edit-category').value = receipt.category || 'Other';
    document.getElementById('edit-notes').value = receipt.notes || '';

    document.getElementById('edit-modal').style.display = 'flex';
    lucide.createIcons();
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    AppState.editingId = null;
}

function saveEdit() {
    const id = AppState.editingId;
    const receipt = AppState.receipts.find(r => r.id === id);
    if (!receipt) return;

    receipt.vendor = document.getElementById('edit-vendor').value;
    receipt.date = document.getElementById('edit-date').value;
    receipt.amount = parseFloat(document.getElementById('edit-amount').value) || 0;
    receipt.category = document.getElementById('edit-category').value;
    receipt.notes = document.getElementById('edit-notes').value;

    saveState();
    closeEditModal();

    // Refresh views
    showResults();
    updateStats();
    renderDashboard();
    renderReceiptsTable();

    showToast('Receipt updated', 'success');
}

// ---- Actions ----
function deleteReceipt(id) {
    AppState.receipts = AppState.receipts.filter(r => r.id !== id);
    saveState();

    // Remove card
    const card = document.getElementById(`card-${id}`);
    if (card) {
        card.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => card.remove(), 300);
    }

    if (AppState.receipts.length === 0) {
        document.getElementById('recent-section').style.display = 'none';
    }

    updateStats();
    renderDashboard();
    renderReceiptsTable();
    showToast('Receipt deleted', 'info');
}

function viewRawText(id) {
    const receipt = AppState.receipts.find(r => r.id === id);
    if (!receipt) return;

    const rawText = receipt.rawText || 'No raw text available.';
    // Simple alert for now (could be a modal)
    const win = window.open('', '_blank', 'width=500,height=600');
    win.document.write(`
        <html>
        <head><title>Raw OCR Text — ${escapeHtml(receipt.vendor || receipt.fileName)}</title>
        <style>
            body { font-family: 'JetBrains Mono', monospace; background: #0c1018; color: #e8ecf4; padding: 24px; font-size: 13px; line-height: 1.7; }
            h3 { color: #a29bfe; margin-bottom: 16px; font-family: 'Inter', sans-serif; }
            pre { white-space: pre-wrap; word-break: break-word; }
        </style>
        </head>
        <body>
            <h3>Raw OCR Output</h3>
            <pre>${escapeHtml(rawText)}</pre>
        </body>
        </html>
    `);
}

// ---- Export Functions ----
function exportCSV() {
    if (AppState.receipts.length === 0) {
        showToast('No receipts to export', 'error');
        return;
    }

    const headers = ['Date', 'Vendor', 'Category', 'Amount', 'Tax', 'Subtotal', 'Notes', 'File'];
    const rows = AppState.receipts.map(r => [
        r.date || '',
        `"${(r.vendor || '').replace(/"/g, '""')}"`,
        `"${(r.category || '').replace(/"/g, '""')}"`,
        (r.amount || 0).toFixed(2),
        r.taxAmount ? r.taxAmount.toFixed(2) : '',
        r.subtotal ? r.subtotal.toFixed(2) : '',
        `"${(r.notes || '').replace(/"/g, '""')}"`,
        `"${(r.fileName || '').replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csv, 'freelancerAI_receipts.csv', 'text/csv');
    showToast('CSV exported successfully', 'success');
}

function exportJSON() {
    if (AppState.receipts.length === 0) {
        showToast('No receipts to export', 'error');
        return;
    }

    const data = AppState.receipts.map(r => ({
        date: r.date,
        vendor: r.vendor,
        category: r.category,
        amount: r.amount,
        tax: r.taxAmount,
        subtotal: r.subtotal,
        items: r.items,
        notes: r.notes,
        fileName: r.fileName,
        createdAt: r.createdAt,
    }));

    const json = JSON.stringify(data, null, 2);
    downloadFile(json, 'freelancerAI_receipts.json', 'application/json');
    showToast('JSON exported successfully', 'success');
}

function exportTaxSummary() {
    if (AppState.receipts.length === 0) {
        showToast('No receipts to export', 'error');
        return;
    }

    const receipts = AppState.receipts;
    const total = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalTax = receipts.reduce((sum, r) => sum + (r.taxAmount || 0), 0);
    const categories = {};
    receipts.forEach(r => {
        const cat = r.category || 'Other';
        categories[cat] = (categories[cat] || 0) + (r.amount || 0);
    });

    const lines = [
        '═══════════════════════════════════════════',
        '         FREELANCERAI TAX SUMMARY          ',
        '═══════════════════════════════════════════',
        '',
        `Generated: ${new Date().toLocaleDateString()}`,
        `Total Receipts Scanned: ${receipts.length}`,
        '',
        '───────────────────────────────────────────',
        ' CATEGORY BREAKDOWN',
        '───────────────────────────────────────────',
        '',
    ];

    Object.entries(categories)
        .sort(([, a], [, b]) => b - a)
        .forEach(([cat, amount]) => {
            const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0';
            lines.push(`  ${cat.padEnd(30)} $${formatAmount(amount).padStart(10)}  (${pct}%)`);
        });

    lines.push('');
    lines.push('───────────────────────────────────────────');
    lines.push(`  TOTAL EXPENSES                 $${formatAmount(total).padStart(10)}`);
    if (totalTax > 0) {
        lines.push(`  TOTAL TAX                      $${formatAmount(totalTax).padStart(10)}`);
    }
    lines.push('═══════════════════════════════════════════');
    lines.push('');
    lines.push('Generated by FreelancerAI — 100% Local, Open-Source AI');
    lines.push('Your data never left your device.');

    const summary = lines.join('\n');
    downloadFile(summary, 'freelancerAI_tax_summary.txt', 'text/plain');
    showToast('Tax summary exported', 'success');
}

// ---- Utility Functions ----
function generateId() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

function saveState() {
    try {
        // Save without thumbnails to avoid localStorage limits
        const toSave = AppState.receipts.map(r => ({
            ...r,
            thumbnail: undefined, // Don't persist base64 images
        }));
        localStorage.setItem('freelancerAI_receipts', JSON.stringify(toSave));
    } catch (e) {
        console.warn('localStorage save failed:', e);
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function formatAmount(num) {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    try {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

function titleCase(str) {
    return str.toLowerCase().replace(/(?:^|\s)\w/g, m => m.toUpperCase());
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

function setAIStatus(status) {
    const dot = document.getElementById('ai-status-dot');
    const text = document.getElementById('ai-status-text');

    if (status === 'processing') {
        dot.style.background = 'var(--accent-gold)';
        dot.style.animation = 'pulse-dot 0.8s ease-in-out infinite';
        text.textContent = 'Processing...';
        text.style.color = 'var(--accent-gold)';
    } else {
        dot.style.background = 'var(--accent-green)';
        dot.style.animation = 'pulse-dot 2s ease-in-out infinite';
        text.textContent = 'AI Ready';
        text.style.color = 'var(--accent-green)';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = {
        success: 'check-circle',
        error: 'alert-circle',
        info: 'info',
    };

    toast.innerHTML = `
        <div class="toast-icon"><i data-lucide="${iconMap[type] || 'info'}"></i></div>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    lucide.createIcons({ nodes: [toast] });

    setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Close modal on overlay click
document.getElementById('edit-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditModal();
});

// CSS fadeOut animation
const fadeOutStyle = document.createElement('style');
fadeOutStyle.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(-10px) scale(0.95); }
    }
`;
document.head.appendChild(fadeOutStyle);
