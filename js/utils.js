/* ============================================================
   FinVision — utils.js
   Shared utilities, formatters, mock data, and API helpers.
   ============================================================ */

// ── Configuration ──────────────────────────────────────────────
const API_BASE_URL = 'http://localhost:8000/api'; // Backend URL — configure per environment
const DEMO_MODE = true; // true = use MOCK_DATA; false = hit real API

// In-memory fallback if localStorage is blocked (e.g. strict file:// protocol security)
const _memoryStorage = {};

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn('[Storage] localStorage block detected, falling back to memory store.');
    return _memoryStorage[key] || null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    _memoryStorage[key] = value;
  }
}

function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    delete _memoryStorage[key];
  }
}

// ── Token Management ───────────────────────────────────────────
function getToken() {
  return safeGetItem('finvision_token');
}

function setToken(token) {
  safeSetItem('finvision_token', token);
}

function removeToken() {
  safeRemoveItem('finvision_token');
}

// ── User Management ────────────────────────────────────────────
function getUser() {
  const raw = safeGetItem('finvision_user');
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setUser(user) {
  safeSetItem('finvision_user', JSON.stringify(user));
}

function removeUser() {
  safeRemoveItem('finvision_user');
}

// ── API Fetch Wrapper ──────────────────────────────────────────
/**
 * Unified fetch wrapper.
 * In DEMO_MODE it resolves with mock data keyed by endpoint.
 * Otherwise it makes a real HTTP request with the stored JWT.
 *
 * @param {string}  endpoint  – e.g. '/auth/login' or '/stocks/AAPL'
 * @param {object}  options   – { method, body, headers, … }
 * @returns {Promise<object>}
 */
async function apiFetch(endpoint, options = {}) {
  /* ---- Demo mode shortcuts ---- */
  if (DEMO_MODE) {
    return handleDemoRequest(endpoint, options);
  }

  /* ---- Real API call ---- */
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data.detail || data.message || `Request failed (${res.status})`;
      showToast(msg, 'error');
      throw new Error(msg);
    }

    return data;
  } catch (err) {
    if (err.message === 'Failed to fetch') {
      showToast('Network error — server unreachable.', 'error');
    }
    throw err;
  }
}

/**
 * Route demo requests to the correct mock handler.
 */
async function handleDemoRequest(endpoint, options) {
  // Simulate network latency
  await new Promise(r => setTimeout(r, 400 + Math.random() * 400));

  // Auth endpoints
  if (endpoint === '/auth/login') {
    return {
      token: 'demo_jwt_token_' + Date.now(),
      user: { name: 'Demo User', email: options.body?.email || 'demo@finvision.ai', avatar: null },
    };
  }
  if (endpoint === '/auth/signup') {
    return {
      token: 'demo_jwt_token_' + Date.now(),
      user: { name: options.body?.name || 'New User', email: options.body?.email || 'new@finvision.ai', avatar: null },
    };
  }
  if (endpoint === '/auth/change-password') {
    return { message: 'Password changed successfully' };
  }

  // Stock endpoints — e.g. /stocks/AAPL
  const stockMatch = endpoint.match(/^\/stocks\/([A-Z.]+)$/i);
  if (stockMatch) {
    const ticker = stockMatch[1].toUpperCase();
    if (MOCK_DATA[ticker]) return MOCK_DATA[ticker];
    showToast(`Ticker "${ticker}" not found in demo data.`, 'error');
    throw new Error('Ticker not found');
  }

  // Search endpoint
  if (endpoint.startsWith('/stocks/search')) {
    const url = new URL(`http://x${endpoint}`);
    const q = (url.searchParams.get('q') || '').toUpperCase();
    const results = Object.keys(MOCK_DATA)
      .filter(k => k.includes(q) || MOCK_DATA[k].company.toUpperCase().includes(q))
      .map(k => ({ symbol: k, name: MOCK_DATA[k].company, exchange: MOCK_DATA[k].exchange }));
    return results;
  }

  return {};
}

// ── Toast Notification System ──────────────────────────────────
/**
 * Display a toast notification.
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} type
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  // Icon map
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Close">✕</button>
  `;

  // Close button handler
  toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));

  container.appendChild(toast);

  // Trigger enter animation (allow paint cycle)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  // Auto-dismiss after 4 seconds
  const timer = setTimeout(() => dismissToast(toast), 4000);
  toast._timer = timer;
}

function dismissToast(toast) {
  clearTimeout(toast._timer);
  toast.classList.remove('show');
  toast.classList.add('hide');
  toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  // Fallback removal in case transitionend doesn't fire
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 600);
}

// ── Formatters ─────────────────────────────────────────────────

/**
 * Format a number as US currency: $1,234.56
 */
function formatCurrency(num) {
  if (num == null || isNaN(num)) return '$—';
  return '$' + Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a number with commas. Large numbers get suffixed (M / B / T).
 */
function formatNumber(num) {
  if (num == null || isNaN(num)) return '—';
  const abs = Math.abs(num);
  if (abs >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  return Number(num).toLocaleString('en-US');
}

/**
 * Format a percentage with explicit sign: +1.23% or -0.45%
 */
function formatPercent(num) {
  if (num == null || isNaN(num)) return '—';
  const sign = num >= 0 ? '+' : '';
  return sign + Number(num).toFixed(2) + '%';
}

/**
 * Format market cap: $3.08T, $245.60B, etc.
 */
function formatMarketCap(num) {
  if (num == null || isNaN(num)) return '$—';
  const abs = Math.abs(num);
  if (abs >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
  return formatCurrency(num);
}

/**
 * Format volume: 54.30M, 1.20B, etc.
 */
function formatVolume(num) {
  if (num == null || isNaN(num)) return '—';
  const abs = Math.abs(num);
  if (abs >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return Number(num).toLocaleString('en-US');
}

/**
 * Human-readable relative time: "2 hours ago", "3 days ago", etc.
 */
function timeAgo(dateString) {
  if (!dateString) return '';
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diff = Math.max(0, now - then);

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

// ── Debounce ───────────────────────────────────────────────────
/**
 * Classic trailing-edge debounce.
 */
function debounce(fn, ms = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ── Animate Value ──────────────────────────────────────────────
/**
 * Smoothly animate a numeric value inside an element.
 *
 * @param {HTMLElement} element   – target DOM node
 * @param {number}      start    – start value
 * @param {number}      end      – end value
 * @param {number}      duration – milliseconds
 * @param {Function}    formatter – (value) => string
 */
function animateValue(element, start, end, duration = 1200, formatter = formatCurrency) {
  if (!element) return;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic for a satisfying deceleration
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * eased;
    element.textContent = formatter(current);

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// ── Mock Data Generation ───────────────────────────────────────

/**
 * Generate realistic OHLC history data trending toward `currentPrice`.
 *
 * @param {number} currentPrice – the final closing price
 * @param {number} points       – number of data points (trading days)
 * @returns {Array<{date:string, open:number, high:number, low:number, close:number}>}
 */
function generateMockHistory(currentPrice, points = 60) {
  const history = [];
  const now = new Date();

  // Start price ~12-18% below current to create an upward trend
  const trendBias = 0.85 + Math.random() * 0.06; // 0.85–0.91
  let price = currentPrice * trendBias;

  // Pre-calculate the drift needed per step to arrive near currentPrice
  const totalSteps = points;
  const drift = (currentPrice - price) / totalSteps;

  for (let i = 0; i < points; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - (points - i));

    // Skip weekends for realism
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) date.setDate(date.getDate() + 1);
    if (dayOfWeek === 6) date.setDate(date.getDate() + 2);

    // Daily volatility: ±0.5–2.5%
    const volatility = price * (0.005 + Math.random() * 0.02);
    const noise = (Math.random() - 0.45) * volatility; // slight upward bias

    const open = parseFloat((price + (Math.random() - 0.5) * volatility * 0.3).toFixed(2));
    const close = parseFloat((price + drift + noise).toFixed(2));
    const high = parseFloat((Math.max(open, close) + Math.random() * volatility * 0.6).toFixed(2));
    const low = parseFloat((Math.min(open, close) - Math.random() * volatility * 0.6).toFixed(2));

    history.push({
      date: date.toISOString().split('T')[0],
      open,
      high,
      low,
      close,
    });

    price = close; // next day opens near prior close
  }

  // Ensure the last close matches our target
  if (history.length) {
    const last = history[history.length - 1];
    last.close = currentPrice;
    last.high = Math.max(last.high, currentPrice);
    last.low = Math.min(last.low, currentPrice);
  }

  return history;
}

// ── MOCK DATA ──────────────────────────────────────────────────
const MOCK_DATA = {};

// ── Apple ──────────────────────────────────────────────────────
MOCK_DATA.AAPL = {
  company: 'Apple Inc.',
  exchange: 'NASDAQ',
  price: 198.45,
  change: 2.34,
  changePercent: 1.19,
  open: 196.50,
  high: 199.20,
  low: 195.80,
  volume: 54300000,
  marketCap: 3080000000000,
  peRatio: 32.4,
  history: generateMockHistory(198.45, 60),
  news: [
    { title: 'Apple Unveils Revolutionary AI Features at WWDC 2025', source: 'Reuters', time: '2025-07-14T10:30:00Z', url: '#', sentiment: 'positive' },
    { title: 'Apple Vision Pro 2 Sales Exceed Wall Street Expectations', source: 'Bloomberg', time: '2025-07-14T08:15:00Z', url: '#', sentiment: 'positive' },
    { title: 'Apple Faces New EU Regulatory Scrutiny Over App Store Policies', source: 'Financial Times', time: '2025-07-13T14:00:00Z', url: '#', sentiment: 'negative' },
    { title: 'Apple Services Revenue Hits All-Time High in Q3', source: 'CNBC', time: '2025-07-13T09:30:00Z', url: '#', sentiment: 'positive' },
    { title: 'Analysts Upgrade Apple Stock on Strong iPhone 16 Demand', source: 'MarketWatch', time: '2025-07-12T16:45:00Z', url: '#', sentiment: 'positive' },
    { title: 'Apple Supply Chain Shifts: More Manufacturing Moving to India', source: 'WSJ', time: '2025-07-12T11:00:00Z', url: '#', sentiment: 'neutral' },
  ],
  prediction: {
    direction: 'bullish',
    confidence: 78,
    summary: 'Strong bullish outlook driven by AI integration across product lines, record services revenue, and positive iPhone 16 demand signals. Technical indicators suggest continued upward momentum with support at $192.',
    targets: { short_term: '$205 (2 weeks)', medium_term: '$218 (3 months)', long_term: '$245 (12 months)' },
    factors: [
      { factor: 'AI Integration', impact: 'positive', description: 'Apple Intelligence driving strong upgrade cycles' },
      { factor: 'Services Growth', impact: 'positive', description: 'Recurring revenue at all-time highs' },
      { factor: 'Regulatory Risk', impact: 'negative', description: 'EU DMA compliance could impact App Store revenue' },
      { factor: 'Market Sentiment', impact: 'positive', description: 'Strong institutional buying pressure' },
    ],
  },
};

// ── Alphabet ───────────────────────────────────────────────────
MOCK_DATA.GOOGL = {
  company: 'Alphabet Inc.',
  exchange: 'NASDAQ',
  price: 178.32,
  change: -0.82,
  changePercent: -0.46,
  open: 179.10,
  high: 180.45,
  low: 177.60,
  volume: 28700000,
  marketCap: 2210000000000,
  peRatio: 27.1,
  history: generateMockHistory(178.32, 60),
  news: [
    { title: 'Google Gemini 2.5 Sets New Benchmark in AI Reasoning Tests', source: 'The Verge', time: '2025-07-14T11:00:00Z', url: '#', sentiment: 'positive' },
    { title: 'Alphabet Cloud Revenue Growth Slows in Q2 Preview', source: 'CNBC', time: '2025-07-14T07:45:00Z', url: '#', sentiment: 'negative' },
    { title: 'Google Faces $8B Antitrust Fine from European Commission', source: 'Reuters', time: '2025-07-13T15:30:00Z', url: '#', sentiment: 'negative' },
    { title: 'Waymo Expands Autonomous Taxi Service to 5 New U.S. Cities', source: 'Bloomberg', time: '2025-07-13T10:00:00Z', url: '#', sentiment: 'positive' },
    { title: 'YouTube Ad Revenue Surges 18% Year-Over-Year', source: 'Financial Times', time: '2025-07-12T14:15:00Z', url: '#', sentiment: 'positive' },
    { title: 'Analysts Mixed on Alphabet Ahead of Earnings Report', source: 'MarketWatch', time: '2025-07-12T09:00:00Z', url: '#', sentiment: 'neutral' },
  ],
  prediction: {
    direction: 'neutral',
    confidence: 55,
    summary: 'Mixed outlook with strong AI momentum offset by regulatory headwinds and cloud growth deceleration. Watch for Q2 earnings catalyst. Trading range expected between $170–$185 near term.',
    targets: { short_term: '$182 (2 weeks)', medium_term: '$190 (3 months)', long_term: '$210 (12 months)' },
    factors: [
      { factor: 'Gemini AI Leadership', impact: 'positive', description: 'Leading position in multimodal AI models' },
      { factor: 'Antitrust Pressure', impact: 'negative', description: 'Multiple ongoing regulatory proceedings globally' },
      { factor: 'Cloud Growth', impact: 'negative', description: 'Growth rate declining faster than peers' },
      { factor: 'YouTube Monetization', impact: 'positive', description: 'Strong ad revenue and Shorts monetization' },
    ],
  },
};

// ── Microsoft ──────────────────────────────────────────────────
MOCK_DATA.MSFT = {
  company: 'Microsoft Corp.',
  exchange: 'NASDAQ',
  price: 425.67,
  change: 3.78,
  changePercent: 0.90,
  open: 422.30,
  high: 427.15,
  low: 421.50,
  volume: 22100000,
  marketCap: 3160000000000,
  peRatio: 35.8,
  history: generateMockHistory(425.67, 60),
  news: [
    { title: 'Microsoft Azure AI Revenue Doubles, Beating All Estimates', source: 'Bloomberg', time: '2025-07-14T09:00:00Z', url: '#', sentiment: 'positive' },
    { title: 'Copilot Adoption Reaches 50 Million Enterprise Users', source: 'CNBC', time: '2025-07-14T06:30:00Z', url: '#', sentiment: 'positive' },
    { title: 'Microsoft Announces $12B Investment in AI Data Centers', source: 'Reuters', time: '2025-07-13T13:00:00Z', url: '#', sentiment: 'positive' },
    { title: 'Xbox Cloud Gaming Struggles as Sony Gains Market Share', source: 'The Verge', time: '2025-07-13T08:45:00Z', url: '#', sentiment: 'negative' },
    { title: 'Microsoft 365 Price Increase Draws Enterprise Pushback', source: 'WSJ', time: '2025-07-12T15:30:00Z', url: '#', sentiment: 'negative' },
    { title: 'LinkedIn Revenue Growth Accelerates on AI Job Matching', source: 'Financial Times', time: '2025-07-12T10:15:00Z', url: '#', sentiment: 'positive' },
  ],
  prediction: {
    direction: 'bullish',
    confidence: 82,
    summary: 'Strong bullish case anchored by Azure AI momentum, Copilot enterprise adoption, and dominant cloud position. CapEx concerns offset by revenue growth trajectory. Premium valuation supported by AI moat.',
    targets: { short_term: '$440 (2 weeks)', medium_term: '$465 (3 months)', long_term: '$520 (12 months)' },
    factors: [
      { factor: 'Azure AI Growth', impact: 'positive', description: 'Cloud AI revenue doubling quarter-over-quarter' },
      { factor: 'Copilot Monetization', impact: 'positive', description: '50M+ enterprise users at $30/seat/month' },
      { factor: 'CapEx Concerns', impact: 'negative', description: 'Massive data center spend pressuring margins' },
      { factor: 'Enterprise Lock-in', impact: 'positive', description: 'Deep integration across productivity stack' },
    ],
  },
};

// ── Tesla ──────────────────────────────────────────────────────
MOCK_DATA.TSLA = {
  company: 'Tesla Inc.',
  exchange: 'NASDAQ',
  price: 267.89,
  change: 6.12,
  changePercent: 2.34,
  open: 262.45,
  high: 270.30,
  low: 261.10,
  volume: 98200000,
  marketCap: 856000000000,
  peRatio: 68.5,
  history: generateMockHistory(267.89, 60),
  news: [
    { title: 'Tesla Cybertruck Deliveries Surge 340% in Q2', source: 'Reuters', time: '2025-07-14T10:15:00Z', url: '#', sentiment: 'positive' },
    { title: 'Tesla FSD v13 Achieves Level 4 Autonomy in Limited Rollout', source: 'Bloomberg', time: '2025-07-14T07:00:00Z', url: '#', sentiment: 'positive' },
    { title: 'Tesla China Sales Decline 8% Amid BYD Competition', source: 'Financial Times', time: '2025-07-13T12:30:00Z', url: '#', sentiment: 'negative' },
    { title: 'Elon Musk Announces Optimus Robot Production Ramp', source: 'CNBC', time: '2025-07-13T09:15:00Z', url: '#', sentiment: 'positive' },
    { title: 'Tesla Energy Storage Deployments Hit Record 15 GWh', source: 'MarketWatch', time: '2025-07-12T13:45:00Z', url: '#', sentiment: 'positive' },
    { title: 'Short Sellers Increase Bets Against Tesla by $2.8B', source: 'WSJ', time: '2025-07-12T08:30:00Z', url: '#', sentiment: 'negative' },
  ],
  prediction: {
    direction: 'bullish',
    confidence: 65,
    summary: 'Cautiously bullish driven by FSD breakthroughs and energy segment growth, but China headwinds and elevated valuation create downside risk. High beta — expect volatility. Key catalyst: FSD regulatory approval timeline.',
    targets: { short_term: '$280 (2 weeks)', medium_term: '$310 (3 months)', long_term: '$350 (12 months)' },
    factors: [
      { factor: 'FSD Progress', impact: 'positive', description: 'Level 4 autonomy could unlock robotaxi revenue' },
      { factor: 'China Competition', impact: 'negative', description: 'BYD and local rivals eroding market share' },
      { factor: 'Energy Storage', impact: 'positive', description: 'Megapack deployments growing exponentially' },
      { factor: 'Valuation Risk', impact: 'negative', description: 'P/E of 68x prices in significant future growth' },
    ],
  },
};

// ── Amazon ─────────────────────────────────────────────────────
MOCK_DATA.AMZN = {
  company: 'Amazon.com Inc.',
  exchange: 'NASDAQ',
  price: 195.43,
  change: -0.24,
  changePercent: -0.12,
  open: 195.80,
  high: 197.10,
  low: 194.30,
  volume: 35600000,
  marketCap: 2040000000000,
  peRatio: 42.3,
  history: generateMockHistory(195.43, 60),
  news: [
    { title: 'AWS Launches Next-Gen Graviton5 Chips, Cuts Cloud Costs 30%', source: 'Reuters', time: '2025-07-14T11:30:00Z', url: '#', sentiment: 'positive' },
    { title: 'Amazon Prime Day 2025 Breaks All Sales Records', source: 'CNBC', time: '2025-07-14T08:00:00Z', url: '#', sentiment: 'positive' },
    { title: "FTC Challenges Amazon's Acquisition of Healthcare Startup", source: 'Bloomberg', time: '2025-07-13T14:45:00Z', url: '#', sentiment: 'negative' },
    { title: 'Amazon Logistics Network Now Rivals UPS in U.S. Volume', source: 'WSJ', time: '2025-07-13T10:30:00Z', url: '#', sentiment: 'positive' },
    { title: 'Alexa+ Subscription Disappoints with Slow Adoption Rates', source: 'The Verge', time: '2025-07-12T16:00:00Z', url: '#', sentiment: 'negative' },
    { title: 'Amazon Advertising Revenue Jumps 24% Year-Over-Year', source: 'Financial Times', time: '2025-07-12T12:00:00Z', url: '#', sentiment: 'positive' },
  ],
  prediction: {
    direction: 'bullish',
    confidence: 71,
    summary: 'Bullish on margin expansion from AWS and advertising, offset by retail segment pressure and regulatory friction. Prime Day performance signals healthy consumer demand. AWS remains the growth engine.',
    targets: { short_term: '$202 (2 weeks)', medium_term: '$215 (3 months)', long_term: '$240 (12 months)' },
    factors: [
      { factor: 'AWS Leadership', impact: 'positive', description: 'Market-leading cloud with custom silicon advantage' },
      { factor: 'Ad Revenue Growth', impact: 'positive', description: 'High-margin advertising scaling rapidly' },
      { factor: 'Regulatory Scrutiny', impact: 'negative', description: 'FTC challenges to acquisitions and marketplace practices' },
      { factor: 'Retail Margins', impact: 'positive', description: 'Logistics optimization improving retail profitability' },
    ],
  },
};

// ── NVIDIA ─────────────────────────────────────────────────────
MOCK_DATA.NVDA = {
  company: 'NVIDIA Corp.',
  exchange: 'NASDAQ',
  price: 138.72,
  change: 4.87,
  changePercent: 3.64,
  open: 134.50,
  high: 140.15,
  low: 133.90,
  volume: 312000000,
  marketCap: 3400000000000,
  peRatio: 58.2,
  history: generateMockHistory(138.72, 60),
  news: [
    { title: 'NVIDIA Blackwell Ultra GPUs Sell Out Entire 2026 Production Run', source: 'Bloomberg', time: '2025-07-14T10:00:00Z', url: '#', sentiment: 'positive' },
    { title: 'NVIDIA Crosses $3.4T Market Cap, Becomes Most Valuable Company', source: 'Reuters', time: '2025-07-14T06:45:00Z', url: '#', sentiment: 'positive' },
    { title: 'U.S. Tightens AI Chip Export Controls to Middle East', source: 'Financial Times', time: '2025-07-13T15:00:00Z', url: '#', sentiment: 'negative' },
    { title: 'NVIDIA CUDA Ecosystem Moat Widens as AMD ROCm Struggles', source: 'The Verge', time: '2025-07-13T11:30:00Z', url: '#', sentiment: 'positive' },
    { title: 'Jensen Huang Reveals Rubin GPU Architecture Roadmap', source: 'CNBC', time: '2025-07-12T14:00:00Z', url: '#', sentiment: 'positive' },
    { title: 'Sovereign AI Deals Worth $15B Signed with 6 Nations', source: 'WSJ', time: '2025-07-12T09:45:00Z', url: '#', sentiment: 'positive' },
  ],
  prediction: {
    direction: 'bullish',
    confidence: 88,
    summary: 'Strongly bullish. NVIDIA is the unquestioned AI infrastructure leader with demand far outstripping supply. Blackwell cycle driving hyper-growth. Export controls are the primary risk, but sovereign AI deals provide geographic diversification.',
    targets: { short_term: '$148 (2 weeks)', medium_term: '$165 (3 months)', long_term: '$195 (12 months)' },
    factors: [
      { factor: 'AI Demand Supercycle', impact: 'positive', description: 'Data center GPU demand growing faster than supply' },
      { factor: 'CUDA Ecosystem', impact: 'positive', description: 'Software moat makes switching costs prohibitive' },
      { factor: 'Export Restrictions', impact: 'negative', description: 'U.S. controls limit China and Middle East sales' },
      { factor: 'Sovereign AI', impact: 'positive', description: 'Government deals diversify revenue geographically' },
    ],
  },
};

// ── Ticker Strip Data ──────────────────────────────────────────
const TICKER_STRIP_DATA = [
  { symbol: 'AAPL', price: 198.45, change: +1.19 },
  { symbol: 'GOOGL', price: 178.32, change: -0.45 },
  { symbol: 'MSFT', price: 425.67, change: +0.89 },
  { symbol: 'TSLA', price: 267.89, change: +2.34 },
  { symbol: 'AMZN', price: 195.43, change: -0.12 },
  { symbol: 'NVDA', price: 138.72, change: +3.56 },
  { symbol: 'META', price: 512.34, change: +1.45 },
  { symbol: 'JPM', price: 198.76, change: -0.67 },
  { symbol: 'V', price: 278.90, change: +0.23 },
  { symbol: 'BRK.B', price: 412.56, change: +0.78 },
  { symbol: 'DJI', price: 39876.54, change: +0.34 },
  { symbol: 'SPX', price: 5523.12, change: +0.56 },
  { symbol: 'IXIC', price: 17654.32, change: +0.89 },
];
