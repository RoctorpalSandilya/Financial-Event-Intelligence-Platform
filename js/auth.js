/* ============================================================
   FinVision — auth.js
   Authentication: login, signup, change password, password
   strength checker, and form micro-animations.
   ============================================================ */

const Auth = {
  /** Cache of original button text for loading state restoration */
  _btnTextCache: new WeakMap(),

  /* ──────────────────────────────────────────────────────────
     Initialization
     ────────────────────────────────────────────────────────── */
  init() {
    // Attach form submit handlers
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const changePasswordForm = document.getElementById('change-password-form');

    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }
    if (signupForm) {
      signupForm.addEventListener('submit', (e) => this.handleSignup(e));
    }
    if (changePasswordForm) {
      changePasswordForm.addEventListener('submit', (e) => this.handleChangePassword(e));
    }

    // Real-time password strength checker
    const signupPassword = document.getElementById('signup-password');
    if (signupPassword) {
      signupPassword.addEventListener('input', (e) => {
        this.checkPasswordStrength(e.target.value);
      });
    }

    // Input focus animations — add glow class on focus
    this.initInputAnimations();
  },

  /* ──────────────────────────────────────────────────────────
     Input Focus Animations
     ────────────────────────────────────────────────────────── */
  initInputAnimations() {
    // All inputs inside auth forms get a focus glow effect
    const inputs = document.querySelectorAll(
      '#login-form input, #signup-form input, #change-password-form input'
    );

    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        input.parentElement?.classList.add('input-focused');
      });
      input.addEventListener('blur', () => {
        input.parentElement?.classList.remove('input-focused');
      });

      // Floating label effect — mark as filled when value exists
      input.addEventListener('input', () => {
        if (input.value.length > 0) {
          input.classList.add('has-value');
        } else {
          input.classList.remove('has-value');
        }
      });
    });
  },

  /* ──────────────────────────────────────────────────────────
     Login Handler
     ────────────────────────────────────────────────────────── */
  async handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const submitBtn = document.getElementById('login-submit-btn');
    const form = document.getElementById('login-form');

    // Basic validation
    if (!email || !password) {
      showToast('Please fill in all fields.', 'error');
      this.shakeForm(form);
      return;
    }

    // Email format validation
    if (!this.isValidEmail(email)) {
      showToast('Please enter a valid email address.', 'error');
      this.shakeForm(form);
      return;
    }

    this.setButtonLoading(submitBtn, true);

    try {
      if (DEMO_MODE) {
        // Simulate network delay
        await new Promise(r => setTimeout(r, 800));

        const mockUser = { name: 'Demo User', email, avatar: null };
        setToken('demo_jwt_token_' + Date.now());
        setUser(mockUser);
      } else {
        const data = await apiFetch('/auth/login', {
          method: 'POST',
          body: { email, password },
        });

        setToken(data.token);
        setUser(data.user);
      }

      // Success animation
      this.flashSuccess(submitBtn);
      showToast('Welcome back! Logging you in…', 'success');

      // Brief pause for the success animation, then navigate
      await new Promise(r => setTimeout(r, 600));
      App.navigate('#dashboard');
    } catch (err) {
      showToast(err.message || 'Login failed. Please try again.', 'error');
      this.shakeForm(form);
    } finally {
      this.setButtonLoading(submitBtn, false);
    }
  },

  /* ──────────────────────────────────────────────────────────
     Signup Handler
     ────────────────────────────────────────────────────────── */
  async handleSignup(e) {
    e.preventDefault();

    const name = document.getElementById('signup-name')?.value.trim();
    const email = document.getElementById('signup-email')?.value.trim();
    const password = document.getElementById('signup-password')?.value;
    const confirm = document.getElementById('signup-confirm')?.value;
    const submitBtn = document.getElementById('signup-submit-btn');
    const form = document.getElementById('signup-form');

    // Validation
    if (!name || !email || !password || !confirm) {
      showToast('Please fill in all fields.', 'error');
      this.shakeForm(form);
      return;
    }

    if (!this.isValidEmail(email)) {
      showToast('Please enter a valid email address.', 'error');
      this.shakeForm(form);
      return;
    }

    if (password !== confirm) {
      showToast('Passwords do not match.', 'error');
      this.shakeForm(form);
      return;
    }

    // Check password strength
    const strength = this.getPasswordStrengthLevel(password);
    if (strength === 'weak') {
      showToast('Password is too weak. Use at least 8 characters with mixed case, numbers, and symbols.', 'error');
      this.shakeForm(form);
      return;
    }

    this.setButtonLoading(submitBtn, true);

    try {
      if (DEMO_MODE) {
        await new Promise(r => setTimeout(r, 800));

        const mockUser = { name, email, avatar: null };
        setToken('demo_jwt_token_' + Date.now());
        setUser(mockUser);
      } else {
        const data = await apiFetch('/auth/signup', {
          method: 'POST',
          body: { name, email, password },
        });

        setToken(data.token);
        setUser(data.user);
      }

      this.flashSuccess(submitBtn);
      showToast('Account created! Welcome to FinVision.', 'success');

      await new Promise(r => setTimeout(r, 600));
      App.navigate('#dashboard');
    } catch (err) {
      showToast(err.message || 'Signup failed. Please try again.', 'error');
      this.shakeForm(form);
    } finally {
      this.setButtonLoading(submitBtn, false);
    }
  },

  /* ──────────────────────────────────────────────────────────
     Change Password Handler
     ────────────────────────────────────────────────────────── */
  async handleChangePassword(e) {
    e.preventDefault();

    const currentPw = document.getElementById('current-password')?.value;
    const newPw = document.getElementById('new-password')?.value;
    const confirmPw = document.getElementById('confirm-new-password')?.value;
    const submitBtn = document.getElementById('change-password-submit-btn');
    const form = document.getElementById('change-password-form');

    // Validation
    if (!currentPw || !newPw || !confirmPw) {
      showToast('Please fill in all fields.', 'error');
      this.shakeForm(form);
      return;
    }

    if (newPw !== confirmPw) {
      showToast('New passwords do not match.', 'error');
      this.shakeForm(form);
      return;
    }

    if (newPw === currentPw) {
      showToast('New password must be different from current password.', 'error');
      this.shakeForm(form);
      return;
    }

    const strength = this.getPasswordStrengthLevel(newPw);
    if (strength === 'weak') {
      showToast('New password is too weak.', 'error');
      this.shakeForm(form);
      return;
    }

    this.setButtonLoading(submitBtn, true);

    try {
      if (DEMO_MODE) {
        await new Promise(r => setTimeout(r, 800));
      } else {
        await apiFetch('/auth/change-password', {
          method: 'POST',
          body: { currentPassword: currentPw, newPassword: newPw },
        });
      }

      this.flashSuccess(submitBtn);
      showToast('Password changed successfully!', 'success');

      // Clear form
      form.reset();

      // Navigate back
      await new Promise(r => setTimeout(r, 600));
      if (getToken()) {
        App.navigate('#dashboard');
      } else {
        App.navigate('#login');
      }
    } catch (err) {
      showToast(err.message || 'Failed to change password.', 'error');
      this.shakeForm(form);
    } finally {
      this.setButtonLoading(submitBtn, false);
    }
  },

  /* ──────────────────────────────────────────────────────────
     Password Strength Checker
     ────────────────────────────────────────────────────────── */

  /**
   * Returns the raw strength level string for a password.
   * @param {string} password
   * @returns {'weak'|'medium'|'strong'|'very-strong'}
   */
  getPasswordStrengthLevel(password) {
    if (!password) return 'weak';

    let score = 0;

    // Length checks
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;

    // Character class checks
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    // Bonus for variety
    if (password.length >= 10 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) {
      score++;
    }

    if (score <= 2) return 'weak';
    if (score <= 4) return 'medium';
    if (score <= 6) return 'strong';
    return 'very-strong';
  },

  /**
   * Update the password strength UI in real-time.
   * @param {string} password
   */
  checkPasswordStrength(password) {
    const bar = document.getElementById('strength-bar');
    const text = document.getElementById('strength-text');
    if (!bar || !text) return;

    if (!password) {
      bar.style.width = '0%';
      bar.style.background = 'transparent';
      text.textContent = '';
      return;
    }

    const level = this.getPasswordStrengthLevel(password);

    const config = {
      'weak': {
        width: '25%',
        color: '#ff4444',
        gradient: 'linear-gradient(90deg, #ff4444, #ff6b6b)',
        label: 'Weak',
      },
      'medium': {
        width: '50%',
        color: '#ff9800',
        gradient: 'linear-gradient(90deg, #ff9800, #ffb74d)',
        label: 'Medium',
      },
      'strong': {
        width: '75%',
        color: '#00e5ff',
        gradient: 'linear-gradient(90deg, #00b8d4, #00e5ff)',
        label: 'Strong',
      },
      'very-strong': {
        width: '100%',
        color: '#00e676',
        gradient: 'linear-gradient(90deg, #00c853, #69f0ae)',
        label: 'Very Strong',
      },
    };

    const c = config[level];

    // Animate the bar
    bar.style.width = c.width;
    bar.style.background = c.gradient;

    // Update text
    text.textContent = c.label;
    text.style.color = c.color;

    // Add a brief pulse effect on strength change
    bar.classList.add('strength-pulse');
    setTimeout(() => bar.classList.remove('strength-pulse'), 300);
  },

  /* ──────────────────────────────────────────────────────────
     Button Loading State
     ────────────────────────────────────────────────────────── */

  /**
   * Toggle a button between normal and loading states.
   * @param {HTMLElement} btn
   * @param {boolean}     loading
   */
  setButtonLoading(btn, loading) {
    if (!btn) return;

    if (loading) {
      // Cache original content
      this._btnTextCache.set(btn, btn.innerHTML);
      btn.disabled = true;
      btn.classList.add('btn-loading');
      btn.innerHTML = `
        <span class="btn-spinner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" opacity="0.3"/>
          </svg>
        </span>
        <span class="btn-loading-text">Processing…</span>
      `;
    } else {
      btn.disabled = false;
      btn.classList.remove('btn-loading');
      const original = this._btnTextCache.get(btn);
      if (original) {
        btn.innerHTML = original;
        this._btnTextCache.delete(btn);
      }
    }
  },

  /* ──────────────────────────────────────────────────────────
     Form Shake Animation
     ────────────────────────────────────────────────────────── */

  /**
   * Apply a shake animation to a form to indicate an error.
   * @param {HTMLElement} form
   */
  shakeForm(form) {
    if (!form) return;

    // Remove class first in case it's already applied
    form.classList.remove('form-shake');

    // Force reflow to restart the animation
    void form.offsetWidth;

    form.classList.add('form-shake');

    // Clean up after animation completes
    form.addEventListener('animationend', () => {
      form.classList.remove('form-shake');
    }, { once: true });
  },

  /* ──────────────────────────────────────────────────────────
     Success Flash Animation
     ────────────────────────────────────────────────────────── */

  /**
   * Flash a success checkmark on a button.
   * @param {HTMLElement} btn
   */
  flashSuccess(btn) {
    if (!btn) return;

    btn.classList.add('btn-success-flash');

    // Briefly show checkmark
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <span class="btn-checkmark">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00e676" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </span>
      <span>Success!</span>
    `;

    setTimeout(() => {
      btn.classList.remove('btn-success-flash');
      btn.innerHTML = originalHTML;
    }, 1200);
  },

  /* ──────────────────────────────────────────────────────────
     Helpers
     ────────────────────────────────────────────────────────── */

  /**
   * Basic email format validation.
   * @param {string} email
   * @returns {boolean}
   */
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
};
