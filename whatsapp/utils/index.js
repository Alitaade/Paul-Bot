// Utils module barrel export
export * from './jid.js'
export { handlePairing } from './pairing.js'
export * from './validators.js'
export * from './formatters.js'
export * from './helpers.js'
export { AntiDeletedHandler } from './deleted-handler.js'
export { ViewOnceHandler } from './viewonce-handler.js'

// Export VIPHelper - named export
export { VIPHelper } from './vip-helper.js'

// Export VIPTakeover - named export
export { VIPTakeover } from './vip-takeover.js'

// Import and re-export as default for backward compatibility
import VIPHelperDefault from './vip-helper.js'
import VIPTakeoverDefault from './vip-takeover.js'

// Create a default export object that includes both classes
export default {
  VIPHelper: VIPHelperDefault,
  VIPTakeover: VIPTakeoverDefault
}

// Re-export commonly used functions
export {
  normalizeJid,
  formatJid,
  isGroupJid,
  isUserJid,
  extractPhoneNumber
} from './jid.js'

export {
  validatePhoneNumber,
  validateJid,
  validateGroupJid
} from './validators.js'

export {
  formatTimestamp,
  formatFileSize,
  formatDuration
} from './formatters.js'