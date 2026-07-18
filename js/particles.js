/**
 * FinVision — Particle Constellation Background
 * 
 * Creates a futuristic network/constellation effect on a full-viewport canvas.
 * Particles float with subtle physics, connect with dim cyan lines, and respond
 * to mouse proximity with a gravity-well effect.
 * 
 * Target: #particles-canvas (full viewport, z-index: -1)
 */

const Particles = {
  canvas: null,
  ctx: null,
  particles: [],
  mouse: { x: -9999, y: -9999 },
  animationId: null,
  resizeHandler: null,
  mouseMoveHandler: null,
  mouseLeaveHandler: null,
  particleCount: 80,
  connectionDistance: 120,
  mouseInfluenceRadius: 150,
  mouseAttractionStrength: 0.015,

  /* ── Color palette for particles ── */
  colors: [
    { r: 0, g: 212, b: 255 },    // cyan
    { r: 0, g: 180, b: 230 },    // mid-cyan
    { r: 0, g: 150, b: 200 },    // darker cyan
    { r: 255, g: 107, b: 0 },    // orange accent
    { r: 255, g: 140, b: 50 },   // lighter orange
    { r: 220, g: 230, b: 255 },  // cool white
    { r: 180, g: 200, b: 255 },  // ice blue
  ],

  /**
   * Initialize the particle system.
   * @param {string} canvasId - The ID of the canvas element (without #)
   */
  init(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.warn(`[Particles] Canvas #${canvasId} not found.`);
      return;
    }

    this.ctx = this.canvas.getContext('2d');
    this.resize(); // Set initial canvas dimensions
    this.createParticles();
    this.bindEvents();
    this.animate();
  },

  /**
   * Create the initial set of particles with random properties.
   */
  createParticles() {
    this.particles = [];
    const { width, height } = this.canvas;

    for (let i = 0; i < this.particleCount; i++) {
      const color = this.colors[Math.floor(Math.random() * this.colors.length)];
      const alpha = 0.3 + Math.random() * 0.5; // 0.3 – 0.8

      this.particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,   // slow horizontal drift
        vy: (Math.random() - 0.5) * 0.4,   // slow vertical drift
        radius: 1 + Math.random() * 2,      // 1 – 3 px
        color,
        alpha,
        baseAlpha: alpha,
        // Pulse phase for subtle breathing
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.005 + Math.random() * 0.01,
      });
    }
  },

  /**
   * Bind window event listeners for mouse tracking and resize.
   */
  bindEvents() {
    this.mouseMoveHandler = (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    };

    this.mouseLeaveHandler = () => {
      // Move mouse off-screen so no attraction when cursor leaves
      this.mouse.x = -9999;
      this.mouse.y = -9999;
    };

    this.resizeHandler = () => this.resize();

    window.addEventListener('mousemove', this.mouseMoveHandler, { passive: true });
    window.addEventListener('mouseleave', this.mouseLeaveHandler, { passive: true });
    window.addEventListener('resize', this.resizeHandler, { passive: true });
  },

  /**
   * Main animation loop — runs at ~60fps via requestAnimationFrame.
   */
  animate() {
    const { ctx, canvas, particles, mouse } = this;
    const width = canvas.width;
    const height = canvas.height;

    // Clear the entire canvas
    ctx.clearRect(0, 0, width, height);

    // ── Update & draw particles ──
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Update pulse (subtle alpha breathing)
      p.pulsePhase += p.pulseSpeed;
      p.alpha = p.baseAlpha + Math.sin(p.pulsePhase) * 0.12;

      // Mouse attraction: gently pull particles toward cursor
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const distToMouse = Math.sqrt(dx * dx + dy * dy);

      if (distToMouse < this.mouseInfluenceRadius && distToMouse > 0) {
        const force = (1 - distToMouse / this.mouseInfluenceRadius) * this.mouseAttractionStrength;
        p.vx += dx / distToMouse * force;
        p.vy += dy / distToMouse * force;
      }

      // Apply gentle friction to keep velocities sane
      p.vx *= 0.995;
      p.vy *= 0.995;

      // Update position
      p.x += p.vx;
      p.y += p.vy;

      // Wrap around edges
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;
      if (p.y < -10) p.y = height + 10;
      if (p.y > height + 10) p.y = -10;

      // ── Draw particle as a glowing circle ──
      this.drawParticle(p);
    }

    // ── Draw connection lines between nearby particles ──
    this.drawConnections();

    // Schedule next frame
    this.animationId = requestAnimationFrame(() => this.animate());
  },

  /**
   * Draw a single particle with radial gradient glow.
   * @param {Object} p - Particle object
   */
  drawParticle(p) {
    const { ctx } = this;
    const { r, g, b } = p.color;
    const glowRadius = p.radius * 4;

    // Radial gradient: bright center fading to transparent
    const gradient = ctx.createRadialGradient(
      p.x, p.y, 0,
      p.x, p.y, glowRadius
    );
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.alpha})`);
    gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.4})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.beginPath();
    ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Solid core
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, p.alpha + 0.2)})`;
    ctx.fill();
  },

  /**
   * Draw connection lines between particles that are within range.
   * Uses spatial optimisation: only check each pair once.
   */
  drawConnections() {
    const { ctx, particles, connectionDistance } = this;
    const distSq = connectionDistance * connectionDistance;

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;

        if (d2 < distSq) {
          const dist = Math.sqrt(d2);
          // Alpha fades with distance: closer = brighter
          const alpha = (1 - dist / connectionDistance) * 0.25; // max 0.25

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
  },

  /**
   * Resize canvas to fill the viewport, accounting for device pixel ratio.
   */
  resize() {
    if (!this.canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';

    this.ctx.scale(dpr, dpr);

    // Re-map canvas dimensions for drawing logic (use CSS pixels)
    // Override width/height to logical pixels for position calculations
    this.canvas._logicalWidth = width;
    this.canvas._logicalHeight = height;

    // Redistribute particles if canvas size changed significantly
    if (this.particles.length > 0) {
      for (const p of this.particles) {
        if (p.x > width) p.x = Math.random() * width;
        if (p.y > height) p.y = Math.random() * height;
      }
    }
  },

  /**
   * Tear down the particle system: cancel animation, remove listeners.
   */
  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.mouseMoveHandler) {
      window.removeEventListener('mousemove', this.mouseMoveHandler);
    }
    if (this.mouseLeaveHandler) {
      window.removeEventListener('mouseleave', this.mouseLeaveHandler);
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }

    this.particles = [];
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
};
