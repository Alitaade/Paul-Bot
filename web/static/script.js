// Modern Web Interface JavaScript
class ModernWebInterface {
  constructor() {
    this.currentSessionId = null
    this.connectionCheckInterval = null
    this.passwordStrengthCache = new Map()
    this.theme = localStorage.getItem('theme') || 'light'
    
    this.init()
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.initializeTheme()
      this.setupEventListeners()
      this.setupPasswordStrength()
      this.initializeAnimations()
      this.initializeDashboardRefresh()
    })
  }

  // Theme Management
  initializeTheme() {
    document.documentElement.setAttribute('data-theme', this.theme)
    this.setupThemeToggle()
  }

  setupThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle')
    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.toggleTheme())
    }
  }

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', this.theme)
    localStorage.setItem('theme', this.theme)
    
    // Add smooth transition effect
    document.body.style.transition = 'background-color 0.3s ease'
    setTimeout(() => {
      document.body.style.transition = ''
    }, 300)
  }

  // Event Listeners Setup
  setupEventListeners() {
    // Password visibility toggles
    document.querySelectorAll('.password-toggle').forEach(btn => {
      btn.addEventListener('click', this.togglePassword.bind(this))
    })

    // Form submissions
    const forms = {
      registerForm: this.handleRegister.bind(this),
      loginForm: this.handleLogin.bind(this),
      connectForm: this.handleConnect.bind(this)
    }

    Object.entries(forms).forEach(([formId, handler]) => {
      const form = document.getElementById(formId)
      if (form) {
        form.addEventListener('submit', handler)
      }
    })

    // Button clicks
    const buttons = {
      disconnectBtn: this.handleDisconnect.bind(this),
      refreshStatus: this.refreshStatus.bind(this),
      logoutBtn: this.handleLogout.bind(this),
      copyCodeBtn: this.copyPairingCode.bind(this)
    }

    Object.entries(buttons).forEach(([btnId, handler]) => {
      const btn = document.getElementById(btnId)
      if (btn) {
        btn.addEventListener('click', handler)
      }
    })

    // Pairing code click to copy
    const pairingCodeEl = document.getElementById('pairingCode')
    if (pairingCodeEl) {
      pairingCodeEl.addEventListener('click', this.copyPairingCode.bind(this))
    }

    // Real-time form validation
    this.setupFormValidation()
  }

  // Password Management
  togglePassword(event) {
    event.preventDefault()
    const button = event.currentTarget
    const targetId = button.dataset.target
    const input = document.getElementById(targetId)

    if (!input) return

    const isCurrentlyPassword = input.type === 'password'
    
    input.type = isCurrentlyPassword ? 'text' : 'password'
    
    // Toggle button state
    if (isCurrentlyPassword) {
      button.classList.add('show')
    } else {
      button.classList.remove('show')
    }

    // Add animation effect
    button.style.transform = 'scale(1.1)'
    setTimeout(() => {
      button.style.transform = ''
    }, 150)
  }

  setupPasswordStrength() {
    const passwordInput = document.getElementById('password')
    if (passwordInput) {
      passwordInput.addEventListener('input', this.checkPasswordStrength.bind(this))
    }
  }

  checkPasswordStrength(event) {
    const password = event.target.value
    const strengthBar = document.querySelector('.strength-fill')
    const strengthText = document.querySelector('.strength-text')
    
    if (!strengthBar || !strengthText) return

    const strength = this.calculatePasswordStrength(password)
    const strengthClasses = ['weak', 'fair', 'good', 'strong']
    const strengthTexts = ['Weak password', 'Fair password', 'Good password', 'Strong password']
    
    // Remove all strength classes
    strengthBar.className = 'strength-fill'
    
    if (password.length > 0) {
      strengthBar.classList.add(strengthClasses[strength])
      strengthText.textContent = strengthTexts[strength]
    } else {
      strengthText.textContent = 'Password strength'
    }
  }

  calculatePasswordStrength(password) {
    let score = 0
    
    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (/[a-z]/.test(password)) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    
    // Return 0-3 (weak to strong)
    return Math.min(Math.floor(score / 2), 3)
  }

  // Form Validation
  setupFormValidation() {
    const inputs = document.querySelectorAll('.form-input')
    inputs.forEach(input => {
      input.addEventListener('blur', () => this.validateField(input))
      input.addEventListener('input', () => this.clearFieldError(input))
    })
  }

  validateField(input) {
    const value = input.value.trim()
    let isValid = true
    let errorMessage = ''

    switch (input.type) {
      case 'tel':
        if (!this.validatePhoneNumber(value)) {
          isValid = false
          errorMessage = 'Please enter a valid phone number with country code'
        }
        break
      case 'password':
        if (value.length < 6) {
          isValid = false
          errorMessage = 'Password must be at least 6 characters'
        }
        break
      case 'text':
        if (input.name === 'name' && value.length < 2) {
          isValid = false
          errorMessage = 'Name must be at least 2 characters'
        }
        break
    }

    if (input.name === 'confirmPassword') {
      const passwordInput = document.getElementById('password')
      if (passwordInput && value !== passwordInput.value) {
        isValid = false
        errorMessage = 'Passwords do not match'
      }
    }

    this.setFieldValidation(input, isValid, errorMessage)
    return isValid
  }

  setFieldValidation(input, isValid, errorMessage = '') {
    const inputGroup = input.closest('.input-group') || input.closest('.form-group')
    
    // Remove existing validation classes and messages
    input.classList.remove('invalid', 'valid')
    const existingError = inputGroup.querySelector('.field-error')
    if (existingError) {
      existingError.remove()
    }

    if (!isValid && errorMessage) {
      input.classList.add('invalid')
      const errorEl = document.createElement('div')
      errorEl.className = 'field-error'
      errorEl.textContent = errorMessage
      inputGroup.appendChild(errorEl)
    } else if (input.value.trim()) {
      input.classList.add('valid')
    }
  }

  clearFieldError(input) {
    input.classList.remove('invalid')
    const inputGroup = input.closest('.input-group') || input.closest('.form-group')
    const existingError = inputGroup.querySelector('.field-error')
    if (existingError) {
      existingError.remove()
    }
  }

  // Form Handlers
  async handleRegister(event) {
    event.preventDefault()
    
    const form = event.target
    const submitBtn = form.querySelector('button[type="submit"]')
    const formData = new FormData(form)
    
    const data = {
      name: formData.get('name'),
      phoneNumber: formData.get('phoneNumber'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword')
    }

    if (!this.validateForm(data, 'register')) {
      return
    }

    this.setButtonLoading(submitBtn, true)
    this.clearAlerts()

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (response.ok) {
        this.showAlert('Registration successful! Redirecting to dashboard...', 'success')
        this.animateSuccess()
        setTimeout(() => window.location.href = '/dashboard', 1500)
      } else {
        this.showAlert(result.error || 'Registration failed', 'error')
        this.animateError()
      }
    } catch (error) {
      console.error('Register error:', error)
      this.showAlert('Network error. Please check your connection and try again.', 'error')
      this.animateError()
    } finally {
      this.setButtonLoading(submitBtn, false)
    }
  }

  async handleLogin(event) {
    event.preventDefault()
    
    const form = event.target
    const submitBtn = form.querySelector('button[type="submit"]')
    const formData = new FormData(form)
    
    const data = {
      phoneNumber: formData.get('phoneNumber'),
      password: formData.get('password')
    }

    if (!this.validateForm(data, 'login')) {
      return
    }

    this.setButtonLoading(submitBtn, true)
    this.clearAlerts()

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (response.ok) {
        this.showAlert('Login successful! Welcome back.', 'success')
        this.animateSuccess()
        setTimeout(() => window.location.href = '/dashboard', 1500)
      } else {
        this.showAlert(result.error || 'Login failed', 'error')
        this.animateError()
      }
    } catch (error) {
      console.error('Login error:', error)
      this.showAlert('Network error. Please check your connection and try again.', 'error')
      this.animateError()
    } finally {
      this.setButtonLoading(submitBtn, false)
    }
  }

  async handleConnect(event) {
    event.preventDefault()
    
    const form = event.target
    const submitBtn = form.querySelector('button[type="submit"]')
    const formData = new FormData(form)
    
    const data = {
      phoneNumber: formData.get('phoneNumber')
    }

    if (!data.phoneNumber) {
      this.showAlert('Phone number is required', 'error')
      return
    }

    if (!this.validatePhoneNumber(data.phoneNumber)) {
      this.showAlert('Please enter a valid phone number with country code (e.g., +1234567890)', 'error')
      return
    }

    this.setButtonLoading(submitBtn, true)
    this.clearAlerts()
    this.updateConnectionStep(2)

    // Show loading section
    const loadingSection = document.getElementById('loadingSection')
    const codeSection = document.getElementById('codeSection')
    
    form.style.display = 'none'
    loadingSection.classList.remove('hidden')

    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (response.ok) {
        // Hide loading, show code section
        loadingSection.classList.add('hidden')
        codeSection.classList.remove('hidden')
        this.updateConnectionStep(3)

        // Display pairing code with animation
        const pairingCodeEl = document.getElementById('pairingCode')
        pairingCodeEl.style.opacity = '0'
        pairingCodeEl.textContent = result.code
        
        // Animate code appearance
        setTimeout(() => {
          pairingCodeEl.style.transition = 'opacity 0.5s ease'
          pairingCodeEl.style.opacity = '1'
        }, 100)

        // Store session ID and start monitoring
        this.currentSessionId = result.sessionId
        this.startConnectionMonitoring()

      } else {
        loadingSection.classList.add('hidden')
        form.style.display = 'block'
        this.updateConnectionStep(1)
        this.showAlert(result.error || 'Failed to generate pairing code', 'error')
        this.animateError()
      }
    } catch (error) {
      console.error('Connect error:', error)
      loadingSection.classList.add('hidden')
      form.style.display = 'block'
      this.updateConnectionStep(1)
      this.showAlert('Network error. Please check your connection and try again.', 'error')
      this.animateError()
    } finally {
      this.setButtonLoading(submitBtn, false)
    }
  }

  async handleDisconnect() {
    const result = await this.showConfirmDialog(
      'Disconnect WhatsApp',
      'Are you sure you want to disconnect your WhatsApp account? You will need to reconnect to use the service.',
      'Disconnect',
      'Cancel'
    )

    if (!result) return

    const disconnectBtn = document.getElementById('disconnectBtn')
    this.setButtonLoading(disconnectBtn, true)

    try {
      const response = await fetch('/api/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const result = await response.json()

      if (response.ok) {
        this.showAlert('Disconnected successfully! Redirecting...', 'success')
        this.animateSuccess()
        setTimeout(() => window.location.reload(), 2000)
      } else {
        this.showAlert(result.error || 'Disconnect failed', 'error')
        this.animateError()
      }
    } catch (error) {
      console.error('Disconnect error:', error)
      this.showAlert('Network error. Please try again.', 'error')
      this.animateError()
    } finally {
      this.setButtonLoading(disconnectBtn, false)
    }
  }

  async refreshStatus() {
    const refreshBtn = document.getElementById('refreshStatus')
    this.setButtonLoading(refreshBtn, true)

    try {
      const response = await fetch('/api/status')
      const result = await response.json()

      if (response.ok) {
        this.updateStatusDisplay(result)
        this.showAlert('Status refreshed successfully', 'info')
        
        // Auto-hide info alert
        setTimeout(() => this.clearAlerts(), 3000)
      } else {
        this.showAlert('Failed to refresh status', 'error')
      }
    } catch (error) {
      console.error('Status refresh error:', error)
      this.showAlert('Network error while refreshing status', 'error')
    } finally {
      this.setButtonLoading(refreshBtn, false)
    }
  }

  async handleLogout() {
    const result = await this.showConfirmDialog(
      'Logout',
      'Are you sure you want to logout from your account?',
      'Logout',
      'Cancel'
    )

    if (result) {
      // Clear auth cookie
      document.cookie = 'auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
      
      // Show logout message
      this.showAlert('Logging out...', 'info')
      
      setTimeout(() => {
        window.location.href = '/'
      }, 1000)
    }
  }

  async copyPairingCode() {
    const pairingCodeEl = document.getElementById('pairingCode')
    const copyBtn = document.getElementById('copyCodeBtn')
    
    if (!pairingCodeEl || !copyBtn) return

    try {
      await navigator.clipboard.writeText(pairingCodeEl.textContent)
      
      // Visual feedback
      const originalText = copyBtn.innerHTML
      copyBtn.innerHTML = '<span class="btn-icon">✓</span> Copied!'
      copyBtn.style.background = 'var(--success-color)'
      copyBtn.style.color = 'white'
      
      // Animate the pairing code
      pairingCodeEl.style.transform = 'scale(1.05)'
      pairingCodeEl.style.background = 'var(--success-color)'
      pairingCodeEl.style.color = 'white'
      
      setTimeout(() => {
        copyBtn.innerHTML = originalText
        copyBtn.style.background = ''
        copyBtn.style.color = ''
        
        pairingCodeEl.style.transform = ''
        pairingCodeEl.style.background = ''
        pairingCodeEl.style.color = ''
      }, 2000)
      
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = pairingCodeEl.textContent
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      
      this.showAlert('Pairing code copied to clipboard!', 'success')
      setTimeout(() => this.clearAlerts(), 3000)
    }
  }

  // Connection Monitoring
  startConnectionMonitoring() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval)
    }

    let checkCount = 0
    const maxChecks = 40 // 200 seconds total

    this.connectionCheckInterval = setInterval(async () => {
      if (!this.currentSessionId) return
      checkCount++

      try {
        const response = await fetch(`/api/connection-status/${this.currentSessionId}`)
        const result = await response.json()

        console.log(`Connection check ${checkCount}:`, result)

        if (response.ok && result.isConnected) {
          // Connection successful!
          this.stopConnectionMonitoring()
          this.showConnectionSuccess(result.phoneNumber)
        } else if (checkCount >= maxChecks) {
          // Timeout after max checks
          this.stopConnectionMonitoring()
          this.showConnectionTimeout()
        } else {
          // Update status
          this.updateConnectionProgress(checkCount, maxChecks)
        }
      } catch (error) {
        console.error('Connection monitoring error:', error)
        if (checkCount >= maxChecks) {
          this.stopConnectionMonitoring()
          this.showConnectionError('Network error during connection monitoring')
        }
      }
    }, 5000) // Check every 5 seconds

    // Stop monitoring after timeout
    setTimeout(() => {
      if (this.connectionCheckInterval) {
        this.stopConnectionMonitoring()
        this.showConnectionTimeout()
      }
    }, 220000) // 220 seconds
  }

  stopConnectionMonitoring() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval)
      this.connectionCheckInterval = null
    }
  }

  updateConnectionProgress(current, max) {
    const connectionStatus = document.getElementById('connectionStatus')
    const progressFill = connectionStatus?.querySelector('.progress-fill')
    
    if (progressFill) {
      const percentage = (current / max) * 100
      progressFill.style.width = `${percentage}%`
    }

    if (connectionStatus) {
      const statusDescription = connectionStatus.querySelector('.status-description')
      if (statusDescription) {
        statusDescription.textContent = `Waiting for connection... (${current}/${max})`
      }
    }
  }

  showConnectionSuccess(phoneNumber) {
  const connectionStatus = document.getElementById('connectionStatus')
  if (connectionStatus) {
    connectionStatus.className = 'connection-status success'
    connectionStatus.innerHTML = `
      <div class="status-icon">✅</div>
      <div class="status-content">
        <div class="status-title">Connected Successfully!</div>
        <div class="status-description">Your WhatsApp account ${phoneNumber} is now connected.</div>
      </div>
    `
  }
  
  this.showAlert('WhatsApp connected successfully! Redirecting to dashboard...', 'success')
  this.animateSuccess()
  
  // Clear any cached data to force refresh
  if (window.localStorage) {
    window.localStorage.removeItem('dashboard_cache')
  }
  
  setTimeout(() => {
    window.location.href = '/dashboard?refresh=1'
  }, 3000)
}

  showConnectionTimeout() {
    const connectionStatus = document.getElementById('connectionStatus')
    if (connectionStatus) {
      connectionStatus.className = 'connection-status error'
      connectionStatus.innerHTML = `
        <div class="status-icon">⏰</div>
        <div class="status-content">
          <div class="status-title">Connection Timeout</div>
          <div class="status-description">Please try again or check that you entered the code correctly in your WhatsApp app.</div>
        </div>
      `
    }
  }

  initializeDashboardRefresh() {
  // If we came from connection success, refresh status immediately
  const urlParams = new URLSearchParams(window.location.search)
  if (urlParams.get('refresh') === '1') {
    // Remove the parameter from URL
    window.history.replaceState({}, document.title, window.location.pathname)
    
    // Force status refresh
    setTimeout(() => {
      this.refreshStatus()
    }, 1000)
  }
}

  showConnectionError(message) {
    const connectionStatus = document.getElementById('connectionStatus')
    if (connectionStatus) {
      connectionStatus.className = 'connection-status error'
      connectionStatus.innerHTML = `
        <div class="status-icon">❌</div>
        <div class="status-content">
          <div class="status-title">Connection Error</div>
          <div class="status-description">${message}</div>
        </div>
      `
    }
  }

  updateConnectionStep(step) {
    document.querySelectorAll('.step-item').forEach((item, index) => {
      const stepNumber = index + 1
      item.classList.remove('active', 'completed')
      
      if (stepNumber < step) {
        item.classList.add('completed')
      } else if (stepNumber === step) {
        item.classList.add('active')
      }
    })
  }

  // Status Display Updates
  updateStatusDisplay(status) {
    const statusCard = document.querySelector('.status-card')
    const statusDot = document.querySelector('.status-dot')
    const statusText = document.querySelector('.status-text')
    
    if (statusCard && statusDot && statusText) {
      if (status.isConnected) {
        statusCard.classList.remove('disconnected')
        statusCard.classList.add('connected')
        statusDot.classList.remove('disconnected')
        statusDot.classList.add('connected')
        statusText.textContent = 'Connected'
      } else {
        statusCard.classList.remove('connected')
        statusCard.classList.add('disconnected')
        statusDot.classList.remove('connected')
        statusDot.classList.add('disconnected')
        statusText.textContent = 'Disconnected'
      }

      // Update connection info if available
      const phoneInfo = document.querySelector('.info-value')
      if (phoneInfo && status.phoneNumber) {
        phoneInfo.textContent = status.phoneNumber
      }
    }

    // Animate status change
    if (statusCard) {
      statusCard.style.transform = 'scale(1.02)'
      setTimeout(() => {
        statusCard.style.transform = ''
      }, 200)
    }
  }

  // Form Validation
  validateForm(data, type) {
    const errors = []

    if (type === 'register') {
      if (!data.name || data.name.trim().length < 2) {
        errors.push('Name must be at least 2 characters long')
      }
      
      if (data.password !== data.confirmPassword) {
        errors.push('Passwords do not match')
      }
      
      if (data.password.length < 6) {
        errors.push('Password must be at least 6 characters long')
      }
    }

    if (!data.phoneNumber) {
      errors.push('Phone number is required')
    } else if (!this.validatePhoneNumber(data.phoneNumber)) {
      errors.push('Invalid phone number format. Please include country code (e.g., +1234567890)')
    }

    if (!data.password) {
      errors.push('Password is required')
    }

    if (errors.length > 0) {
      this.showAlert(errors.join('<br>'), 'error')
      this.animateError()
      return false
    }

    return true
  }

  validatePhoneNumber(phone) {
    // Enhanced phone number validation
    const phoneRegex = /^\+[1-9]\d{1,14}$/
    return phoneRegex.test(phone.replace(/\s/g, ''))
  }

  // UI Helper Methods
  showAlert(message, type = 'info') {
    this.clearAlerts()
    
    const alertDiv = document.createElement('div')
    alertDiv.className = `alert alert-${type}`
    
    const iconMap = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    }
    
    alertDiv.innerHTML = `
      <span class="alert-icon">${iconMap[type] || 'ℹ️'}</span>
      <div class="alert-content">${message}</div>
    `
    
    // Insert at the top of the main container
    const container = document.querySelector('.auth-card, .connect-card, .dashboard-container, .container')
    if (container) {
      container.insertBefore(alertDiv, container.firstChild)
    }

    // Animate alert appearance
    alertDiv.style.opacity = '0'
    alertDiv.style.transform = 'translateY(-20px)'
    
    setTimeout(() => {
      alertDiv.style.transition = 'all 0.3s ease'
      alertDiv.style.opacity = '1'
      alertDiv.style.transform = 'translateY(0)'
    }, 10)

    // Auto-hide success and info alerts
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        this.fadeOutAlert(alertDiv)
      }, 5000)
    }
  }

  fadeOutAlert(alertDiv) {
    if (alertDiv && alertDiv.parentNode) {
      alertDiv.style.transition = 'all 0.3s ease'
      alertDiv.style.opacity = '0'
      alertDiv.style.transform = 'translateY(-20px)'
      
      setTimeout(() => {
        if (alertDiv.parentNode) {
          alertDiv.remove()
        }
      }, 300)
    }
  }

  clearAlerts() {
    document.querySelectorAll('.alert').forEach(alert => {
      this.fadeOutAlert(alert)
    })
  }

  setButtonLoading(button, loading) {
    if (!button) return

    const btnText = button.querySelector('.btn-text')
    const btnLoading = button.querySelector('.btn-loading')

    if (loading) {
      button.disabled = true
      button.classList.add('loading')
      if (btnText) btnText.style.opacity = '0'
      if (btnLoading) btnLoading.classList.remove('hidden')
    } else {
      button.disabled = false
      button.classList.remove('loading')
      if (btnText) btnText.style.opacity = '1'
      if (btnLoading) btnLoading.classList.add('hidden')
    }
  }

  // Animation Methods
  initializeAnimations() {
    // Add entrance animations to elements
    const animateElements = document.querySelectorAll('.feature-card, .stat-item, .card')
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.animation = 'fadeInUp 0.6s ease forwards'
        }
      })
    }, { threshold: 0.1 })

    animateElements.forEach(el => {
      el.style.opacity = '0'
      el.style.transform = 'translateY(30px)'
      observer.observe(el)
    })
  }

  animateSuccess() {
    document.body.style.animation = 'successPulse 0.5s ease'
    setTimeout(() => {
      document.body.style.animation = ''
    }, 500)
  }

  animateError() {
    document.body.style.animation = 'errorShake 0.5s ease'
    setTimeout(() => {
      document.body.style.animation = ''
    }, 500)
  }

  // Dialog Methods
  showConfirmDialog(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
      const dialog = document.createElement('div')
      dialog.className = 'modal-overlay'
      dialog.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>${title}</h3>
          </div>
          <div class="modal-body">
            <p>${message}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" data-action="cancel">${cancelText}</button>
            <button class="btn btn-danger" data-action="confirm">${confirmText}</button>
          </div>
        </div>
      `

      document.body.appendChild(dialog)

      // Add styles for modal
      const style = document.createElement('style')
      style.textContent = `
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          backdrop-filter: blur(5px);
        }
        .modal-dialog {
          background: var(--bg-card);
          border-radius: var(--border-radius);
          box-shadow: var(--shadow-xl);
          max-width: 400px;
          width: 90%;
          margin: 20px;
        }
        .modal-header {
          padding: 1.5rem 1.5rem 1rem;
          border-bottom: 1px solid var(--border-light);
        }
        .modal-header h3 {
          margin: 0;
          color: var(--text-primary);
        }
        .modal-body {
          padding: 1.5rem;
        }
        .modal-body p {
          margin: 0;
          color: var(--text-secondary);
        }
        .modal-footer {
          padding: 1rem 1.5rem 1.5rem;
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
        }
      `
      document.head.appendChild(style)

      // Handle clicks
      dialog.addEventListener('click', (e) => {
        const action = e.target.dataset.action
        if (action === 'confirm') {
          resolve(true)
        } else if (action === 'cancel' || e.target === dialog) {
          resolve(false)
        }
        
        if (action) {
          document.body.removeChild(dialog)
          document.head.removeChild(style)
        }
      })

      // Animate appearance
      dialog.style.opacity = '0'
      setTimeout(() => {
        dialog.style.transition = 'opacity 0.3s ease'
        dialog.style.opacity = '1'
      }, 10)
    })
  }
}

// Add CSS animations
const animationStyles = document.createElement('style')
animationStyles.textContent = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes successPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.01); }
  }

  @keyframes errorShake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }

  .form-input.invalid {
    border-color: var(--error-color);
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
  }

  .form-input.valid {
    border-color: var(--success-color);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
  }

  .field-error {
    color: var(--error-color);
    font-size: 0.875rem;
    margin-top: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .field-error::before {
    content: '⚠️';
  }

  .alert {
    animation: slideIn 0.3s ease;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`

document.head.appendChild(animationStyles)

// Initialize the modern web interface
const modernWebInterface = new ModernWebInterface()