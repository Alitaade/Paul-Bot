// web/templates/index.js - Template System
export class WebTemplates {
  
  getBaseHTML(title, content, bodyClass = '') {
    return `
      <!DOCTYPE html>
      <html lang="en" data-theme="light">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - Paul WhatsApp Web</title>
        <link rel="stylesheet" href="/static/style.css">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      </head>
      <body class="${bodyClass}">
        <div id="theme-toggle" class="theme-toggle">
          <div class="theme-switch">
            <span class="theme-icon sun-icon">☀️</span>
            <span class="theme-icon moon-icon">🌙</span>
            <div class="theme-slider"></div>
          </div>
        </div>
        
        <main class="main-content">
          ${content}
        </main>
        
        <footer class="footer">
          <div class="container">
            <p>&copy; 2025 Paul WhatsApp Web.</p>
          </div>
        </footer>
        
        <script src="/static/script.js"></script>
      </body>
      </html>
    `
  }

  renderHome() {
  const content = `
    <div class="hero-section">
      <div class="container">
        <div class="hero-content">
          <div class="hero-text">
            <h1 class="hero-title">
              <span class="gradient-text">WhatsApp Bot</span>
              <span class="hero-subtitle">Web Connection</span>
            </h1>
            <p class="hero-description">
              Connect your WhatsApp to access the bot. After connecting, type .menu in WhatsApp to get started.
            </p>
            <div class="hero-buttons">
              <a href="/login" class="btn btn-primary btn-large">
                <span class="btn-icon">🔐</span>
                Login
              </a>
              <a href="/register" class="btn btn-outline btn-large">
                <span class="btn-icon">👤</span>
                Register
              </a>
            </div>
          </div>
          <div class="hero-visual">
            <div class="phone-mockup">
              <div class="phone-screen">
                <div class="whatsapp-logo">📱</div>
                <div class="connection-animation">
                  <div class="pulse-dot"></div>
                  <div class="pulse-ring"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="features-section">
      <div class="container">
        <h2 class="section-title">How it works</h2>
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon">1️⃣</div>
            <h3>Register</h3>
            <p>Create an account with your phone number</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">2️⃣</div>
            <h3>Connect</h3>
            <p>Link your WhatsApp using the pairing code</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">3️⃣</div>
            <h3>Use Bot</h3>
            <p>Type .menu in WhatsApp to start using the bot</p>
          </div>
        </div>
      </div>
    </div>
  `
  
  return this.getBaseHTML('Home', content, 'home-page')
}

  renderLogin() {
    const content = `
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-header">
            <h1 class="auth-title">Welcome Back</h1>
            <p class="auth-subtitle">Sign in to access your WhatsApp Web dashboard</p>
          </div>
          
          <form id="loginForm" class="auth-form">
            <div class="form-group">
              <label for="phoneNumber" class="form-label">Phone Number</label>
              <div class="input-group">
                <span class="input-icon">📱</span>
                <input 
                  type="tel" 
                  id="phoneNumber" 
                  name="phoneNumber" 
                  placeholder="+1234567890" 
                  class="form-input"
                  required
                >
              </div>
              <small class="form-help">Include country code (e.g., +1 for USA, +234 for Nigeria)</small>
            </div>
            
            <div class="form-group">
              <label for="password" class="form-label">Password</label>
              <div class="input-group password-group">
                <span class="input-icon">🔐</span>
                <input 
                  type="password" 
                  id="password" 
                  name="password" 
                  placeholder="Enter your password"
                  class="form-input"
                  required
                >
                <button type="button" class="password-toggle" data-target="password">
                  <span class="show-icon">👁️</span>
                  <span class="hide-icon">🙈</span>
                </button>
              </div>
            </div>
            
            <button type="submit" class="btn btn-primary btn-large full-width">
              <span class="btn-loading hidden">
                <div class="spinner"></div>
                Signing in...
              </span>
              <span class="btn-text">Sign In</span>
            </button>
          </form>
          
          <div class="auth-footer">
            <p>Don't have an account? <a href="/register" class="auth-link">Create one here</a></p>
          </div>
        </div>
      </div>
    `
    
    return this.getBaseHTML('Login', content, 'auth-page')
  }

  renderRegister() {
    const content = `
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-header">
            <h1 class="auth-title">Create Account</h1>
            <p class="auth-subtitle">Join thousands of users connecting securely</p>
          </div>
          
          <form id="registerForm" class="auth-form">
            <div class="form-group">
              <label for="name" class="form-label">Full Name</label>
              <div class="input-group">
                <span class="input-icon">👤</span>
                <input 
                  type="text" 
                  id="name" 
                  name="name" 
                  placeholder="Enter your full name"
                  class="form-input"
                  required
                >
              </div>
            </div>
            
            <div class="form-group">
              <label for="phoneNumber" class="form-label">Phone Number</label>
              <div class="input-group">
                <span class="input-icon">📱</span>
                <input 
                  type="tel" 
                  id="phoneNumber" 
                  name="phoneNumber" 
                  placeholder="+1234567890"
                  class="form-input"
                  required
                >
              </div>
              <small class="form-help">This will be used as your login identifier</small>
            </div>
            
            <div class="form-group">
              <label for="password" class="form-label">Password</label>
              <div class="input-group password-group">
                <span class="input-icon">🔐</span>
                <input 
                  type="password" 
                  id="password" 
                  name="password" 
                  placeholder="Create a strong password"
                  class="form-input"
                  required
                >
                <button type="button" class="password-toggle" data-target="password">
                  <span class="show-icon">👁️</span>
                  <span class="hide-icon">🙈</span>
                </button>
              </div>
              <div class="password-strength" id="passwordStrength">
                <div class="strength-bar">
                  <div class="strength-fill"></div>
                </div>
                <span class="strength-text">Password strength</span>
              </div>
            </div>
            
            <div class="form-group">
              <label for="confirmPassword" class="form-label">Confirm Password</label>
              <div class="input-group password-group">
                <span class="input-icon">✅</span>
                <input 
                  type="password" 
                  id="confirmPassword" 
                  name="confirmPassword" 
                  placeholder="Confirm your password"
                  class="form-input"
                  required
                >
                <button type="button" class="password-toggle" data-target="confirmPassword">
                  <span class="show-icon">👁️</span>
                  <span class="hide-icon">🙈</span>
                </button>
              </div>
            </div>
            
            <button type="submit" class="btn btn-primary btn-large full-width">
              <span class="btn-loading hidden">
                <div class="spinner"></div>
                Creating account...
              </span>
              <span class="btn-text">Create Account</span>
            </button>
          </form>
          
          <div class="auth-footer">
            <p>Already have an account? <a href="/login" class="auth-link">Sign in here</a></p>
          </div>
        </div>
      </div>
    `
    
    return this.getBaseHTML('Register', content, 'auth-page')
  }

  // In templates/index.js - Add auto-refresh script to renderDashboard method
renderDashboard(data) {
  const { user, isConnected, session } = data
  
  const content = `
    <div class="dashboard-container">
      <div class="dashboard-header">
        <div class="container">
          <div class="header-content">
            <div class="user-info">
              <div class="user-avatar">
                ${user.name.charAt(0).toUpperCase()}
              </div>
              <div class="user-details">
                <h1 class="user-name">Welcome back, ${user.name}</h1>
                <p class="user-phone">${user.phone_number}</p>
              </div>
            </div>
            <div class="header-actions">
              <button id="refreshStatus" class="btn btn-outline btn-small">
                <span class="btn-icon">🔄</span>
                Refresh
              </button>
              <button id="logoutBtn" class="btn btn-danger btn-small">
                <span class="btn-icon">🚪</span>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-content">
        <div class="container">
          <div class="dashboard-grid">
            <!-- Connection Status Card -->
            <div id="statusCard" class="status-card ${isConnected ? 'connected' : 'disconnected'}">
              <div class="card-header">
                <h3>WhatsApp Connection</h3>
                <div class="status-indicator">
                  <div id="statusDot" class="status-dot ${isConnected ? 'connected' : 'disconnected'}"></div>
                  <span id="statusText" class="status-text">${isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>
              
              <div id="cardBody" class="card-body">
                ${isConnected ? `
                  <div class="connection-info">
                    <div class="info-item">
                      <span class="info-label">Phone Number:</span>
                      <span id="phoneInfo" class="info-value">${session?.phoneNumber || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">Status:</span>
                      <span class="info-value success">Active</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">Connection Time:</span>
                      <span class="info-value" id="connectionTime">Just now</span>
                    </div>
                  </div>
                  <button id="disconnectBtn" class="btn btn-danger full-width">
                    <span class="btn-loading hidden">
                      <div class="spinner"></div>
                      Disconnecting...
                    </span>
                    <span class="btn-text">
                      <span class="btn-icon">🔌</span>
                      Disconnect WhatsApp
                    </span>
                  </button>
                ` : `
                  <div class="no-connection">
                    <div class="no-connection-icon">📱</div>
                    <h4>Not Connected</h4>
                    <p>Connect your WhatsApp account to start using the web interface.</p>
                  </div>
                  <a href="/connect" class="btn btn-primary full-width btn-large">
                    <span class="btn-icon">🔗</span>
                    Connect WhatsApp
                  </a>
                `}
              </div>
            </div>

            <!-- Quick Actions Card -->
            <div class="quick-actions-card">
              <div class="card-header">
                <h3>Quick Actions</h3>
              </div>
              <div class="card-body">
                <div class="action-grid">
                  <button class="action-btn ${!isConnected ? 'disabled' : ''}" ${!isConnected ? 'disabled' : ''}>
                    <span class="action-icon">💬</span>
                    <span class="action-text">Messages</span>
                  </button>
                  <button class="action-btn ${!isConnected ? 'disabled' : ''}" ${!isConnected ? 'disabled' : ''}>
                    <span class="action-icon">👥</span>
                    <span class="action-text">Contacts</span>
                  </button>
                  <button class="action-btn ${!isConnected ? 'disabled' : ''}" ${!isConnected ? 'disabled' : ''}>
                    <span class="action-icon">📊</span>
                    <span class="action-text">Analytics</span>
                  </button>
                  <button class="action-btn ${!isConnected ? 'disabled' : ''}" ${!isConnected ? 'disabled' : ''}>
                    <span class="action-icon">⚙️</span>
                    <span class="action-text">Settings</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Connection Details Card -->
            <div class="details-card">
              <div class="card-header">
                <h3>Connection Details</h3>
              </div>
              <div class="card-body">
                <div class="detail-list">
                  <div class="detail-item">
                    <span class="detail-label">Session ID:</span>
                    <span class="detail-value">session_${user.telegram_id}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">Account Type:</span>
                    <span class="detail-value">Web User</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">Last Activity:</span>
                    <span class="detail-value" id="lastActivity">Active now</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">Security Level:</span>
                    <span class="detail-value success">High</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Activity Card -->
            <div class="activity-card">
              <div class="card-header">
                <h3>Recent Activity</h3>
              </div>
              <div class="card-body">
                <div class="activity-list">
                  <div class="activity-item">
                    <div class="activity-icon success">✅</div>
                    <div class="activity-content">
                      <div class="activity-title">Account Created</div>
                      <div class="activity-time">Today</div>
                    </div>
                  </div>
                  ${isConnected ? `
                    <div class="activity-item">
                      <div class="activity-icon success">🔗</div>
                      <div class="activity-content">
                        <div class="activity-title">WhatsApp Connected</div>
                        <div class="activity-time">Just now</div>
                      </div>
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Auto-refresh script -->
      <script>
        // Auto-refresh dashboard status every 10 seconds
        setInterval(async () => {
          try {
            const response = await fetch('/api/status')
            if (response.ok) {
              const status = await response.json()
              
              // Update UI elements directly
              const statusCard = document.getElementById('statusCard')
              const statusDot = document.getElementById('statusDot')
              const statusText = document.getElementById('statusText')
              const cardBody = document.getElementById('cardBody')
              const phoneInfo = document.getElementById('phoneInfo')
              
              if (statusCard && statusDot && statusText && cardBody) {
                const wasConnected = statusCard.classList.contains('connected')
                const isNowConnected = status.isConnected
                
                // Only update if status changed
                if (wasConnected !== isNowConnected) {
                  if (isNowConnected) {
                    statusCard.className = 'status-card connected'
                    statusDot.className = 'status-dot connected'
                    statusText.textContent = 'Connected'
                    
                    // Update card body to show connected state
                    cardBody.innerHTML = \`
                      <div class="connection-info">
                        <div class="info-item">
                          <span class="info-label">Phone Number:</span>
                          <span id="phoneInfo" class="info-value">\${status.phoneNumber || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                          <span class="info-label">Status:</span>
                          <span class="info-value success">Active</span>
                        </div>
                        <div class="info-item">
                          <span class="info-label">Connection Time:</span>
                          <span class="info-value" id="connectionTime">Just now</span>
                        </div>
                      </div>
                      <button id="disconnectBtn" class="btn btn-danger full-width">
                        <span class="btn-loading hidden">
                          <div class="spinner"></div>
                          Disconnecting...
                        </span>
                        <span class="btn-text">
                          <span class="btn-icon">🔌</span>
                          Disconnect WhatsApp
                        </span>
                      </button>
                    \`
                    
                    // Re-attach disconnect handler
                    const disconnectBtn = document.getElementById('disconnectBtn')
                    if (disconnectBtn && window.modernWebInterface) {
                      disconnectBtn.addEventListener('click', window.modernWebInterface.handleDisconnect.bind(window.modernWebInterface))
                    }
                    
                  } else {
                    statusCard.className = 'status-card disconnected'
                    statusDot.className = 'status-dot disconnected'
                    statusText.textContent = 'Disconnected'
                    
                    // Update card body to show disconnected state
                    cardBody.innerHTML = \`
                      <div class="no-connection">
                        <div class="no-connection-icon">📱</div>
                        <h4>Not Connected</h4>
                        <p>Connect your WhatsApp account to start using the web interface.</p>
                      </div>
                      <a href="/connect" class="btn btn-primary full-width btn-large">
                        <span class="btn-icon">🔗</span>
                        Connect WhatsApp
                      </a>
                    \`
                  }
                  
                  // Add visual feedback for status change
                  statusCard.style.transform = 'scale(1.02)'
                  setTimeout(() => {
                    statusCard.style.transform = ''
                  }, 200)
                }
                
                // Update phone info if available
                if (phoneInfo && status.phoneNumber) {
                  phoneInfo.textContent = status.phoneNumber
                }
              }
            }
          } catch (error) {
            console.error('Auto-refresh error:', error)
          }
        }, 10000)
      </script>
    </div>
  `
  
  return this.getBaseHTML('Dashboard', content, 'dashboard-page')
}

  renderConnect(data) {
    const { user } = data
    
    const content = `
      <div class="connect-container">
        <div class="connect-card">
          <div class="connect-header">
            <h1 class="connect-title">Connect WhatsApp</h1>
            <p class="connect-subtitle">Generate a pairing code to link your WhatsApp account</p>
          </div>
          
          <div class="connect-steps">
            <div class="step-item active" data-step="1">
              <div class="step-number">1</div>
              <div class="step-content">
                <div class="step-title">Enter Phone Number</div>
                <div class="step-description">Provide your WhatsApp phone number</div>
              </div>
            </div>
            <div class="step-item" data-step="2">
              <div class="step-number">2</div>
              <div class="step-content">
                <div class="step-title">Generate Code</div>
                <div class="step-description">Get your unique pairing code</div>
              </div>
            </div>
            <div class="step-item" data-step="3">
              <div class="step-number">3</div>
              <div class="step-content">
                <div class="step-title">Link Device</div>
                <div class="step-description">Enter code in WhatsApp app</div>
              </div>
            </div>
          </div>
          
          <form id="connectForm" class="connect-form">
            <div class="form-group">
              <label for="phoneNumber" class="form-label">WhatsApp Phone Number</label>
              <div class="input-group">
                <span class="input-icon">📱</span>
                <input 
                  type="tel" 
                  id="phoneNumber" 
                  name="phoneNumber" 
                  placeholder="+1234567890"
                  value="${user.phone_number}"
                  class="form-input"
                  required
                >
              </div>
              <small class="form-help">This should match your WhatsApp account phone number</small>
            </div>
            
            <button type="submit" class="btn btn-primary btn-large full-width">
              <span class="btn-loading hidden">
                <div class="spinner"></div>
                Generating code...
              </span>
              <span class="btn-text">
                <span class="btn-icon">🔐</span>
                Generate Pairing Code
              </span>
            </button>
          </form>
          
          <div id="loadingSection" class="loading-section hidden">
            <div class="loading-animation">
              <div class="loading-spinner"></div>
              <div class="loading-dots">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
              </div>
            </div>
            <h3>Generating Pairing Code</h3>
            <p>Please wait while we prepare your connection...</p>
          </div>
          
          <div id="codeSection" class="code-section hidden">
            <div class="code-header">
              <h3>Pairing Code Generated</h3>
              <div class="code-status">
                <span class="status-dot success"></span>
                <span>Ready to connect</span>
              </div>
            </div>
            
            <div class="pairing-code-container">
              <div class="pairing-code" id="pairingCode">Loading...</div>
              <button id="copyCodeBtn" class="btn btn-outline">
                <span class="btn-icon">📋</span>
                Copy Code
              </button>
            </div>
            
            <div class="instructions-card">
              <h4>How to Connect:</h4>
              <div class="instruction-steps">
                <div class="instruction-step">
                  <div class="instruction-number">1</div>
                  <div class="instruction-text">Open WhatsApp on your phone</div>
                </div>
                <div class="instruction-step">
                  <div class="instruction-number">2</div>
                  <div class="instruction-text">Go to Settings → Linked Devices</div>
                </div>
                <div class="instruction-step">
                  <div class="instruction-number">3</div>
                  <div class="instruction-text">Tap "Link a Device"</div>
                </div>
                <div class="instruction-step">
                  <div class="instruction-number">4</div>
                  <div class="instruction-text">Tap "Link with phone number instead"</div>
                </div>
                <div class="instruction-step">
                  <div class="instruction-number">5</div>
                  <div class="instruction-text">Enter the pairing code above</div>
                </div>
              </div>
            </div>
            
            <div id="connectionStatus" class="connection-status waiting">
              <div class="status-icon">⏳</div>
              <div class="status-content">
                <div class="status-title">Waiting for Connection</div>
                <div class="status-description">Enter the code in your WhatsApp app...</div>
                <div class="connection-progress">
                  <div class="progress-bar">
                    <div class="progress-fill"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="connect-footer">
            <a href="/dashboard" class="btn btn-outline">
              <span class="btn-icon">←</span>
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    `
    
    return this.getBaseHTML('Connect WhatsApp', content, 'connect-page')
  }
}