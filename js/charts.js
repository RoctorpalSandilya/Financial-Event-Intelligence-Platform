/**
 * FinVision — Charts Module
 * 
 * Canvas-based charting for:
 *   1. Interactive price line/area chart with animated draw-in, gradient fill,
 *      crosshair tooltip, and smooth bezier curves.
 *   2. Animated hero candlestick chart with glow effects and infinite loop.
 *
 * Targets:
 *   - #price-chart   (responsive width × 350px, inside .chart-section)
 *   - #hero-candlesticks (800×300px container in welcome state)
 */

const Charts = {

  /* ═══════════════════════════════════════════════════════════════
   *  PRICE CHART — Bloomberg-style line/area with crosshair
   * ═══════════════════════════════════════════════════════════════ */

  /** Active crosshair listener reference (for cleanup) */
  _priceChartMouseHandler: null,
  _priceChartMouseLeaveHandler: null,
  _priceChartAnimId: null,
  _priceChartData: null,

  /**
   * Draw an animated price chart on a canvas element.
   *
   * @param {string} canvasId   - Canvas element ID (e.g. 'price-chart')
   * @param {Array}  historyData - Array of {date, open, high, low, close}
   * @param {Object} options     - { range: '1W'|'1M'|'3M'|'1Y'|'5Y', animate: true }
   */
  drawPriceChart(canvasId, historyData, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !historyData || historyData.length === 0) return;

    const ctx = canvas.getContext('2d');
    const range = options.range || '3M';
    const shouldAnimate = options.animate !== false;

    // ── Cancel any in-progress animation ──
    if (this._priceChartAnimId) {
      cancelAnimationFrame(this._priceChartAnimId);
      this._priceChartAnimId = null;
    }

    // ── Remove old mouse listeners ──
    if (this._priceChartMouseHandler) {
      canvas.removeEventListener('mousemove', this._priceChartMouseHandler);
      canvas.removeEventListener('mouseleave', this._priceChartMouseLeaveHandler);
    }

    // ── Sizing with device pixel ratio ──
    const dpr = window.devicePixelRatio || 1;
    const container = canvas.parentElement;
    const cssWidth = container ? container.clientWidth : canvas.clientWidth || 700;
    const cssHeight = 350;

    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    ctx.scale(dpr, dpr);

    // ── Filter data by range ──
    const data = this._filterByRange(historyData, range);
    if (data.length === 0) return;

    this._priceChartData = data;

    // ── Chart layout ──
    const padding = { top: 20, right: 70, bottom: 40, left: 15 };
    const chartW = cssWidth - padding.left - padding.right;
    const chartH = cssHeight - padding.top - padding.bottom;

    // ── Y-axis scale (close prices) ──
    const closes = data.map(d => d.close);
    const dataMin = Math.min(...closes);
    const dataMax = Math.max(...closes);
    const yPad = (dataMax - dataMin) * 0.08 || 1;
    const yMin = dataMin - yPad;
    const yMax = dataMax + yPad;

    const toX = (i) => padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
    const toY = (val) => padding.top + (1 - (val - yMin) / (yMax - yMin)) * chartH;

    // Determine color: gain or loss
    const isGain = data[data.length - 1].close >= data[0].close;
    const lineColor = isGain ? '#00D4FF' : '#FF3366';
    const lineColorRGB = isGain ? '0, 212, 255' : '255, 51, 102';

    // ── Build bezier path points ──
    const points = data.map((d, i) => ({ x: toX(i), y: toY(d.close) }));

    // ── Render function (called at each animation frame) ──
    const renderFrame = (progress) => {
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // — Grid lines —
      this._drawGrid(ctx, padding, chartW, chartH, yMin, yMax, cssWidth);

      // — X-axis labels —
      this._drawXLabels(ctx, data, toX, cssHeight, padding);

      // — Clipping mask for animation progress —
      const clipX = padding.left + chartW * progress;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, clipX, cssHeight);
      ctx.clip();

      // — Price line (smooth bezier) —
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.quadraticCurveTo(prev.x + (cpx - prev.x) * 0.8, prev.y, cpx, (prev.y + curr.y) / 2);
        ctx.quadraticCurveTo(curr.x - (curr.x - cpx) * 0.8, curr.y, curr.x, curr.y);
      }
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // — Gradient fill below line —
      const fillPath = new Path2D();
      fillPath.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        fillPath.quadraticCurveTo(prev.x + (cpx - prev.x) * 0.8, prev.y, cpx, (prev.y + curr.y) / 2);
        fillPath.quadraticCurveTo(curr.x - (curr.x - cpx) * 0.8, curr.y, curr.x, curr.y);
      }
      fillPath.lineTo(points[points.length - 1].x, padding.top + chartH);
      fillPath.lineTo(points[0].x, padding.top + chartH);
      fillPath.closePath();

      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      gradient.addColorStop(0, `rgba(${lineColorRGB}, 0.25)`);
      gradient.addColorStop(0.6, `rgba(${lineColorRGB}, 0.06)`);
      gradient.addColorStop(1, `rgba(${lineColorRGB}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fill(fillPath);

      // — Data point dots —
      const visibleCount = Math.floor(progress * points.length);
      for (let i = 0; i < visibleCount && i < points.length; i++) {
        if (data.length <= 30 || i % Math.ceil(data.length / 30) === 0 || i === data.length - 1) {
          ctx.beginPath();
          ctx.arc(points[i].x, points[i].y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = lineColor;
          ctx.fill();
        }
      }

      ctx.restore();
    };

    // ── Animation ──
    if (shouldAnimate) {
      const duration = 1500; // ms
      const startTime = performance.now();

      const step = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const progress = this.easeOutCubic(t);

        renderFrame(progress);

        if (t < 1) {
          this._priceChartAnimId = requestAnimationFrame(step);
        } else {
          this._priceChartAnimId = null;
          // Attach crosshair after animation completes
          this._attachCrosshair(canvas, ctx, data, points, padding, chartW, chartH, yMin, yMax, lineColor, cssWidth, cssHeight);
        }
      };

      this._priceChartAnimId = requestAnimationFrame(step);
    } else {
      renderFrame(1);
      this._attachCrosshair(canvas, ctx, data, points, padding, chartW, chartH, yMin, yMax, lineColor, cssWidth, cssHeight);
    }
  },

  /**
   * Draw subtle horizontal grid lines with right-aligned price labels.
   */
  _drawGrid(ctx, padding, chartW, chartH, yMin, yMax, cssWidth) {
    const gridLines = 5;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 0.5;

    for (let i = 0; i <= gridLines; i++) {
      const ratio = i / gridLines;
      const y = padding.top + ratio * chartH;
      const value = yMax - ratio * (yMax - yMin);

      // Grid line
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(cssWidth - padding.right, y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.stroke();

      // Price label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '11px "Inter", "SF Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('$' + value.toFixed(2), cssWidth - padding.right + 8, y + 4);
    }

    ctx.setLineDash([]);
    ctx.restore();
  },

  /**
   * Draw X-axis date labels.
   */
  _drawXLabels(ctx, data, toX, cssHeight, padding) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '10px "Inter", sans-serif';
    ctx.textAlign = 'center';

    // Show ~6-8 labels max
    const step = Math.max(1, Math.floor(data.length / 7));
    for (let i = 0; i < data.length; i += step) {
      const x = toX(i);
      const dateStr = this._formatShortDate(data[i].date);
      ctx.fillText(dateStr, x, cssHeight - padding.bottom + 20);
    }
    // Always show last date
    if (data.length > 1) {
      const lastX = toX(data.length - 1);
      ctx.fillText(this._formatShortDate(data[data.length - 1].date), lastX, cssHeight - padding.bottom + 20);
    }

    ctx.restore();
  },

  /**
   * Attach interactive crosshair + tooltip on mousemove.
   */
  _attachCrosshair(canvas, ctx, data, points, padding, chartW, chartH, yMin, yMax, lineColor, cssWidth, cssHeight) {
    const self = this;

    const drawStatic = () => {
      // Redraw chart without crosshair
      self.drawPriceChart(canvas.id, self._priceChartData, { range: undefined, animate: false });
    };

    this._priceChartMouseHandler = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Find closest data point
      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = Math.abs(points[i].x - mx);
        if (d < minDist) { minDist = d; closest = i; }
      }

      if (minDist > 50) return; // too far

      const dpr = window.devicePixelRatio || 1;

      // Full re-render at progress 1 (no animation)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      // Redraw grid
      self._drawGrid(ctx, padding, chartW, chartH, yMin, yMax, cssWidth);
      self._drawXLabels(ctx, data, (i) => points[i] ? points[i].x : 0, cssHeight, padding);

      // Determine colors
      const isGain = data[data.length - 1].close >= data[0].close;
      const lc = isGain ? '#00D4FF' : '#FF3366';
      const lcRGB = isGain ? '0, 212, 255' : '255, 51, 102';

      // Redraw line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.quadraticCurveTo(prev.x + (cpx - prev.x) * 0.8, prev.y, cpx, (prev.y + curr.y) / 2);
        ctx.quadraticCurveTo(curr.x - (curr.x - cpx) * 0.8, curr.y, curr.x, curr.y);
      }
      ctx.strokeStyle = lc;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Gradient fill
      const fillPath = new Path2D();
      fillPath.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        fillPath.quadraticCurveTo(prev.x + (cpx - prev.x) * 0.8, prev.y, cpx, (prev.y + curr.y) / 2);
        fillPath.quadraticCurveTo(curr.x - (curr.x - cpx) * 0.8, curr.y, curr.x, curr.y);
      }
      fillPath.lineTo(points[points.length - 1].x, padding.top + chartH);
      fillPath.lineTo(points[0].x, padding.top + chartH);
      fillPath.closePath();
      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      gradient.addColorStop(0, `rgba(${lcRGB}, 0.25)`);
      gradient.addColorStop(0.6, `rgba(${lcRGB}, 0.06)`);
      gradient.addColorStop(1, `rgba(${lcRGB}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fill(fillPath);

      // ── Crosshair ──
      const px = points[closest].x;
      const py = points[closest].y;
      const d = data[closest];

      // Vertical dashed line
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, padding.top);
      ctx.lineTo(px, padding.top + chartH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // Horizontal dashed line
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, py);
      ctx.lineTo(cssWidth - padding.right, py);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Glowing circle at intersection
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${lcRGB}, 0.3)`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = lc;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      // ── Tooltip box ──
      const tooltipW = 160;
      const tooltipH = 90;
      let tx = px + 15;
      if (tx + tooltipW > cssWidth - 10) tx = px - tooltipW - 15;
      let ty = py - tooltipH / 2;
      if (ty < 10) ty = 10;
      if (ty + tooltipH > cssHeight - 10) ty = cssHeight - tooltipH - 10;

      // Background
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 12;
      self.roundRect(ctx, tx, ty, tooltipW, tooltipH, 8);
      ctx.fillStyle = 'rgba(15, 20, 35, 0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Text
      ctx.font = '10px "Inter", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(self._formatShortDate(d.date), tx + 12, ty + 18);

      ctx.font = 'bold 13px "Inter", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('$' + d.close.toFixed(2), tx + 12, ty + 36);

      ctx.font = '10px "Inter", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillText(`O: $${d.open.toFixed(2)}  H: $${d.high.toFixed(2)}`, tx + 12, ty + 54);
      ctx.fillText(`L: $${d.low.toFixed(2)}   C: $${d.close.toFixed(2)}`, tx + 12, ty + 70);

      ctx.restore();
    };

    this._priceChartMouseLeaveHandler = () => {
      // Redraw without crosshair
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      const isGain = data[data.length - 1].close >= data[0].close;
      const lc = isGain ? '#00D4FF' : '#FF3366';
      const lcRGB = isGain ? '0, 212, 255' : '255, 51, 102';

      self._drawGrid(ctx, padding, chartW, chartH, yMin, yMax, cssWidth);
      self._drawXLabels(ctx, data, (i) => points[i] ? points[i].x : 0, cssHeight, padding);

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.quadraticCurveTo(prev.x + (cpx - prev.x) * 0.8, prev.y, cpx, (prev.y + curr.y) / 2);
        ctx.quadraticCurveTo(curr.x - (curr.x - cpx) * 0.8, curr.y, curr.x, curr.y);
      }
      ctx.strokeStyle = lc;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      const fillPath = new Path2D();
      fillPath.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        fillPath.quadraticCurveTo(prev.x + (cpx - prev.x) * 0.8, prev.y, cpx, (prev.y + curr.y) / 2);
        fillPath.quadraticCurveTo(curr.x - (curr.x - cpx) * 0.8, curr.y, curr.x, curr.y);
      }
      fillPath.lineTo(points[points.length - 1].x, padding.top + chartH);
      fillPath.lineTo(points[0].x, padding.top + chartH);
      fillPath.closePath();
      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      gradient.addColorStop(0, `rgba(${lcRGB}, 0.25)`);
      gradient.addColorStop(0.6, `rgba(${lcRGB}, 0.06)`);
      gradient.addColorStop(1, `rgba(${lcRGB}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fill(fillPath);

      // Dots
      for (let i = 0; i < points.length; i++) {
        if (data.length <= 30 || i % Math.ceil(data.length / 30) === 0 || i === data.length - 1) {
          ctx.beginPath();
          ctx.arc(points[i].x, points[i].y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = lc;
          ctx.fill();
        }
      }
    };

    canvas.addEventListener('mousemove', this._priceChartMouseHandler);
    canvas.addEventListener('mouseleave', this._priceChartMouseLeaveHandler);
  },

  /**
   * Filter history data by range string.
   */
  _filterByRange(data, range) {
    if (!data || data.length === 0) return [];
    const map = { '1W': 5, '1M': 22, '3M': 65, '1Y': 252, '5Y': data.length };
    const count = map[range] || 65;
    return data.slice(-Math.min(count, data.length));
  },

  /**
   * Format a date string to short display form (e.g. "Jan 15").
   */
  _formatShortDate(dateStr) {
    try {
      const d = new Date(dateStr);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${months[d.getMonth()]} ${d.getDate()}`;
    } catch {
      return dateStr;
    }
  },


  /* ═══════════════════════════════════════════════════════════════
   *  HERO CANDLESTICK ANIMATION — Looping spectacle
   * ═══════════════════════════════════════════════════════════════ */

  _heroCanvas: null,
  _heroCtx: null,
  _heroAnimId: null,
  _heroCycleTimeout: null,

  /**
   * Create and animate a mesmerizing candlestick chart inside a container.
   * Loops infinitely: grow → hold → fade → regenerate.
   *
   * @param {string} containerId - Container element ID (e.g. 'hero-candlesticks')
   */
  drawHeroCandlesticks(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Cleanup previous
    this.destroyHero();

    // Create canvas
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    const cssW = container.clientWidth || 800;
    const cssH = container.clientHeight || 300;

    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    container.innerHTML = '';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    this._heroCanvas = canvas;
    this._heroCtx = ctx;

    // Start the loop
    this._runHeroCycle(ctx, cssW, cssH);
  },

  /**
   * Run a single hero cycle: generate candles, animate grow-in, hold, fade out, repeat.
   */
  _runHeroCycle(ctx, w, h) {
    const candleCount = 30;
    const candles = this._generateCandles(candleCount, w, h);
    const staggerDelay = 30;   // ms between each candle start
    const growDuration = 800;  // ms for each candle to grow
    const holdDuration = 2500; // ms to hold at full
    const fadeDuration = 600;  // ms to fade out
    const totalGrowTime = staggerDelay * (candleCount - 1) + growDuration;

    let startTime = null;
    let phase = 'grow'; // 'grow' | 'hold' | 'fade'
    let phaseStart = null;

    const animate = (now) => {
      if (!startTime) { startTime = now; phaseStart = now; }

      ctx.clearRect(0, 0, w, h);

      const phaseElapsed = now - phaseStart;

      if (phase === 'grow') {
        // Draw each candle with staggered growth
        for (let i = 0; i < candles.length; i++) {
          const candleStart = i * staggerDelay;
          const elapsed = (now - startTime) - candleStart;
          const t = Math.max(0, Math.min(1, elapsed / growDuration));
          const progress = this.easeOutCubic(t);
          this._drawHeroCandle(ctx, candles[i], progress, 1, h);
        }

        if (phaseElapsed >= totalGrowTime) {
          phase = 'hold';
          phaseStart = now;
        }
      } else if (phase === 'hold') {
        // Draw all candles fully, add subtle float
        for (let i = 0; i < candles.length; i++) {
          const floatOffset = Math.sin(now * 0.001 + i * 0.5) * 2;
          this._drawHeroCandle(ctx, candles[i], 1, 1, h, floatOffset);
        }

        if (phaseElapsed >= holdDuration) {
          phase = 'fade';
          phaseStart = now;
        }
      } else if (phase === 'fade') {
        const fadeProgress = Math.min(1, phaseElapsed / fadeDuration);
        const alpha = 1 - this.easeOutCubic(fadeProgress);

        for (let i = 0; i < candles.length; i++) {
          const floatOffset = Math.sin(now * 0.001 + i * 0.5) * 2;
          this._drawHeroCandle(ctx, candles[i], 1, alpha, h, floatOffset);
        }

        if (fadeProgress >= 1) {
          // Restart cycle with new data
          this._heroAnimId = null;
          this._heroCycleTimeout = setTimeout(() => {
            this._runHeroCycle(ctx, w, h);
          }, 200);
          return;
        }
      }

      this._heroAnimId = requestAnimationFrame(animate);
    };

    this._heroAnimId = requestAnimationFrame(animate);
  },

  /**
   * Generate random candlestick data for the hero animation.
   */
  _generateCandles(count, width, height) {
    const candles = [];
    const candleWidth = (width / count) * 0.6;
    const gap = (width / count) * 0.4;
    const margin = 30;

    let price = 50 + Math.random() * 50; // starting price

    for (let i = 0; i < count; i++) {
      // Random walk
      price += (Math.random() - 0.48) * 8;
      price = Math.max(20, Math.min(100, price));

      const open = price + (Math.random() - 0.5) * 10;
      const close = price + (Math.random() - 0.5) * 10;
      const high = Math.max(open, close) + Math.random() * 6;
      const low = Math.min(open, close) - Math.random() * 6;

      const isGreen = close >= open;
      const x = i * (candleWidth + gap) + gap / 2;

      // Map prices to pixel Y (inverted — higher price = lower Y)
      const priceRange = 120; // max range
      const toY = (val) => margin + ((100 - val) / priceRange) * (height - margin * 2);

      candles.push({
        x,
        width: candleWidth,
        openY: toY(open),
        closeY: toY(close),
        highY: toY(high),
        lowY: toY(low),
        isGreen,
        bodyTop: toY(Math.max(open, close)),
        bodyBottom: toY(Math.min(open, close)),
      });
    }

    return candles;
  },

  /**
   * Draw a single hero candle with growth progress, opacity, and optional float offset.
   */
  _drawHeroCandle(ctx, c, progress, alpha, canvasH, floatOffset = 0) {
    if (alpha <= 0 || progress <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    const bodyH = Math.abs(c.bodyBottom - c.bodyTop);
    const wickTop = c.highY;
    const wickBot = c.lowY;

    // Animate from bottom: scale height by progress
    const baseY = canvasH - 20; // baseline
    const fullBodyTop = c.bodyTop + floatOffset;
    const fullBodyBot = c.bodyBottom + floatOffset;
    const fullWickTop = wickTop + floatOffset;
    const fullWickBot = wickBot + floatOffset;

    // Interpolate Y positions from baseY upward
    const animBodyTop = baseY + (fullBodyTop - baseY) * progress;
    const animBodyBot = baseY + (fullBodyBot - baseY) * progress;
    const animWickTop = baseY + (fullWickTop - baseY) * progress;
    const animWickBot = baseY + (fullWickBot - baseY) * progress;

    const color = c.isGreen ? '#00FF88' : '#FF3366';
    const colorRGB = c.isGreen ? '0, 255, 136' : '255, 51, 102';

    // Glow shadow
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    // Wick line
    const wickX = c.x + c.width / 2;
    ctx.beginPath();
    ctx.moveTo(wickX, animWickTop);
    ctx.lineTo(wickX, animWickBot);
    ctx.strokeStyle = `rgba(${colorRGB}, ${0.6 * alpha})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Candle body (rounded rect)
    const bodyYStart = Math.min(animBodyTop, animBodyBot);
    const bodyYHeight = Math.max(2, Math.abs(animBodyBot - animBodyTop));

    ctx.shadowBlur = 18;
    this.roundRect(ctx, c.x, bodyYStart, c.width, bodyYHeight, 2);

    // Gradient fill for body
    const bodyGrad = ctx.createLinearGradient(c.x, bodyYStart, c.x, bodyYStart + bodyYHeight);
    bodyGrad.addColorStop(0, `rgba(${colorRGB}, ${0.9 * alpha})`);
    bodyGrad.addColorStop(1, `rgba(${colorRGB}, ${0.5 * alpha})`);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();
  },

  /**
   * Destroy the hero candlestick animation and clean up.
   */
  destroyHero() {
    if (this._heroAnimId) {
      cancelAnimationFrame(this._heroAnimId);
      this._heroAnimId = null;
    }
    if (this._heroCycleTimeout) {
      clearTimeout(this._heroCycleTimeout);
      this._heroCycleTimeout = null;
    }
  },


  /* ═══════════════════════════════════════════════════════════════
   *  UTILITY HELPERS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Cubic ease-out: decelerating to zero velocity.
   * @param {number} t - Progress 0..1
   * @returns {number} Eased value 0..1
   */
  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  },

  /**
   * Draw a rounded rectangle path (and begin path).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} r - Corner radius
   */
  roundRect(ctx, x, y, w, h, r) {
    if (w < 0) { x += w; w = Math.abs(w); }
    if (h < 0) { y += h; h = Math.abs(h); }
    r = Math.min(r, w / 2, h / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  /**
   * Cleanup all chart resources.
   */
  destroy() {
    if (this._priceChartAnimId) {
      cancelAnimationFrame(this._priceChartAnimId);
      this._priceChartAnimId = null;
    }
    this.destroyHero();

    const canvas = document.getElementById('price-chart');
    if (canvas && this._priceChartMouseHandler) {
      canvas.removeEventListener('mousemove', this._priceChartMouseHandler);
      canvas.removeEventListener('mouseleave', this._priceChartMouseLeaveHandler);
    }
  }
};
