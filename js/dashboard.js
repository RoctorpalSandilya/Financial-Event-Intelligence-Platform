/**
 * FinVision — Dashboard Controller
 * 
 * Orchestrates search, data rendering, chart interactions, AI predictions,
 * and news display. All visual transitions use staggered animations for
 * a premium, responsive feel.
 *
 * Dependencies (from utils.js): DEMO_MODE, API_BASE_URL, MOCK_DATA,
 * apiFetch, showToast, formatCurrency, formatNumber, formatPercent,
 * formatMarketCap, formatVolume, timeAgo, debounce, animateValue,
 * TICKER_STRIP_DATA, getToken, getUser
 */

const Dashboard = {
  currentTicker: null,
  currentStockData: null,
  heroAnimation: null,

  /* ═══════════════════════════════════════════════════════════════
   *  INITIALIZATION
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Initialize all dashboard event listeners and start welcome animations.
   */
  init() {
    // ── Search input with debounce ──
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      const debouncedSearch = debounce((e) => {
        this.handleSearch(e.target.value.trim());
      }, 300);

      searchInput.addEventListener('input', debouncedSearch);

      // Enter key: instant search if exact ticker match
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const query = searchInput.value.trim().toUpperCase();
          if (typeof MOCK_DATA !== 'undefined' && MOCK_DATA[query]) {
            this.search(query);
          } else if (query.length > 0) {
            this.search(query);
          }
        }
        // Escape key: close suggestions
        if (e.key === 'Escape') {
          this.hideSuggestions();
        }
      });

      // Close suggestions when clicking outside
      document.addEventListener('click', (e) => {
        const suggestions = document.getElementById('search-suggestions');
        if (suggestions && !suggestions.contains(e.target) && e.target !== searchInput) {
          this.hideSuggestions();
        }
      });
    }

    // ── Popular ticker buttons ──
    document.querySelectorAll('.popular-btn[data-ticker]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ticker = btn.getAttribute('data-ticker');
        if (ticker) this.search(ticker);
      });
    });

    // ── Chart range buttons ──
    document.querySelectorAll('.chart-btn[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        const range = btn.getAttribute('data-range');
        if (range) this.changeChartRange(range);
      });
    });

    // ── Logout button ──
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // ── Start hero candlestick animation ──
    this.startHeroAnimation();
  },


  /* ═══════════════════════════════════════════════════════════════
   *  SEARCH & SUGGESTIONS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Handle search input: filter tickers and show suggestion dropdown.
   * @param {string} query - Current search input value
   */
  handleSearch(query) {
    const suggestionsEl = document.getElementById('search-suggestions');
    if (!suggestionsEl) return;

    if (!query || query.length === 0) {
      this.hideSuggestions();
      return;
    }

    const upperQuery = query.toUpperCase();

    // Get all available tickers from MOCK_DATA
    let matches = [];
    if (typeof MOCK_DATA !== 'undefined') {
      matches = Object.keys(MOCK_DATA).filter(ticker => {
        const data = MOCK_DATA[ticker];
        return (
          ticker.includes(upperQuery) ||
          (data.company && data.company.toUpperCase().includes(upperQuery))
        );
      }).slice(0, 8); // Max 8 suggestions
    }

    if (matches.length === 0) {
      suggestionsEl.innerHTML = `
        <div class="suggestion-item suggestion-empty" style="
          padding: 14px 18px;
          color: rgba(255,255,255,0.4);
          font-size: 13px;
          text-align: center;
          cursor: default;
        ">No results found</div>
      `;
      suggestionsEl.style.display = 'block';
      return;
    }

    suggestionsEl.innerHTML = matches.map(ticker => {
      const data = MOCK_DATA[ticker];
      const changeClass = data.change >= 0 ? 'up' : 'down';
      const changeSign = data.change >= 0 ? '+' : '';
      return `
        <div class="suggestion-item" data-ticker="${ticker}" style="
          padding: 12px 18px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.2s ease;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        ">
          <div>
            <span style="
              font-weight: 700;
              color: #00D4FF;
              font-size: 14px;
              margin-right: 8px;
              letter-spacing: 0.5px;
            ">${ticker}</span>
            <span style="
              color: rgba(255,255,255,0.5);
              font-size: 12px;
            ">${data.company || ''}</span>
          </div>
          <div style="text-align: right;">
            <span style="
              color: #fff;
              font-weight: 600;
              font-size: 13px;
              font-family: 'SF Mono', 'Fira Code', monospace;
            ">${formatCurrency(data.price)}</span>
            <span class="${changeClass}" style="
              font-size: 11px;
              margin-left: 6px;
              color: ${data.change >= 0 ? '#00FF88' : '#FF3366'};
            ">${changeSign}${data.changePercent.toFixed(2)}%</span>
          </div>
        </div>
      `;
    }).join('');

    suggestionsEl.style.display = 'block';

    // Attach click handlers to each suggestion
    suggestionsEl.querySelectorAll('.suggestion-item[data-ticker]').forEach(item => {
      item.addEventListener('click', () => {
        const ticker = item.getAttribute('data-ticker');
        this.search(ticker);
      });

      // Hover effect
      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(0, 212, 255, 0.08)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
    });
  },

  /**
   * Hide the search suggestions dropdown.
   */
  hideSuggestions() {
    const suggestionsEl = document.getElementById('search-suggestions');
    if (suggestionsEl) {
      suggestionsEl.style.display = 'none';
      suggestionsEl.innerHTML = '';
    }
  },


  /* ═══════════════════════════════════════════════════════════════
   *  STOCK SEARCH & DATA LOADING
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Search for a stock ticker: fetch data (mock or API), render all sections.
   * @param {string} ticker - Stock ticker symbol
   */
  async search(ticker) {
    ticker = ticker.toUpperCase();

    // Clear search UI
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    this.hideSuggestions();

    // Show loading overlay
    this.showLoading(true);

    let data = null;

    try {
      if (typeof DEMO_MODE !== 'undefined' && DEMO_MODE) {
        // Simulated delay for premium feel
        await this._delay(600);

        if (typeof MOCK_DATA !== 'undefined' && MOCK_DATA[ticker]) {
          data = MOCK_DATA[ticker];
        } else {
          showToast(`Ticker "${ticker}" not found. Try AAPL, GOOGL, MSFT, TSLA, AMZN, or NVDA.`, 'error');
          this.showLoading(false);
          return;
        }
      } else {
        // Real API fetch
        try {
          data = await apiFetch(`/stock/${ticker}`);
        } catch (err) {
          showToast(`Failed to fetch data for "${ticker}": ${err.message}`, 'error');
          this.showLoading(false);
          return;
        }
      }

      if (!data) {
        showToast(`No data available for "${ticker}".`, 'error');
        this.showLoading(false);
        return;
      }

      // Store current data
      this.currentTicker = ticker;
      this.currentStockData = data;

      // Transition: hide welcome → show stock data
      this.hideWelcome();

      // Render all dashboard sections
      this.renderStockData(data);
      this.renderChart(data, '3M');
      this.renderPrediction(data.prediction);
      this.renderNews(data.news);

    } catch (err) {
      console.error('[Dashboard] Search error:', err);
      showToast('An unexpected error occurred.', 'error');
    }

    // Hide loading
    this.showLoading(false);
  },


  /* ═══════════════════════════════════════════════════════════════
   *  RENDER: STOCK DATA (header + metrics)
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Render the stock header info and metrics with animated counters.
   * @param {Object} data - Stock data object
   */
  renderStockData(data) {
    // ── Company info ──
    const nameEl = document.getElementById('company-name');
    const tickerEl = document.getElementById('company-ticker');
    const exchangeEl = document.getElementById('company-exchange');

    if (nameEl) nameEl.textContent = data.company || '—';
    if (tickerEl) tickerEl.textContent = data.ticker || this.currentTicker;
    if (exchangeEl) exchangeEl.textContent = data.exchange || 'NASDAQ';

    // ── Price with counter animation ──
    const priceEl = document.getElementById('current-price');
    if (priceEl) {
      animateValue(priceEl, 0, data.price, 1200, formatCurrency);
    }

    // ── Price change indicator ──
    const changeEl = document.getElementById('price-change');
    if (changeEl) {
      const isUp = data.change >= 0;
      const sign = isUp ? '+' : '';
      const arrow = isUp ? '▲' : '▼';

      changeEl.className = isUp ? 'up' : 'down';
      changeEl.innerHTML = `
        <span class="change-arrow">${arrow}</span>
        ${sign}${formatCurrency(Math.abs(data.change))} (${sign}${data.changePercent.toFixed(2)}%)
      `;

      // Add pulse glow effect
      changeEl.style.animation = 'none';
      // Force reflow
      void changeEl.offsetHeight;
      changeEl.style.animation = 'pulseFade 2s ease-in-out 3';
    }

    // ── Metrics with staggered animations ──
    const metrics = [
      { id: 'metric-open-val', value: data.open, formatter: formatCurrency },
      { id: 'metric-high-val', value: data.high, formatter: formatCurrency },
      { id: 'metric-low-val', value: data.low, formatter: formatCurrency },
      { id: 'metric-volume-val', value: data.volume, formatter: formatVolume },
      { id: 'metric-mktcap-val', value: data.marketCap, formatter: formatMarketCap },
      { id: 'metric-pe-val', value: data.peRatio, formatter: (v) => formatNumber(v, 1) },
    ];

    metrics.forEach((m, i) => {
      const el = document.getElementById(m.id);
      if (!el) return;

      // Reset animation
      const card = el.closest('.metric-card') || el.parentElement;
      if (card) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(15px)';
      }

      // Staggered reveal
      setTimeout(() => {
        if (card) {
          card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        }

        // Counter animation
        animateValue(el, 0, m.value, 1000, m.formatter);
      }, 100 + i * 80);
    });
  },


  /* ═══════════════════════════════════════════════════════════════
   *  RENDER: PRICE CHART
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Render the price chart and update active range button.
   * @param {Object} data  - Stock data object (needs .history array)
   * @param {string} range - Time range: '1W'|'1M'|'3M'|'1Y'|'5Y'
   */
  renderChart(data, range = '3M') {
    if (!data || !data.history || data.history.length === 0) return;

    // Update active button
    document.querySelectorAll('.chart-btn[data-range]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-range') === range);
    });

    // Draw chart
    Charts.drawPriceChart('price-chart', data.history, { range, animate: true });
  },


  /* ═══════════════════════════════════════════════════════════════
   *  RENDER: AI PREDICTION
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Render the AI prediction section with animated elements.
   * @param {Object} prediction - { direction, confidence, summary, targets, factors }
   */
  renderPrediction(prediction) {
    const container = document.getElementById('ai-prediction');
    if (!container || !prediction) {
      if (container) container.innerHTML = '<p style="color:rgba(255,255,255,0.4); text-align:center;">No prediction available.</p>';
      return;
    }

    const dir = (prediction.direction || 'neutral').toUpperCase();
    const confidence = prediction.confidence || 0;

    // Direction colors & icons
    let dirColor, dirBg, dirArrow, dirBounce;
    if (dir === 'BULLISH') {
      dirColor = '#00FF88';
      dirBg = 'rgba(0, 255, 136, 0.1)';
      dirArrow = '▲';
      dirBounce = 'bounceUp';
    } else if (dir === 'BEARISH') {
      dirColor = '#FF3366';
      dirBg = 'rgba(255, 51, 102, 0.1)';
      dirArrow = '▼';
      dirBounce = 'bounceDown';
    } else {
      dirColor = '#FFD700';
      dirBg = 'rgba(255, 215, 0, 0.1)';
      dirArrow = '◆';
      dirBounce = 'pulse';
    }

    // Confidence gradient color
    const confColor = confidence > 70 ? '#00FF88' : confidence > 40 ? '#FFD700' : '#FF3366';

    // ── Build HTML ──
    let html = '';

    // 1. Direction badge
    html += `
      <div class="prediction-section fade-in-up" style="animation-delay: 0s;">
        <div style="
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 22px;
          background: ${dirBg};
          border: 1px solid ${dirColor}33;
          border-radius: 30px;
          margin-bottom: 16px;
        ">
          <span class="direction-arrow" style="
            color: ${dirColor};
            font-size: 18px;
            animation: ${dirBounce} 1.5s ease-in-out infinite;
          ">${dirArrow}</span>
          <span style="
            color: ${dirColor};
            font-weight: 800;
            font-size: 16px;
            letter-spacing: 2px;
          ">${dir}</span>
        </div>
      </div>
    `;

    // 2. Confidence meter
    html += `
      <div class="prediction-section fade-in-up" style="animation-delay: 0.1s;">
        <div class="confidence-label" style="
          color: rgba(255,255,255,0.6);
          font-size: 13px;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <span>AI Confidence</span>
          <span style="
            color: ${confColor};
            font-weight: 700;
            font-size: 16px;
            font-family: 'SF Mono', 'Fira Code', monospace;
          " id="confidence-value">${confidence}%</span>
        </div>
        <div class="confidence-meter" style="
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,0.06);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 20px;
        ">
          <div class="confidence-fill" id="confidence-fill" style="
            width: 0%;
            height: 100%;
            border-radius: 3px;
            background: linear-gradient(90deg, #FF6B00, ${confColor});
            transition: width 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          "></div>
        </div>
      </div>
    `;

    // 3. Summary
    if (prediction.summary) {
      html += `
        <div class="prediction-section fade-in-up" style="animation-delay: 0.2s;">
          <p style="
            color: rgba(255,255,255,0.7);
            font-size: 14px;
            line-height: 1.7;
            margin-bottom: 24px;
            padding: 14px 18px;
            background: rgba(255,255,255,0.02);
            border-left: 3px solid ${dirColor}55;
            border-radius: 0 8px 8px 0;
          ">${prediction.summary}</p>
        </div>
      `;
    }

    // 4. Price targets
    if (prediction.targets) {
      const targets = [
        { label: 'Short Term', value: prediction.targets.short_term, icon: '⚡' },
        { label: 'Medium Term', value: prediction.targets.medium_term, icon: '📊' },
        { label: 'Long Term', value: prediction.targets.long_term, icon: '🎯' },
      ];

      html += `
        <div class="prediction-section fade-in-up" style="animation-delay: 0.3s;">
          <h4 style="
            color: rgba(255,255,255,0.5);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 14px;
          ">Price Targets</h4>
          <div style="
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 24px;
          ">
            ${targets.map((t, i) => `
              <div class="prediction-card" style="
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.06);
                border-radius: 12px;
                padding: 16px;
                text-align: center;
                transition: border-color 0.3s ease, transform 0.3s ease;
                animation: fadeInUp 0.5s ease ${0.4 + i * 0.1}s both;
              " onmouseenter="this.style.borderColor='${dirColor}44'; this.style.transform='translateY(-3px)';"
                 onmouseleave="this.style.borderColor='rgba(255,255,255,0.06)'; this.style.transform='translateY(0)';">
                <div style="font-size: 20px; margin-bottom: 6px;">${t.icon}</div>
                <div style="
                  color: rgba(255,255,255,0.45);
                  font-size: 11px;
                  text-transform: uppercase;
                  letter-spacing: 1px;
                  margin-bottom: 6px;
                ">${t.label}</div>
                <div style="
                  color: #fff;
                  font-weight: 700;
                  font-size: 18px;
                  font-family: 'SF Mono', 'Fira Code', monospace;
                ">${formatCurrency(t.value)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 5. Key factors
    if (prediction.factors && prediction.factors.length > 0) {
      html += `
        <div class="prediction-section fade-in-up" style="animation-delay: 0.5s;">
          <h4 style="
            color: rgba(255,255,255,0.5);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 14px;
          ">Key Factors</h4>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${prediction.factors.map((f, i) => {
              const isPositive = (f.impact || '').toLowerCase() === 'positive';
              const impactColor = isPositive ? '#00FF88' : '#FF3366';
              const impactDot = isPositive ? '●' : '●';
              return `
                <div class="factor-item" style="
                  display: flex;
                  gap: 12px;
                  align-items: flex-start;
                  padding: 12px 16px;
                  background: rgba(255,255,255,0.02);
                  border-radius: 10px;
                  border: 1px solid rgba(255,255,255,0.04);
                  transition: background 0.3s ease;
                  animation: fadeInUp 0.4s ease ${0.6 + i * 0.08}s both;
                " onmouseenter="this.style.background='rgba(255,255,255,0.04)';"
                   onmouseleave="this.style.background='rgba(255,255,255,0.02)';">
                  <span style="
                    color: ${impactColor};
                    font-size: 8px;
                    margin-top: 5px;
                    flex-shrink: 0;
                  ">${impactDot}</span>
                  <div>
                    <div style="
                      color: rgba(255,255,255,0.85);
                      font-weight: 600;
                      font-size: 13px;
                      margin-bottom: 3px;
                    ">${f.factor}</div>
                    <div style="
                      color: rgba(255,255,255,0.4);
                      font-size: 12px;
                      line-height: 1.5;
                    ">${f.description || ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    // ── Animate confidence meter fill after DOM insert ──
    requestAnimationFrame(() => {
      setTimeout(() => {
        const fill = document.getElementById('confidence-fill');
        if (fill) fill.style.width = confidence + '%';
      }, 200);
    });
  },


  /* ═══════════════════════════════════════════════════════════════
   *  RENDER: NEWS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Render news cards with staggered slide-in animation.
   * @param {Array} news - Array of {title, source, time, sentiment}
   */
  renderNews(news) {
    const container = document.getElementById('news-list');
    if (!container) return;

    if (!news || news.length === 0) {
      container.innerHTML = '<p style="color:rgba(255,255,255,0.4); text-align:center; padding:20px;">No news available.</p>';
      return;
    }

    container.innerHTML = news.map((item, i) => {
      const sentiment = (item.sentiment || 'neutral').toLowerCase();
      let sentimentColor, sentimentBg, sentimentLabel;

      if (sentiment === 'positive') {
        sentimentColor = '#00FF88';
        sentimentBg = 'rgba(0, 255, 136, 0.1)';
        sentimentLabel = 'Positive';
      } else if (sentiment === 'negative') {
        sentimentColor = '#FF3366';
        sentimentBg = 'rgba(255, 51, 102, 0.1)';
        sentimentLabel = 'Negative';
      } else {
        sentimentColor = '#FFD700';
        sentimentBg = 'rgba(255, 215, 0, 0.1)';
        sentimentLabel = 'Neutral';
      }

      return `
        <div class="news-card" style="
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 18px 20px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: all 0.3s ease;
          opacity: 0;
          transform: translateX(30px);
          animation: slideInRight 0.5s ease ${i * 0.08}s forwards;
        " onmouseenter="this.style.background='rgba(255,255,255,0.04)'; this.style.borderColor='rgba(0,212,255,0.15)'; this.style.transform='translateX(0) scale(1.01)';"
           onmouseleave="this.style.background='rgba(255,255,255,0.02)'; this.style.borderColor='rgba(255,255,255,0.05)'; this.style.transform='translateX(0) scale(1)';">
          <div class="news-meta" style="
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
          ">
            <span class="news-source" style="
              color: #00D4FF;
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.8px;
            ">${item.source || 'Unknown'}</span>
            <span class="news-sentiment ${sentiment}" style="
              color: ${sentimentColor};
              background: ${sentimentBg};
              font-size: 10px;
              font-weight: 600;
              padding: 3px 10px;
              border-radius: 20px;
              letter-spacing: 0.5px;
            ">${sentimentLabel}</span>
          </div>
          <div class="news-title" style="
            color: rgba(255, 255, 255, 0.88);
            font-size: 14px;
            font-weight: 500;
            line-height: 1.5;
            margin-bottom: 8px;
          ">${item.title}</div>
          <div class="news-time" style="
            color: rgba(255, 255, 255, 0.3);
            font-size: 11px;
          ">${item.time ? timeAgo(item.time) : ''}</div>
        </div>
      `;
    }).join('');
  },


  /* ═══════════════════════════════════════════════════════════════
   *  CHART RANGE SWITCHING
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Change chart time range and re-render.
   * @param {string} range - '1W'|'1M'|'3M'|'1Y'|'5Y'
   */
  changeChartRange(range) {
    if (!this.currentTicker) return;

    // Update active button
    document.querySelectorAll('.chart-btn[data-range]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-range') === range);
    });

    // Get current data source
    const data = (typeof DEMO_MODE !== 'undefined' && DEMO_MODE)
      ? (typeof MOCK_DATA !== 'undefined' ? MOCK_DATA[this.currentTicker] : null)
      : this.currentStockData;

    if (data) {
      this.renderChart(data, range);
    }
  },


  /* ═══════════════════════════════════════════════════════════════
   *  STATE MANAGEMENT: Welcome / Stock Data
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Show the welcome state, hide stock data.
   */
  showWelcome() {
    const welcomeEl = document.getElementById('welcome-state');
    const stockEl = document.getElementById('stock-data');

    if (welcomeEl) welcomeEl.style.display = '';
    if (stockEl) stockEl.style.display = 'none';

    this.currentTicker = null;
    this.currentStockData = null;

    // Restart hero animation
    this.startHeroAnimation();
  },

  /**
   * Hide the welcome state, show stock data.
   */
  hideWelcome() {
    const welcomeEl = document.getElementById('welcome-state');
    const stockEl = document.getElementById('stock-data');

    if (welcomeEl) welcomeEl.style.display = 'none';
    if (stockEl) {
      stockEl.style.display = '';
      // Fade-in effect
      stockEl.style.opacity = '0';
      stockEl.style.transform = 'translateY(10px)';
      requestAnimationFrame(() => {
        stockEl.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        stockEl.style.opacity = '1';
        stockEl.style.transform = 'translateY(0)';
      });
    }

    // Stop hero animation to save resources
    Charts.destroyHero();
  },


  /* ═══════════════════════════════════════════════════════════════
   *  HERO ANIMATION
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Start the hero candlestick animation in the welcome state.
   */
  startHeroAnimation() {
    Charts.drawHeroCandlesticks('hero-candlesticks');
  },


  /* ═══════════════════════════════════════════════════════════════
   *  LOADING OVERLAY
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Show or hide the loading overlay.
   * @param {boolean} show - Whether to show the overlay
   */
  showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
    }
  },


  /* ═══════════════════════════════════════════════════════════════
   *  LOGOUT
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Handle user logout: clear tokens, show toast, navigate to login.
   */
  handleLogout() {
    if (typeof removeToken === 'function') removeToken();
    if (typeof removeUser === 'function') removeUser();
    showToast('Logged out successfully', 'info');
    window.location.hash = '#login';
  },


  /* ═══════════════════════════════════════════════════════════════
   *  CLEANUP
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Clean up all running animations and listeners.
   */
  cleanup() {
    Charts.destroy();
  },


  /* ═══════════════════════════════════════════════════════════════
   *  UTILITIES
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Promise-based delay utility.
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Inject required keyframe animations into the document if not already present.
   * Called once at init or on first render.
   */
  _injectAnimations() {
    if (document.getElementById('finvision-dashboard-anims')) return;

    const style = document.createElement('style');
    style.id = 'finvision-dashboard-anims';
    style.textContent = `
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes slideInRight {
        from { opacity: 0; transform: translateX(30px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes bounceUp {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-6px); }
      }
      @keyframes bounceDown {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(6px); }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.15); opacity: 0.7; }
      }
      @keyframes pulseFade {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      .fade-in-up { animation: fadeInUp 0.6s ease both; }
    `;
    document.head.appendChild(style);
  }
};

// ── Auto-inject animations when script loads ──
Dashboard._injectAnimations();
