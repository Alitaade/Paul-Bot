// Baileys configuration with message patching for buttons/lists
import { Browsers } from "@whiskeysockets/baileys"
import { logger } from "./logger.js"
import pino from "pino"

export const baileysConfig = {
  // Override/add specific configurations
  // Logging configuration
  logger: pino({ level: "fatal" }),
  version: [2, 3000, 1023223821],
  browser: Browsers.macOS("Chrome"), // Override browser if needed
  markOnlineOnConnect: false,
  syncFullHistory: false, // Override config if needed
  emitOwnEvents: false,
  printQRInTerminal: false,
  fireInitQueries: true, // CRITICAL: Enable for better message sync
  defaultQueryTimeoutMs: 20000, // Increased timeout
  keepAliveIntervalMs: 25000, // More frequent pings
  connectTimeoutMs: 25000,
  retryRequestDelayMs: 250,
  maxMsgRetryCount: 3, // Reduced retries to prevent memory buildup
  msgRetryCounterCache: null, // Disable message retry caching
  shouldSyncHistoryMessage: () => false, // Disable history sync to save memory
  getMessage: async (key) => {
    // Don't cache messages - return undefined to let Baileys handle it
    return undefined
  }, // Fixed: Added missing comma
  
  // Patch messages before sending to improve compatibility
  patchMessageBeforeSending: (message) => {
    return patchMessage(message)
  },
  generateHighQualityLinkPreview: true
}

export const eventTypes = [
  "messages.upsert",
  "groups.update", 
  "group-participants.update",
  "messages.update",
  "contacts.update",
  "call",
]

// Message patching function to fix button/list/carousel compatibility issues
export const patchMessage = (message) => {
  try {
    // Create a copy to avoid mutating the original
    const patchedMessage = { ...message }
    
    // Fix for buttons messages not showing on recipient devices
    if (patchedMessage.buttonsMessage) {
      // Wrap buttons in viewOnce to bypass WhatsApp's button validation
      patchedMessage.viewOnceMessage = {
        message: {
          buttonsMessage: patchedMessage.buttonsMessage
        }
      }
      
      // Remove the original buttonsMessage to avoid conflicts
      delete patchedMessage.buttonsMessage
      
      logger.debug('[Baileys] Patched buttons message with viewOnce wrapper')
    }
    
    // Fix for list messages not showing
    if (patchedMessage.listMessage) {
      // Wrap list in viewOnce for better compatibility
      patchedMessage.viewOnceMessage = {
        message: {
          listMessage: patchedMessage.listMessage
        }
      }
      
      delete patchedMessage.listMessage
      logger.debug('[Baileys] Patched list message with viewOnce wrapper')
    }
    
    // Fix for interactive messages (carousels)
    if (patchedMessage.interactiveMessage) {
      // Ensure proper structure for carousel messages
      if (patchedMessage.interactiveMessage.carouselMessage) {
        // Add required fields for carousel compatibility
        patchedMessage.interactiveMessage.carouselMessage.messageVersion = 1
        
        // Ensure each card has proper structure
        if (patchedMessage.interactiveMessage.carouselMessage.cards) {
          patchedMessage.interactiveMessage.carouselMessage.cards.forEach((card, index) => {
            if (!card.cardIndex) {
              card.cardIndex = index
            }
            
            // Ensure proper button structure in cards
            if (card.body && card.body.buttons) {
              card.body.buttons.forEach((button, btnIndex) => {
                if (!button.buttonId) {
                  button.buttonId = `card_${index}_btn_${btnIndex}`
                }
              })
            }
          })
        }
        
        logger.debug('[Baileys] Patched carousel message structure')
      }
      
      // Wrap interactive message in viewOnce for better delivery
      patchedMessage.viewOnceMessage = {
        message: {
          interactiveMessage: patchedMessage.interactiveMessage
        }
      }
      
      delete patchedMessage.interactiveMessage
    }
    
    // Fix for template messages
    if (patchedMessage.templateMessage) {
      // Ensure proper template structure
      if (patchedMessage.templateMessage.hydratedTemplate) {
        const template = patchedMessage.templateMessage.hydratedTemplate
        
        // Fix button structure in templates
        if (template.hydratedButtons) {
          template.hydratedButtons.forEach((button, index) => {
            if (button.quickReplyButton && !button.quickReplyButton.id) {
              button.quickReplyButton.id = `template_btn_${index}`
            }
            if (button.urlButton && !button.urlButton.url) {
              button.urlButton.url = "https://example.com" // Fallback URL
            }
            if (button.callButton && !button.callButton.phoneNumber) {
              button.callButton.phoneNumber = "+1234567890" // Fallback number
            }
          })
        }
      }
      
      logger.debug('[Baileys] Patched template message structure')
    }
    
    // General fixes for message compatibility
    if (patchedMessage.extendedTextMessage) {
      // Ensure proper structure for extended text with buttons/links
      if (!patchedMessage.extendedTextMessage.contextInfo) {
        patchedMessage.extendedTextMessage.contextInfo = {}
      }
    }
    
    return patchedMessage
    
  } catch (error) {
    logger.error('[Baileys] Error patching message:', error.message)
    // Return original message if patching fails
    return message
  }
}

// Enhanced send message function with automatic patching
export const sendPatchedMessage = async (sock, jid, message, options = {}) => {
  try {
    // Apply message patching before sending
    const patchedMessage = patchMessage(message)
    
    // Send the patched message
    return await sock.sendMessage(jid, patchedMessage, options)
    
  } catch (error) {
    logger.error('[Baileys] Error sending patched message:', error.message)
    
    // Fallback: try sending original message
    try {
      return await sock.sendMessage(jid, message, options)
    } catch (fallbackError) {
      logger.error('[Baileys] Fallback send also failed:', fallbackError.message)
      throw fallbackError
    }
  }
}


// Utility function to check if a message type needs patching
export const requiresPatching = (message) => {
  return !!(
    message.buttonsMessage || 
    message.listMessage || 
    message.interactiveMessage || 
    message.templateMessage
  )
}

// Alternative fallback for completely broken buttons - convert to regular text
export const convertToFallbackMessage = (message) => {
  try {
    let fallbackText = ""
    
    if (message.buttonsMessage) {
      fallbackText = message.buttonsMessage.text || message.buttonsMessage.contentText || ""
      
      if (message.buttonsMessage.buttons) {
        fallbackText += "\n\nOptions:"
        message.buttonsMessage.buttons.forEach((button, index) => {
          const buttonText = button.buttonText?.displayText || button.displayText || `Option ${index + 1}`
          fallbackText += `\n${index + 1}. ${buttonText}`
        })
      }
    }
    
    if (message.listMessage) {
      fallbackText = message.listMessage.description || message.listMessage.title || ""
      
      if (message.listMessage.sections) {
        message.listMessage.sections.forEach(section => {
          if (section.title) fallbackText += `\n\n${section.title}`
          if (section.rows) {
            section.rows.forEach((row, index) => {
              fallbackText += `\n${index + 1}. ${row.title}`
              if (row.description) fallbackText += ` - ${row.description}`
            })
          }
        })
      }
    }
    
    return { text: fallbackText }
    
  } catch (error) {
    logger.error('[Baileys] Error converting to fallback message:', error.message)
    return { text: "Message could not be displayed properly. Please try again." }
  }
}