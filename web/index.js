// web/index.js - Web Interface for WhatsApp Pairing - Updated for Session Manager Split
import express from 'express'
import jwt from 'jsonwebtoken'
import path from 'path'
import { fileURLToPath } from 'url'
import { createComponentLogger } from '../utils/logger.js'
import { validatePhone } from '../utils/validation.js'
import { getSessionManager } from '../utils/session-manager.js'
import { SessionStorage } from '../utils/session-storage.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const logger = createComponentLogger('WEB_INTERFACE')

export class WebInterface {
  constructor() {
    this.router = express.Router()
    this.storage = new SessionStorage()
    this.sessionManager = getSessionManager()
    this.pendingConnections = new Map()
    this.jwtSecret = process.env.JWT_SECRET || 'change-this-secret-in-production'
    
    this.setupRoutes()
    this.setupMiddleware()
  }

  setupMiddleware() {
    // Serve static files (CSS, JS, images)
    this.router.use('/static', express.static(path.join(__dirname, 'static')))
  }

  setupRoutes() {
    // Main pages
    this.router.get('/', this.renderHomePage.bind(this))
    this.router.get('/register', this.renderRegisterPage.bind(this))
    this.router.get('/login', this.renderLoginPage.bind(this))
    this.router.get('/dashboard', this.authMiddleware.bind(this), this.renderDashboard.bind(this))
    this.router.get('/connect', this.authMiddleware.bind(this), this.renderConnectPage.bind(this))

    // API endpoints
    this.router.post('/api/register', this.handleRegister.bind(this))
    this.router.post('/api/login', this.handleLogin.bind(this))
    this.router.post('/api/connect', this.authMiddleware.bind(this), this.handleConnect.bind(this))
    this.router.post('/api/disconnect', this.authMiddleware.bind(this), this.handleDisconnect.bind(this))
    this.router.get('/api/status', this.authMiddleware.bind(this), this.handleStatus.bind(this))
    this.router.get('/api/connection-status/:sessionId', this.checkConnectionStatus.bind(this))
  }

  // Authentication middleware
  async authMiddleware(req, res, next) {
    try {
      const token = req.cookies?.auth_token || req.headers.authorization?.split(' ')[1]
      
      if (!token) {
        return res.redirect('/login')
      }

      const decoded = jwt.verify(token, this.jwtSecret)
      const user = await this.storage.getUserById(decoded.userId)
      
      if (!user) {
        return res.redirect('/login')
      }

      req.user = user
      next()
    } catch (error) {
      logger.error('Auth middleware error:', error)
      res.redirect('/login')
    }
  }

  // Route handlers
  renderHomePage(req, res) {
    res.send(this.getHTML('home'))
  }

  renderRegisterPage(req, res) {
    res.send(this.getHTML('register'))
  }

  renderLoginPage(req, res) {
    res.send(this.getHTML('login'))
  }

  async renderDashboard(req, res) {
    try {
      const sessionId = `session_${req.user.telegram_id}`
      const isConnected = await this.sessionManager.isReallyConnected(sessionId)
      const session = await this.storage.getSession(sessionId)
      
      res.send(this.getHTML('dashboard', {
        user: req.user,
        isConnected,
        session
      }))
    } catch (error) {
      logger.error('Dashboard render error:', error)
      res.status(500).send('Server error')
    }
  }

  renderConnectPage(req, res) {
    res.send(this.getHTML('connect', { user: req.user }))
  }

  // API handlers
  async handleRegister(req, res) {
    try {
      const { name, phoneNumber, password, confirmPassword } = req.body
      
      // Validation
      if (!name || !phoneNumber || !password || !confirmPassword) {
        return res.status(400).json({ error: 'All fields are required' })
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' })
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' })
      }

      const phoneValidation = validatePhone(phoneNumber)
      if (!phoneValidation.isValid) {
        return res.status(400).json({ error: 'Invalid phone number format' })
      }

      // Check if user exists
      const existingUser = await this.storage.getUserByPhone(phoneValidation.formatted)
      if (existingUser) {
        return res.status(400).json({ error: 'Phone number already registered' })
      }

      // Create user
      const user = await this.storage.createUser({
        name: name.trim(),
        phoneNumber: phoneValidation.formatted,
        password
      })

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, phoneNumber: user.phone_number },
        this.jwtSecret,
        { expiresIn: '7d' }
      )

      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      })

      res.json({ 
        success: true, 
        message: 'Registration successful',
        user: { id: user.id, name: user.name || user.first_name, phoneNumber: user.phone_number }
      })

    } catch (error) {
      logger.error('Register error:', error)
      res.status(500).json({ error: error.message })
    }
  }

  async handleLogin(req, res) {
    try {
      const { phoneNumber, password } = req.body
      
      if (!phoneNumber || !password) {
        return res.status(400).json({ error: 'Phone number and password are required' })
      }

      const phoneValidation = validatePhone(phoneNumber)
      if (!phoneValidation.isValid) {
        return res.status(400).json({ error: 'Invalid phone number format' })
      }

      const user = await this.storage.getUserByPhone(phoneValidation.formatted)
      if (!user || !user.password_hash) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      const bcrypt = await import('bcryptjs')
      const isValidPassword = await bcrypt.default.compare(password, user.password_hash)
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      const token = jwt.sign(
        { userId: user.id, phoneNumber: user.phone_number },
        this.jwtSecret,
        { expiresIn: '7d' }
      )

      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      })

      res.json({ 
        success: true, 
        message: 'Login successful',
        user: { id: user.id, name: user.name || user.first_name, phoneNumber: user.phone_number }
      })

    } catch (error) {
      logger.error('Login error:', error)
      res.status(500).json({ error: 'Login failed' })
    }
  }

  async handleConnect(req, res) {
    try {
      const { phoneNumber } = req.body
      const userId = req.user.id
      const telegramId = req.user.telegram_id
      
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' })
      }

      const phoneValidation = validatePhone(phoneNumber)
      if (!phoneValidation.isValid) {
        return res.status(400).json({ error: 'Invalid phone number format' })
      }

      const sessionId = `session_${telegramId}`
      
      // Check if already connected
      const isConnected = await this.sessionManager.isReallyConnected(sessionId)
      if (isConnected) {
        return res.status(400).json({ error: 'Already connected to WhatsApp' })
      }

      // Check if phone is in use by another session
      const existingSession = await this.storage.getSessionByPhone?.(phoneValidation.formatted)
      if (existingSession && existingSession.sessionId !== sessionId) {
        return res.status(400).json({ error: 'This phone number is already in use' })
      }

      // Clean up any stale data
      await this.sessionManager.disconnectSession(sessionId)

      // Generate pairing code using telegram_id
      const result = await this.generatePairingCode(telegramId, phoneValidation.formatted)
      
      if (result.success) {
        // Store pending connection
        this.pendingConnections.set(sessionId, {
          userId,
          telegramId,
          phoneNumber: phoneValidation.formatted,
          code: result.code,
          timestamp: Date.now()
        })

        // Auto cleanup after 2 minutes
        setTimeout(() => {
          if (this.pendingConnections.get(sessionId)?.code === result.code) {
            this.pendingConnections.delete(sessionId)
          }
        }, 120000)

        res.json({
          success: true,
          sessionId,
          code: result.code,
          phoneNumber: phoneValidation.formatted
        })
      } else {
        res.status(500).json({ error: result.error || 'Failed to generate pairing code' })
      }

    } catch (error) {
      logger.error('Connect error:', error)
      res.status(500).json({ error: 'Connection failed' })
    }
  }

  async generatePairingCode(telegramId, phoneNumber) {
    try {
      const sessionId = `session_${telegramId}`
      
      logger.info(`Web generating pairing code for ${phoneNumber} (telegram_id: ${telegramId})`)

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Code generation timeout'))
        }, 45000)

        // Use telegram_id directly
        this.sessionManager.createSession(telegramId, phoneNumber, {
          onPairingCode: (code) => {
            clearTimeout(timeout)
            logger.info(`Web pairing code generated for telegram_id ${telegramId}: ${code}`)
            resolve({ success: true, code })
          },
          
          onConnected: async (sock) => {
            logger.info(`Web WhatsApp connection successful for telegram_id ${telegramId}: ${phoneNumber}`)
            this.pendingConnections.delete(sessionId)
          },
          
          onError: (error) => {
            clearTimeout(timeout)
            logger.error('Web session creation error:', error)
            resolve({ success: false, error: error.message })
          }
        }).catch(error => {
          clearTimeout(timeout)
          logger.error('Web session creation failed:', error)
          resolve({ success: false, error: error.message })
        })
      })

    } catch (error) {
      logger.error('Web pairing code generation error:', error)
      return { success: false, error: error.message }
    }
  }

  async handleDisconnect(req, res) {
    try {
      const telegramId = req.user.telegram_id
      const sessionId = `session_${telegramId}`
      
      const session = await this.storage.getSession(sessionId)
      if (!session || !session.isConnected) {
        return res.status(400).json({ error: 'Not connected to WhatsApp' })
      }

      await this.sessionManager.disconnectSession(sessionId)
      
      res.json({ 
        success: true, 
        message: 'Disconnected successfully' 
      })

    } catch (error) {
      logger.error('Disconnect error:', error)
      res.status(500).json({ error: 'Disconnect failed' })
    }
  }

  async handleStatus(req, res) {
  try {
    const telegramId = req.user.telegram_id
    const sessionId = `session_${telegramId}`
    
    // For web users, check database status directly since web hands over to pterodactyl
    const session = await this.storage.getSession(sessionId)
    const isConnected = session?.isConnected || false
    
    res.json({
      isConnected,
      phoneNumber: session?.phoneNumber || null,
      connectionStatus: session?.connectionStatus || 'disconnected',
      sessionId
    })

  } catch (error) {
    logger.error('Status check error:', error)
    res.status(500).json({ error: 'Status check failed' })
  }
}

  async checkConnectionStatus(req, res) {
    try {
      const { sessionId } = req.params
      
      if (!sessionId.startsWith('session_')) {
        return res.status(400).json({ error: 'Invalid session ID' })
      }

      const isConnected = await this.sessionManager.isReallyConnected(sessionId)
      const session = await this.storage.getSession(sessionId)
      
      res.json({
        isConnected,
        phoneNumber: session?.phoneNumber || null,
        connectionStatus: session?.connectionStatus || 'disconnected'
      })

    } catch (error) {
      logger.error('Connection status check error:', error)
      res.status(500).json({ error: 'Status check failed' })
    }
  }

  // HTML templates (keeping existing content)
  getHTML(page, data = {}) {
    const baseHTML = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Paul WhatsApp Web Pairing</title>
        <link rel="stylesheet" href="/static/style.css">
      </head>
      <body>
        ${this.getPageContent(page, data)}
        <script src="/static/script.js"></script>
      </body>
      </html>
    `
    
    return baseHTML
  }

  getPageContent(page, data) {
    switch (page) {
      case 'home':
        return this.getHomeContent()
      case 'register':
        return this.getRegisterContent()
      case 'login':
        return this.getLoginContent()
      case 'dashboard':
        return this.getDashboardContent(data)
      case 'connect':
        return this.getConnectContent(data)
      default:
        return '<div class="container"><h1>Page Not Found</h1></div>'
    }
  }

  getHomeContent() {
    return `
      <div class="container">
        <div class="hero">
          <h1>Paul WhatsApp Web Pairing</h1>
          <p>Connect your WhatsApp account securely through our web interface</p>
          <div class="hero-buttons">
            <a href="/login" class="btn btn-primary">Login</a>
            <a href="/register" class="btn btn-secondary">Register</a>
          </div>
        </div>
        
        <div class="features">
          <div class="feature-card">
            <h3>🔒 Secure Connection</h3>
            <p>Your WhatsApp data is encrypted and secure</p>
          </div>
          <div class="feature-card">
            <h3>🌐 Web Access</h3>
            <p>Access WhatsApp from any web browser</p>
          </div>
          <div class="feature-card">
            <h3>📱 Easy Pairing</h3>
            <p>Simple pairing process with QR code</p>
          </div>
        </div>
      </div>
    `
  }

  getRegisterContent() {
    return `
      <div class="container">
        <div class="auth-form">
          <h2>Create Account</h2>
          <form id="registerForm">
            <div class="form-group">
              <label for="name">Full Name</label>
              <input type="text" id="name" name="name" required>
            </div>
            
            <div class="form-group">
              <label for="phoneNumber">Phone Number</label>
              <input type="tel" id="phoneNumber" name="phoneNumber" placeholder="+234xxxxxxxxxx" required>
              <small>Include country code (e.g., +234 for Nigeria)</small>
            </div>
            
            <div class="form-group">
              <label for="password">Password</label>
              <div class="password-input">
                <input type="password" id="password" name="password" required>
                <button type="button" class="toggle-password" data-target="password">👁️</button>
              </div>
            </div>
            
            <div class="form-group">
              <label for="confirmPassword">Confirm Password</label>
              <div class="password-input">
                <input type="password" id="confirmPassword" name="confirmPassword" required>
                <button type="button" class="toggle-password" data-target="confirmPassword">👁️</button>
              </div>
            </div>
            
            <button type="submit" class="btn btn-primary full-width">Register</button>
          </form>
          
          <p class="auth-link">
            Already have an account? <a href="/login">Login here</a>
          </p>
        </div>
      </div>
    `
  }

  getLoginContent() {
    return `
      <div class="container">
        <div class="auth-form">
          <h2>Login</h2>
          <form id="loginForm">
            <div class="form-group">
              <label for="phoneNumber">Phone Number</label>
              <input type="tel" id="phoneNumber" name="phoneNumber" placeholder="+234xxxxxxxxxx" required>
            </div>
            
            <div class="form-group">
              <label for="password">Password</label>
              <div class="password-input">
                <input type="password" id="password" name="password" required>
                <button type="button" class="toggle-password" data-target="password">👁️</button>
              </div>
            </div>
            
            <button type="submit" class="btn btn-primary full-width">Login</button>
          </form>
          
          <p class="auth-link">
            Don't have an account? <a href="/register">Register here</a>
          </p>
        </div>
      </div>
    `
  }

  getDashboardContent(data) {
    const { user, isConnected, session } = data
    
    return `
      <div class="container">
        <div class="dashboard-header">
          <h1>Welcome, ${user.name}</h1>
          <p>Phone: ${user.phone_number}</p>
        </div>
        
        <div class="status-card ${isConnected ? 'connected' : 'disconnected'}">
          <h3>WhatsApp Status</h3>
          <div class="status-indicator">
            <span class="status-dot ${isConnected ? 'connected' : 'disconnected'}"></span>
            <span class="status-text">${isConnected ? 'Connected' : 'Not Connected'}</span>
          </div>
          
          ${isConnected ? `
            <p>Connected to: ${session?.phoneNumber || 'Unknown'}</p>
            <button id="disconnectBtn" class="btn btn-danger">Disconnect</button>
          ` : `
            <p>Connect your WhatsApp account to get started</p>
            <a href="/connect" class="btn btn-primary">Connect WhatsApp</a>
          `}
        </div>
        
        <div class="actions">
          <button id="refreshStatus" class="btn btn-secondary">Refresh Status</button>
          <button id="logoutBtn" class="btn btn-outline">Logout</button>
        </div>
      </div>
    `
  }

  getConnectContent(data) {
    const { user } = data
    
    return `
      <div class="container">
        <div class="connect-form">
          <h2>Connect WhatsApp</h2>
          <p>Enter your WhatsApp phone number to generate a pairing code</p>
          
          <form id="connectForm">
            <div class="form-group">
              <label for="phoneNumber">WhatsApp Phone Number</label>
              <input type="tel" id="phoneNumber" name="phoneNumber" 
                     placeholder="+234xxxxxxxxxx" 
                     value="${user.phone_number}" required>
              <small>This should be your WhatsApp phone number</small>
            </div>
            
            <button type="submit" class="btn btn-primary full-width">Generate Pairing Code</button>
          </form>
          
          <div id="loadingSection" class="loading-section hidden">
            <div class="spinner"></div>
            <p>Generating pairing code...</p>
          </div>
          
          <div id="codeSection" class="code-section hidden">
            <h3>Pairing Code Generated</h3>
            <div class="pairing-code" id="pairingCode">Loading...</div>
            <button id="copyCodeBtn" class="btn btn-secondary">Copy Code</button>
            
            <div class="instructions">
              <h4>How to connect:</h4>
              <ol>
                <li>Open WhatsApp on your phone</li>
                <li>Go to Settings > Linked Devices</li>
                <li>Tap "Link a Device"</li>
                <li>Tap "Link with phone number instead"</li>
                <li>Enter the pairing code above</li>
              </ol>
            </div>
            
            <div id="connectionStatus" class="connection-status">
              <p>Waiting for connection...</p>
              <div class="spinner small"></div>
            </div>
          </div>
          
          <a href="/dashboard" class="btn btn-outline">Back to Dashboard</a>
        </div>
      </div>
    `
  }
}