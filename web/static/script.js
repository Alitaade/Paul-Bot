// web/static/script.js - Frontend JavaScript

class WebInterface {
  constructor() {
    this.currentSessionId = null
    this.connectionCheckInterval = null
    this.init()
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.setupEventListeners()
    })
  }

  setupEventListeners() {
    // Password visibility toggle
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', this.togglePassword.bind(this))
    })

    // Form submissions
    const registerForm = document.getElementById('registerForm')
    if (registerForm) {
      registerForm.addEventListener('submit', this.handleRegister.bind(this))
    }

    const loginForm = document.getElementById('loginForm')
    if (loginForm) {
      loginForm.addEventListener('submit', this.handleLogin.bind(this))
    }

    const connectForm = document.getElementById('connectForm')
    if (connectForm) {
      connectForm.addEventListener('submit', this.handleConnect.bind(this))
    }

    // Button clicks
    const disconnectBtn = document.getElementById('disconnectBtn')
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', this.handleDisconnect.bind(this))
    }

    const refreshStatusBtn = document.getElementById('refreshStatus')
    if (refreshStatusBtn) {
      refreshStatusBtn.addEventListener('click', this.refreshStatus.bind(this))
    }

    const logoutBtn = document.getElementById('logoutBtn')
    if (logoutBtn) {
      logoutBtn.addEventListener('click', this.handleLogout.bind(this))
    }

    const copyCodeBtn = document.getElementById('copyCodeBtn')
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', this.copyPairingCode.bind(this))
    }

    // Pairing code click to copy
    const pairingCodeEl = document.getElementById('pairingCode')
    if (pairingCodeEl) {
      pairingCodeEl.addEventListener('click', this.copyPairingCode.bind(this))
    }
  }

  togglePassword(event) {
    const button = event.target
    const targetId = button.dataset.target
    const input = document.getElementById(targetId)

    if (input.type === 'password') {
      input.type = 'text'
      button.textContent = '🙈'
    } else {
      input.type = 'password'
      button.textContent = '👁️'
    }
  }

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

    // Client-side validation
    if (!this.validateForm(data, 'register')) {
      return
    }

    this.setButtonLoading(submitBtn, true)
    this.clearAlerts()

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (response.ok) {
        this.showAlert('Registration successful! Redirecting...', 'success')
        setTimeout(() => {
          window.location.href = '/dashboard'
        }, 1500)
      } else {
        this.showAlert(result.error || 'Registration failed', 'danger')
      }
    } catch (error) {
      console.error('Register error:', error)
      this.showAlert('Network error. Please try again.', 'danger')
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (response.ok) {
        this.showAlert('Login successful! Redirecting...', 'success')
        setTimeout(() => {
          window.location.href = '/dashboard'
        }, 1500)
      } else {
        this.showAlert(result.error || 'Login failed', 'danger')
      }
    } catch (error) {
      console.error('Login error:', error)
      this.showAlert('Network error. Please try again.', 'danger')
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
      this.showAlert('Phone number is required', 'danger')
      return
    }

    if (!this.validatePhoneNumber(data.phoneNumber)) {
      this.showAlert('Please enter a valid phone number with country code (e.g., +234xxxxxxxxxx)', 'danger')
      return
    }

    this.setButtonLoading(submitBtn, true)
    this.clearAlerts()

    // Show loading section
    const loadingSection = document.getElementById('loadingSection')
    const codeSection = document.getElementById('codeSection')
    
    form.style.display = 'none'
    loadingSection.classList.remove('hidden')

    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (response.ok) {
        // Hide loading, show code section
        loadingSection.classList.add('hidden')
        codeSection.classList.remove('hidden')

        // Display pairing code
        const pairingCodeEl = document.getElementById('pairingCode')
        pairingCodeEl.textContent = result.code

        // Store session ID and start monitoring
        this.currentSessionId = result.sessionId
        this.startConnectionMonitoring()

      } else {
        loadingSection.classList.add('hidden')
        form.style.display = 'block'
        this.showAlert(result.error || 'Failed to generate pairing code', 'danger')
      }
    } catch (error) {
      console.error('Connect error:', error)
      loadingSection.classList.add('hidden')
      form.style.display = 'block'
      this.showAlert('Network error. Please try again.', 'danger')
    } finally {
      this.setButtonLoading(submitBtn, false)
    }
  }

  async handleDisconnect() {
    if (!confirm('Are you sure you want to disconnect from WhatsApp?')) {
      return
    }

    const disconnectBtn = document.getElementById('disconnectBtn')
    this.setButtonLoading(disconnectBtn, true)

    try {
      const response = await fetch('/api/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (response.ok) {
        this.showAlert('Disconnected successfully! Redirecting...', 'success')
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        this.showAlert(result.error || 'Disconnect failed', 'danger')
      }
    } catch (error) {
      console.error('Disconnect error:', error)
      this.showAlert('Network error. Please try again.', 'danger')
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
        // Update status display
        this.updateStatusDisplay(result)
        this.showAlert('Status refreshed', 'info')
      } else {
        this.showAlert('Failed to refresh status', 'danger')
      }
    } catch (error) {
      console.error('Status refresh error:', error)
      this.showAlert('Network error', 'danger')
    } finally {
      this.setButtonLoading(refreshBtn, false)
    }
  }

  handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
      // Clear auth cookie
      document.cookie = 'auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
      window.location.href = '/'
    }
  }

  async copyPairingCode() {
    const pairingCodeEl = document.getElementById('pairingCode')
    const copyBtn = document.getElementById('copyCodeBtn')
    
    try {
      await navigator.clipboard.writeText(pairingCodeEl.textContent)
      
      // Visual feedback
      const originalText = copyBtn.textContent
      copyBtn.textContent = 'Copied!'
      copyBtn.style.backgroundColor = '#28a745'
      
      setTimeout(() => {
        copyBtn.textContent = originalText
        copyBtn.style.backgroundColor = ''
      }, 2000)
      
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = pairingCodeEl.textContent
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      
      this.showAlert('Code copied to clipboard!', 'success')
    }
  }

  startConnectionMonitoring() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval)
    }

    this.connectionCheckInterval = setInterval(async () => {
      if (!this.currentSessionId) return

      try {
        const response = await fetch(`/api/connection-status/${this.currentSessionId}`)
        const result = await response.json()

        if (response.ok && result.isConnected) {
          // Connection successful!
          this.stopConnectionMonitoring()
          this.showConnectionSuccess(result.phoneNumber)
        }
      } catch (error) {
        console.error('Connection monitoring error:', error)
      }
    }, 3000) // Check every 3 seconds

    // Stop monitoring after 2 minutes (code expires)
    setTimeout(() => {
      this.stopConnectionMonitoring()
    }, 120000)
  }

  stopConnectionMonitoring() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval)
      this.connectionCheckInterval = null
    }
  }

  showConnectionSuccess(phoneNumber) {
    const connectionStatus = document.getElementById('connectionStatus')
    connectionStatus.innerHTML = `
      <div class="connection-status success">
        <span>✅</span>
        <span>Connected successfully to ${phoneNumber}!</span>
      </div>
    `
    
    this.showAlert('WhatsApp connected successfully! Redirecting to dashboard...', 'success')
    
    setTimeout(() => {
      window.location.href = '/dashboard'
    }, 3000)
  }

  updateStatusDisplay(status) {
    const statusCard = document.querySelector('.status-card')
    const statusDot = document.querySelector('.status-dot')
    const statusText = document.querySelector('.status-text')
    
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
      statusText.textContent = 'Not Connected'
    }
  }

  validateForm(data, type) {
    const errors = []

    if (type === 'register') {
      if (!data.name || data.name.trim().length < 2) {
        errors.push('Name must be at least 2 characters')
      }
      
      if (data.password !== data.confirmPassword) {
        errors.push('Passwords do not match')
      }
      
      if (data.password.length < 6) {
        errors.push('Password must be at least 6 characters')
      }
    }

    if (!data.phoneNumber) {
      errors.push('Phone number is required')
    } else if (!this.validatePhoneNumber(data.phoneNumber)) {
      errors.push('Invalid phone number format. Use +234xxxxxxxxxx')
    }

    if (!data.password) {
      errors.push('Password is required')
    }

    if (errors.length > 0) {
      this.showAlert(errors.join('<br>'), 'danger')
      return false
    }

    return true
  }

  validatePhoneNumber(phone) {
    // Basic phone number validation - starts with + and has at least 10 digits
    const phoneRegex = /^\+[1-9]\d{1,14}$/
    return phoneRegex.test(phone)
  }

  showAlert(message, type = 'info') {
    this.clearAlerts()
    
    const alertDiv = document.createElement('div')
    alertDiv.className = `alert alert-${type}`
    alertDiv.innerHTML = message
    
    // Insert at the top of the form or container
    const container = document.querySelector('.auth-form, .connect-form, .container')
    if (container) {
      container.insertBefore(alertDiv, container.firstChild)
    }

    // Auto-hide success and info alerts
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        alertDiv.remove()
      }, 5000)
    }
  }

  clearAlerts() {
    document.querySelectorAll('.alert').forEach(alert => alert.remove())
  }

  setButtonLoading(button, loading) {
    if (loading) {
      button.disabled = true
      button.dataset.originalText = button.textContent
      button.innerHTML = '<div class="spinner small"></div> Loading...'
    } else {
      button.disabled = false
      button.textContent = button.dataset.originalText || button.textContent
    }
  }
}

// Initialize the web interface
const webInterface = new WebInterface()
