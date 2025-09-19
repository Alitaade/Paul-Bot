// utils/validation.js - Fixed validation utilities
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js"

export class TelegramValidation {
  static validatePhoneNumber(phoneNumber) {
    try {
      // Remove any whitespace and ensure it starts with +
      const cleanNumber = phoneNumber.trim()

      if (!cleanNumber.startsWith("+")) {
        return {
          isValid: false,
          error: "Phone number must start with + and country code",
        }
      }

      // Validate using libphonenumber-js
      if (!isValidPhoneNumber(cleanNumber)) {
        return {
          isValid: false,
          error: "Invalid phone number format",
        }
      }

      const parsed = parsePhoneNumber(cleanNumber)

      return {
        isValid: true,
        formatted: parsed.format("E.164"),
        country: parsed.country,
        nationalNumber: parsed.nationalNumber,
      }
    } catch (error) {
      return {
        isValid: false,
        error: "Invalid phone number format",
      }
    }
  }

  static validateTelegramId(telegramId) {
    return typeof telegramId === "number" && telegramId > 0
  }

  static sanitizeInput(input) {
    if (typeof input !== "string") return ""

    return input
      .trim()
      .replace(/[<>]/g, "") // Remove potential HTML tags
      .substring(0, 1000) // Limit length
  }

  static isValidCallbackData(data) {
    return typeof data === "string" && data.length > 0 && data.length <= 64
  }
}

// Simplified validation function for the connection handler
export function validatePhone(phoneNumber) {
  return TelegramValidation.validatePhoneNumber(phoneNumber)
}