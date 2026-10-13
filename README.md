# 🧾 FreelancerAI — Local-First Invoice & Receipt Sorter

> **Your receipts, your device. Always.**  
> Open-source AI-powered expense tracking that runs 100% in your browser. No servers, no uploads, no subscriptions.

![FreelancerAI Screenshot](https://img.shields.io/badge/AI-100%25%20Local-6c5ce7?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-00b894?style=for-the-badge)
![Tesseract.js](https://img.shields.io/badge/OCR-Tesseract.js-fd79a8?style=for-the-badge)

## 🎯 What It Does

FreelancerAI is a **local-first invoice and receipt sorter** built for freelancers, solopreneurs, and small business owners who need to:

- **Scan receipts** → Drop a photo, get structured data (vendor, date, amount, category)
- **Auto-categorize** → AI classifies expenses into 10+ business categories
- **Track spending** → Visual dashboard with category breakdown & monthly timeline
- **Export for taxes** → Download CSV, JSON, or formatted tax summaries
- **Keep data private** → Everything runs in your browser. Nothing is ever uploaded.

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    YOUR BROWSER                          │
│                                                          │
│   ┌──────────┐    ┌─────────────┐    ┌───────────────┐  │
│   │  Image    │───▶│ Tesseract.js │───▶│ AI Rule-Based │  │
│   │  Upload   │    │ OCR Engine   │    │ Parser Engine │  │
│   └──────────┘    │ (WASM/WebGPU)│    │               │  │
│                    └─────────────┘    │ • Vendor ID    │  │
│                                       │ • Date Extract │  │
│                                       │ • Amount Parse │  │
│                                       │ • Category AI  │  │
│                                       │ • Line Items   │  │
│                                       └───────┬───────┘  │
│                                               │          │
│   ┌──────────┐    ┌─────────────┐    ┌───────▼───────┐  │
│   │  Export   │◀───│  Dashboard  │◀───│  localStorage │  │
│   │ CSV/JSON  │    │  Analytics  │    │  (IndexedDB)  │  │
│   └──────────┘    └─────────────┘    └───────────────┘  │
│                                                          │
│              ⛔ ZERO network requests ⛔                 │
└──────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

No build tools, no npm, no installation required:

```bash
# Option 1: Just open it
# Double-click index.html in your browser

# Option 2: Local server
npx serve .

# Option 3: Python
python -m http.server 3000
```

## 🔧 Tech Stack

| Component | Technology | Why Open Source Matters |
|-----------|-----------|----------------------|
| **OCR Engine** | [Tesseract.js v5](https://github.com/naptha/tesseract.js) | Runs entirely in browser via WASM — no API calls |
| **AI Parser** | Custom rule-based NLP | 300+ keyword categories, regex patterns — no LLM needed |
| **UI Framework** | Vanilla HTML/CSS/JS | Zero dependencies, instant load, no build step |
| **Data Storage** | localStorage | Your data never leaves your machine |
| **Icons** | [Lucide](https://lucide.dev) | Open-source icon library |
| **Typography** | [Inter](https://rsms.me/inter/) + [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | Premium fonts, freely available |

## 📋 Features

### ✅ Core
- [x] Drag & drop receipt/invoice upload
- [x] Real-time OCR processing with progress indicators
- [x] Vendor name extraction (first meaningful line)
- [x] Date extraction (5+ date format patterns)
- [x] Amount extraction (total, subtotal, tax)
- [x] Category auto-classification (10 categories, 300+ keywords)
- [x] Line item extraction

### ✅ Dashboard
- [x] Total expenses, count, average, categories stats
- [x] Category spending breakdown with animated bars
- [x] Monthly timeline visualization
- [x] Sortable & filterable receipts table

### ✅ Export
- [x] CSV export (for Excel, Google Sheets, QuickBooks)
- [x] JSON export (for developers)
- [x] Formatted tax summary report

### ✅ UX
- [x] Premium dark glassmorphism design
- [x] Smooth micro-animations & transitions
- [x] Fully responsive (mobile → desktop)
- [x] Edit extracted data with modal form
- [x] Toast notifications
- [x] Works offline after first load

## 🔒 Privacy

**FreelancerAI processes everything locally.** Here's what that means:

- ❌ No server uploads
- ❌ No API calls to any cloud service
- ❌ No analytics or tracking
- ❌ No account creation
- ✅ All OCR runs in your browser tab (Tesseract.js WASM)
- ✅ All data stored in your browser's localStorage
- ✅ All exports generated client-side
- ✅ Works completely offline

## 💰 The Side Hustle Angle

FreelancerAI solves a real pain point for the **60 million+ freelancers** in the US alone:

1. **The Problem**: Freelancers spend 5-10 hours/month organizing receipts for tax deductions. Tools like Expensify ($5-20/mo) or Shoeboxed ($18-36/mo) upload your financial documents to their servers.

2. **The Solution**: A free, private, instant receipt sorter that runs on any device with a browser.

3. **Why Open Source Wins**:
   - **$0 operating costs** — no API bills, no server hosting
   - **Complete privacy** — client receipts for a $50k contract stay on your laptop
   - **No vendor lock-in** — export your data anytime in CSV/JSON
   - **Works on $200 Chromebooks** — no GPU required, Tesseract.js runs on WASM

## 📄 License

[MIT](LICENSE) — Use it, fork it, sell it, modify it. That's the point.

---

Built with open-source AI for the [Hacktoberfest 2026 Open-Source AI Challenge](https://dev.to/challenges/hacktoberfest-week2-2026-10-12) 🎃
