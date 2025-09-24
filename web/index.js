// web/index.js - Web Interface for WhatsApp Pairing - Optimized
import express from 'express'
import jwt from 'jsonwebtoken'
import path from 'path'
import { fileURLToPath } from 'url'
import { createComponentLogger } from '../utils/logger.js'
import { validatePhone } from '../utils/validation.js'
import { getSessionManager } from '../utils/session-manager.js'
import { SessionStorage } from '../utils/session-storage.js'
import { WebTemplates } from './templates/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const logger = createComponentLogger('WEB_INTERFACE')

export class WebInterface {
  constructor() {
    this.router = express.Router()
    this.storage = new SessionStorage()
    this.sessionManager = getSessionManager()
    this.templates = new WebTemplates()
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
    res.send(this.templates.renderHome())
  }

  renderRegisterPage(req, res) {
    res.send(this.templates.renderRegister())
  }

  renderLoginPage(req, res) {
    res.send(this.templates.renderLogin())
  }

  // In web/index.js - Fix renderDashboard method
async renderDashboard(req, res) {
  try {
    const sessionId = `session_${req.user.telegram_id}`
    
    // Get FRESH session data (not cached) to ensure accurate status
    const session = await this.storage.getSessionFresh(sessionId)
    
    // Also check if there's an active socket connection
    const activeSocket = this.sessionManager.getSession(sessionId)
    const hasActiveSocket = activeSocket && activeSocket.user
    
    // Connection is true if either database shows connected OR we have active socket
    const isConnected = (session?.isConnected || false) || hasActiveSocket
    
    logger.debug(`Dashboard render for ${sessionId}: db=${session?.isConnected}, socket=${!!hasActiveSocket}, final=${isConnected}`)
    
    res.send(this.templates.renderDashboard({
      user: req.user,
      isConnected,
      session: session || {}
    }))
  } catch (error) {
    logger.error('Dashboard render error:', error)
    res.status(500).send('Server error')
  }
}

  renderConnectPage(req, res) {
    res.send(this.templates.renderConnect({ user: req.user }))
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
      const isConnected = await this.storage.getSession(sessionId)
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

      // Disconnect from session manager first (clears sockets)
      await this.sessionManager.disconnectSession(sessionId)
      
      // Perform web user disconnect (database cleanup)
      await this.storage.performWebUserDisconnect(sessionId, telegramId)
      
      res.json({ 
        success: true, 
        message: 'Disconnected successfully' 
      })

    } catch (error) {
      logger.error('Disconnect error:', error)
      res.status(500).json({ error: 'Disconnect failed' })
    }
  }

  // In web/index.js - Fix handleStatus method
async handleStatus(req, res) {
  try {
    const telegramId = req.user.telegram_id
    const sessionId = `session_${telegramId}`
    
    // Check both session manager (active socket) AND database
    const activeSocket = this.sessionManager.getSession(sessionId)
    const isSocketConnected = activeSocket && activeSocket.user
    
    // Get fresh database status (not cached)
    const session = await this.storage.getSessionFresh(sessionId)
    const isDatabaseConnected = session?.isConnected || false
    
    // True connection means both socket exists OR database shows connected
    const isReallyConnected = isSocketConnected || isDatabaseConnected
    
    logger.debug(`Status check for ${sessionId}: socket=${!!isSocketConnected}, db=${isDatabaseConnected}, final=${isReallyConnected}`)
    
    res.json({
      isConnected: isReallyConnected,
      phoneNumber: session?.phoneNumber || null,
      connectionStatus: session?.connectionStatus || 'disconnected',
      sessionId,
      debug: {
        hasSocket: !!activeSocket,
        socketConnected: isSocketConnected,
        dbConnected: isDatabaseConnected
      }
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

      const session = await this.storage.getSession(sessionId)
      const isConnected = session?.isConnected || false
      
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
}