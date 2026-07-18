/* ============================================================
   FinVision — app.js
   Application entry point, SPA router, clock, ticker strip,
   and global UI orchestration.
   ============================================================ */

const App = {
  /** Currently visible view ID (without '#') */
  currentView: null,

  /** Ticker flicker interval reference */
  _tickerFlickerInterval: null,

  /** Clock interval reference */
  _clockInterval: null,

  /* ──────────────────────────────────────────────────────────
     Initialization
     ────────────────────────────────────────────────────────── */
  init() {
    // Hash-based routing
    window.addEventListener('hashchange', () => this.navigate(location.hash));

    // Initialize sub-modules
    if (typeof Auth !== 'undefined') Auth.init();
    if (typeof Dashboard !== 'undefined') Dashboard.init();

    // Bind global UI events
    this.bindGlobalEvents();

    // Start persistent UI elements
    this.startClock();
    this.initTickerStrip();
    this.initParticles();

    // Update user info in header if logged in
    this.updateUserInfo();

    // Navigate to the initial route
    const hash = location.hash || (getToken() || DEMO_MODE ? '#dashboard' : '#login');
    this.navigate(hash);
  },

  /* ──────────────────────────────────────────────────────────
     Global Event Bindings
     ────────────────────────────────────────────────────────── */
  bindGlobalEvents() {
    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        removeToken();
        removeUser();
        showToast('Logged out successfully.', 'info');
        this.navigate('#login');
      });
    }

    // Navigation links (any <a> or element with data-navigate)
    document.addEventListener('click', (e) => {
      const navEl = e.target.closest('[data-navigate]');
      if (navEl) {
        e.preventDefault();
        this.navigate(navEl.getAttribute('data-navigate'));
      }
    });
  },

  /* ──────────────────────────────────────────────────────────
     SPA Router
     ────────────────────────────────────────────────────────── */
  navigate(hash) {
    // Normalise
    hash = hash || '#login';
    if (!hash.startsWith('#')) hash = '#' + hash;

    // Map hash to view ID
    const viewMap = {
      '#login': 'login-view',
      '#signup': 'signup-view',
      '#change-password': 'change-password-view',
      '#dashboard': 'dashboard-view',
    };

    const targetId = viewMap[hash];
    if (!targetId) {
      // Unknown route → default
      this.navigate('#login');
      return;
    }

    // Auth guard (only enforced in non-demo mode)
    if (targetId === 'dashboard-view' && !DEMO_MODE && !getToken()) {
      showToast('Please log in first.', 'error');
      this.navigate('#login');
      return;
    }

    // If already on this view, skip
    if (this.currentView === targetId) return;

    // Deactivate all views
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active');
    });

    // Activate target view
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.classList.add('active');
    }

    // Update hash without re-triggering hashchange
    if (location.hash !== hash) {
      history.replaceState(null, '', hash);
    }

    this.currentView = targetId;

    // View-specific initialization
    this.onViewEnter(targetId);
  },

  /**
   * Called every time a view becomes active.
   */
  onViewEnter(viewId) {
    switch (viewId) {
      case 'login-view':
      case 'signup-view':
      case 'change-password-view':
        // Start hero candlestick animation on auth pages
        this.startHeroCandlesticks();
        break;

      case 'dashboard-view':
        // Stop hero animation (not needed on dashboard)
        this.stopHeroCandlesticks();
        // Update user info
        this.updateUserInfo();
        // Show welcome state by default (if no stock loaded)
        this.showWelcomeState();
        break;
    }
  },

  /* ──────────────────────────────────────────────────────────
     Welcome State
     ────────────────────────────────────────────────────────── */
  showWelcomeState() {
    const welcome = document.getElementById('welcome-state');
    const stockData = document.getElementById('stock-data');
    if (welcome) welcome.style.display = '';
    if (stockData) stockData.style.display = 'none';
  },

  /* ──────────────────────────────────────────────────────────
     Live Clock (Bloomberg Terminal style)
     ────────────────────────────────────────────────────────── */
  startClock() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;

    // Track blinking state for the colon separator
    let colonVisible = true;

    const update = () => {
      const now = new Date();

      // Time components
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');

      // Blinking colon
      const colon = colonVisible ? ':' : ' ';
      colonVisible = !colonVisible;

      // Timezone abbreviation
      const tzName = Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
        .formatToParts(now)
        .find(p => p.type === 'timeZoneName');
      const tz = tzName ? tzName.value : 'EST';

      // Date portion
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[now.getMonth()];
      const day = String(now.getDate()).padStart(2, '0');
      const year = now.getFullYear();

      clockEl.textContent = `${hours}${colon}${minutes}${colon}${seconds} ${tz} • ${month} ${day}, ${year}`;
    };

    update(); // immediate
    this._clockInterval = setInterval(update, 1000);
  },

  /* ──────────────────────────────────────────────────────────
     Ticker Strip
     ────────────────────────────────────────────────────────── */
  initTickerStrip() {
    const content = document.getElementById('ticker-content');
    if (!content) return;

    /**
     * Build a single run of ticker items.
     */
    const buildItems = () => {
      return TICKER_STRIP_DATA.map(t => {
        const positive = t.change >= 0;
        const arrow = positive ? '▲' : '▼';
        const colorClass = positive ? 'ticker-up' : 'ticker-down';
        const priceStr = t.price >= 1000
          ? t.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : t.price.toFixed(2);

        return `<span class="ticker-item ${colorClass}" data-symbol="${t.symbol}">
          <span class="ticker-symbol">${t.symbol}</span>
          <span class="ticker-price">$${priceStr}</span>
          <span class="ticker-change">${arrow} ${Math.abs(t.change).toFixed(2)}%</span>
        </span>`;
      }).join('');
    };

    // Duplicate the content for seamless infinite scrolling
    const run = buildItems();
    content.innerHTML = run + run;

    // Start the live price flicker effect
    this.startTickerFlicker(content);
  },

  /**
   * Randomly nudge prices in the ticker strip every 2–4 seconds
   * to simulate live market data.
   */
  startTickerFlicker(container) {
    if (this._tickerFlickerInterval) clearInterval(this._tickerFlickerInterval);

    this._tickerFlickerInterval = setInterval(() => {
      const items = container.querySelectorAll('.ticker-item');
      if (!items.length) return;

      // Pick 2–3 random items to update
      const count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * items.length);
        const item = items[idx];
        const symbol = item.getAttribute('data-symbol');
        const tickerData = TICKER_STRIP_DATA.find(t => t.symbol === symbol);
        if (!tickerData) continue;

        // Tiny random nudge: ±0.01–0.15%
        const nudge = (Math.random() - 0.48) * 0.3; // slight upward bias
        tickerData.price = parseFloat((tickerData.price * (1 + nudge / 100)).toFixed(2));
        tickerData.change = parseFloat((tickerData.change + nudge * 0.1).toFixed(2));

        // Update DOM
        const priceEl = item.querySelector('.ticker-price');
        const changeEl = item.querySelector('.ticker-change');

        if (priceEl) {
          const priceStr = tickerData.price >= 1000
            ? tickerData.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : tickerData.price.toFixed(2);
          priceEl.textContent = '$' + priceStr;
        }

        if (changeEl) {
          const positive = tickerData.change >= 0;
          const arrow = positive ? '▲' : '▼';
          changeEl.textContent = `${arrow} ${Math.abs(tickerData.change).toFixed(2)}%`;

          // Update color class
          item.classList.remove('ticker-up', 'ticker-down');
          item.classList.add(positive ? 'ticker-up' : 'ticker-down');
        }

        // Flash effect: brief highlight
        item.classList.add('ticker-flash');
        setTimeout(() => item.classList.remove('ticker-flash'), 400);
      }
    }, 2500);
  },

  /* ──────────────────────────────────────────────────────────
     Loading Overlay
     ────────────────────────────────────────────────────────── */
  showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;

    if (show) {
      overlay.classList.add('visible');
      overlay.style.display = 'flex';
    } else {
      overlay.classList.remove('visible');
      // Let fade-out transition complete before hiding
      setTimeout(() => {
        if (!overlay.classList.contains('visible')) {
          overlay.style.display = 'none';
        }
      }, 400);
    }
  },

  /* ──────────────────────────────────────────────────────────
     User Info
     ────────────────────────────────────────────────────────── */
  updateUserInfo() {
    const user = getUser();
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');

    if (nameEl) {
      nameEl.textContent = user?.name || (DEMO_MODE ? 'Demo User' : 'Guest');
    }

    if (avatarEl) {
      // Set avatar initials as fallback
      const name = user?.name || (DEMO_MODE ? 'Demo User' : 'Guest');
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

      if (user?.avatar) {
        avatarEl.style.backgroundImage = `url(${user.avatar})`;
        avatarEl.textContent = '';
      } else {
        avatarEl.style.backgroundImage = '';
        avatarEl.textContent = initials;
      }
    }
  },

  /* ──────────────────────────────────────────────────────────
     Particle Background
     ────────────────────────────────────────────────────────── */
  initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId = null;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', debounce(resize, 200));
    resize();

    // Particle count scales with viewport
    const count = Math.floor((canvas.width * canvas.height) / 18000);

    class Particle {
      constructor() {
        this.reset();
      }

      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 1.8 + 0.3;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.speedY = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.4 + 0.1;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        // Wrap around edges
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${this.opacity})`;
        ctx.fill();
      }
    }

    // Initialize particles
    for (let i = 0; i < count; i++) {
      particles.push(new Particle());
    }

    // Draw connections between nearby particles
    function drawConnections() {
      const maxDist = 120;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDist) {
            const opacity = (1 - dist / maxDist) * 0.12;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 229, 255, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.update();
        p.draw();
      });

      drawConnections();
      animationId = requestAnimationFrame(animate);
    }

    animate();
  },

  /* ──────────────────────────────────────────────────────────
     Hero Candlesticks (auth page background animation)
     ────────────────────────────────────────────────────────── */
  _heroCandlestickInterval: null,

  startHeroCandlesticks() {
    const container = document.getElementById('hero-candlesticks');
    if (!container) return;

    // Clear previous
    this.stopHeroCandlesticks();
    container.innerHTML = '';

    const candleCount = 28;
    const containerWidth = container.offsetWidth || 600;
    const gap = containerWidth / candleCount;

    // Generate initial candles
    for (let i = 0; i < candleCount; i++) {
      const candle = document.createElement('div');
      candle.className = 'hero-candle';
      candle.style.left = `${i * gap}px`;

      const isGreen = Math.random() > 0.42;
      const bodyHeight = 15 + Math.random() * 50;
      const wickTop = 5 + Math.random() * 20;
      const wickBottom = 5 + Math.random() * 20;
      const totalHeight = wickTop + bodyHeight + wickBottom;
      const bottomOffset = 20 + Math.random() * 40;

      candle.style.bottom = `${bottomOffset}%`;
      candle.style.height = `${totalHeight}px`;
      candle.style.setProperty('--body-height', `${bodyHeight}px`);
      candle.style.setProperty('--wick-top', `${wickTop}px`);
      candle.style.setProperty('--wick-bottom', `${wickBottom}px`);
      candle.classList.add(isGreen ? 'candle-green' : 'candle-red');
      candle.style.opacity = `${0.15 + Math.random() * 0.25}`;
      candle.style.animationDelay = `${i * 0.08}s`;

      container.appendChild(candle);
    }

    // Periodically shift candles for a scrolling chart effect
    let shift = 0;
    this._heroCandlestickInterval = setInterval(() => {
      shift -= 0.5;
      container.style.transform = `translateX(${shift}px)`;

      // Reset when shifted enough
      if (Math.abs(shift) > gap) {
        shift = 0;
        container.style.transform = 'translateX(0)';

        // Recycle first candle to end with new random values
        const first = container.firstElementChild;
        if (first) {
          const isGreen = Math.random() > 0.42;
          const bodyHeight = 15 + Math.random() * 50;
          const wickTop = 5 + Math.random() * 20;
          const wickBottom = 5 + Math.random() * 20;
          const bottomOffset = 20 + Math.random() * 40;

          first.classList.remove('candle-green', 'candle-red');
          first.classList.add(isGreen ? 'candle-green' : 'candle-red');
          first.style.bottom = `${bottomOffset}%`;
          first.style.height = `${wickTop + bodyHeight + wickBottom}px`;
          first.style.setProperty('--body-height', `${bodyHeight}px`);
          first.style.setProperty('--wick-top', `${wickTop}px`);
          first.style.setProperty('--wick-bottom', `${wickBottom}px`);
          first.style.opacity = `${0.15 + Math.random() * 0.25}`;

          container.appendChild(first);
        }
      }
    }, 50);
  },

  stopHeroCandlesticks() {
    if (this._heroCandlestickInterval) {
      clearInterval(this._heroCandlestickInterval);
      this._heroCandlestickInterval = null;
    }
  },
};

// ── Bootstrap ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
