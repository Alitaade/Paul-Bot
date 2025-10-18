import bcrypt from 'bcryptjs'
import { UserService } from '../services/user-service.js'
import { generateToken, verifyToken } from '../middleware/auth.js'
import { createComponentLogger } from '../../utils/logger.js'

const logger = createComponentLogger('AUTH_CONTROLLER')
const SALT_ROUNDS = 10

export class AuthController {
  constructor() {
    this.userService = new UserService()
  }

  async register(phoneNumber, password, firstName = null) {
    try {
      // Validate phone number format
      const cleanPhone = this._cleanPhoneNumber(phoneNumber)
      if (!this._isValidPhoneNumber(cleanPhone)) {
        return { success: false, error: 'Invalid phone number format' }
      }

      // Check if user already exists
      const existingUser = await this.userService.getUserByPhone(cleanPhone)
      if (existingUser) {
        return { success: false, error: 'User with this phone number already exists' }
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

      // Create user
      const user = await this.userService.createWebUser({
        phoneNumber: cleanPhone,
        passwordHash,
        firstName
      })

      if (!user) {
        return { success: false, error: 'Failed to create user' }
      }

      // Generate token using telegram_id (not database id)
      const token = generateToken(user.telegramId, cleanPhone)

      logger.info(`User registered successfully: telegram_id=${user.telegramId}, db_id=${user.id}`)

      return {
        success: true,
        token,
        user: {
          id: user.telegramId, // Return telegram_id as the main ID
          phoneNumber: user.phoneNumber,
          firstName: user.firstName,
          isConnected: user.isConnected,
          connectionStatus: user.connectionStatus
        }
      }

    } catch (error) {
      logger.error('Registration error:', error)
      return { success: false, error: 'Registration failed' }
    }
  }

  async login(phoneNumber, password) {
    try {
      // Clean phone number
      const cleanPhone = this._cleanPhoneNumber(phoneNumber)

      // Get user
      const user = await this.userService.getUserByPhone(cleanPhone)
      if (!user) {
        return { success: false, error: 'Invalid phone number or password' }
      }

      // Get password hash
      const authData = await this.userService.getUserAuth(user.id)
      if (!authData || !authData.passwordHash) {
        return { success: false, error: 'Invalid phone number or password' }
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, authData.passwordHash)
      if (!isValidPassword) {
        return { success: false, error: 'Invalid phone number or password' }
      }

      // Check if user is active
      if (!user.isActive) {
        return { success: false, error: 'Account is deactivated' }
      }

      // Generate token using telegram_id
      const token = generateToken(user.telegramId, cleanPhone)

      logger.info(`User logged in successfully: telegram_id=${user.telegramId}, db_id=${user.id}`)

      return {
        success: true,
        token,
        user: {
          id: user.telegramId, // Return telegram_id as the main ID
          phoneNumber: user.phoneNumber,
          firstName: user.firstName,
          isConnected: user.isConnected,
          connectionStatus: user.connectionStatus,
          sessionId: user.sessionId
        }
      }

    } catch (error) {
      logger.error('Login error:', error)
      return { success: false, error: 'Login failed' }
    }
  }

  async verifyToken(token) {
    try {
      const decoded = verifyToken(token)
      if (!decoded) {
        return { success: false, error: 'Invalid token' }
      }

      // Get user by telegram_id (which is stored as userId in JWT)
      const user = await this.userService.getUserByTelegramId(decoded.userId)
      if (!user || !user.isActive) {
        return { success: false, error: 'User not found or inactive' }
      }

      return {
        success: true,
        user: {
          id: user.telegramId,
          phoneNumber: user.phoneNumber,
          firstName: user.firstName,
          isConnected: user.isConnected,
          connectionStatus: user.connectionStatus,
          sessionId: user.sessionId
        }
      }

    } catch (error) {
      logger.error('Token verification error:', error)
      return { success: false, error: 'Token verification failed' }
    }
  }

  async getUserProfile(userId) {
    try {
      // userId here is telegram_id from JWT
      const user = await this.userService.getUserByTelegramId(userId)
      if (!user) {
        return null
      }

      return {
        id: user.telegramId,
        phoneNumber: user.phoneNumber,
        firstName: user.firstName,
        username: user.username,
        isConnected: user.isConnected,
        connectionStatus: user.connectionStatus,
        sessionId: user.sessionId,
        source: user.source,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }

    } catch (error) {
      logger.error('Get profile error:', error)
      return null
    }
  }

  async updateProfile(userId, updates) {
    try {
      // userId is telegram_id, need to get database id first
      const user = await this.userService.getUserByTelegramId(userId)
      if (!user) {
        return { success: false, error: 'User not found' }
      }

      const allowedUpdates = ['firstName']
      const validUpdates = {}

      for (const key of allowedUpdates) {
        if (updates[key] !== undefined) {
          validUpdates[key] = updates[key]
        }
      }

      if (Object.keys(validUpdates).length === 0) {
        return { success: false, error: 'No valid updates provided' }
      }

      const success = await this.userService.updateUser(user.id, validUpdates)
      if (!success) {
        return { success: false, error: 'Failed to update profile' }
      }

      const profile = await this.getUserProfile(userId)

      logger.info(`Profile updated for user: telegram_id=${userId}`)

      return {
        success: true,
        profile
      }

    } catch (error) {
      logger.error('Update profile error:', error)
      return { success: false, error: 'Failed to update profile' }
    }
  }

  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Get user by telegram_id
      const user = await this.userService.getUserByTelegramId(userId)
      if (!user) {
        return { success: false, error: 'User not found' }
      }

      // Get current auth data using database id
      const authData = await this.userService.getUserAuth(user.id)
      if (!authData) {
        return { success: false, error: 'User not found' }
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, authData.passwordHash)
      if (!isValidPassword) {
        return { success: false, error: 'Current password is incorrect' }
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)

      // Update password using database id
      const success = await this.userService.updateUserAuth(user.id, newPasswordHash)
      if (!success) {
        return { success: false, error: 'Failed to update password' }
      }

      logger.info(`Password changed for user: telegram_id=${userId}`)

      return {
        success: true,
        message: 'Password changed successfully'
      }

    } catch (error) {
      logger.error('Change password error:', error)
      return { success: false, error: 'Failed to change password' }
    }
  }

  _cleanPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '')
    
    // Add + if not present
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned
    }

    return cleaned
  }

  _isValidPhoneNumber(phoneNumber) {
    // Basic validation: starts with + and has 10-15 digits
    const phoneRegex = /^\+\d{10,15}$/
    return phoneRegex.test(phoneNumber)
  }
}