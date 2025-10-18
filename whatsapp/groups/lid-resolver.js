import { createComponentLogger } from '../../utils/logger.js'
import { getGroupMetadataManager } from './metadata.js'

const logger = createComponentLogger('LID_RESOLVER')

/**
 * Resolve LID (Lightweight ID) to actual phone number JID
 * LIDs are temporary identifiers used in groups
 */
export async function resolveLidToJid(sock, groupJid, lidJid) {
  try {
    // Not a LID, return as-is
    if (!lidJid.endsWith('@lid')) {
      return lidJid
    }

    // Get group metadata
    const metadataManager = getGroupMetadataManager()
    const metadata = await metadataManager.getMetadata(sock, groupJid)

    if (!metadata?.participants) {
      logger.warn(`No metadata found for ${groupJid}, cannot resolve LID`)
      return lidJid
    }

    // Find participant by LID and get their actual JID
    const participant = metadata.participants.find(p => p.id === lidJid)

    if (participant && participant.jid) {
      logger.debug(`Resolved LID ${lidJid} to ${participant.jid}`)
      return participant.jid
    }

    logger.warn(`Could not resolve LID ${lidJid} in ${groupJid}`)
    return lidJid

  } catch (error) {
    logger.error(`Error resolving LID ${lidJid}:`, error)
    return lidJid
  }
}

/**
 * Resolve multiple LIDs to JIDs
 */
export async function resolveLidsToJids(sock, groupJid, lids) {
  const resolved = []

  for (const lid of lids) {
    const jid = await resolveLidToJid(sock, groupJid, lid)
    resolved.push(jid)
  }

  return resolved
}

/**
 * Resolve participant information with LID support
 * Returns enriched participant data for welcome/goodbye messages
 */
export async function resolveParticipants(sock, groupJid, participants, action) {
  const resolved = []
  const metadataManager = getGroupMetadataManager()

  try {
    const metadata = await metadataManager.getMetadata(sock, groupJid)

    for (const participant of participants) {
      try {
        let actualJid = participant
        let displayName = participant.split('@')[0]

        // Resolve LID if necessary
        if (participant.endsWith('@lid')) {
          actualJid = await resolveLidToJid(sock, groupJid, participant)
        }

        // Get display name from metadata
        if (metadata?.participants) {
          const participantInfo = metadata.participants.find(p => 
            p.id === participant || p.jid === actualJid
          )

          if (participantInfo) {
            if (participantInfo.notify) {
              displayName = participantInfo.notify
            } else if (participantInfo.jid) {
              displayName = participantInfo.jid.split('@')[0]
            }
          }
        }

        // Create participant data object
        const participantData = {
          jid: actualJid,
          originalId: participant,
          displayName: `@${displayName}`,
          action: action
        }

        // Create message content
        participantData.message = await createActionMessage(
          sock,
          groupJid,
          action,
          participantData.displayName
        )

        // Create fake quoted message for reply context
        participantData.fakeQuotedMessage = createFakeQuotedMessage(
          action,
          participantData.displayName,
          actualJid,
          groupJid
        )

        resolved.push(participantData)

      } catch (error) {
        logger.error(`Failed to resolve participant ${participant}:`, error)
        // Add fallback participant data
        resolved.push({
          jid: participant,
          originalId: participant,
          displayName: `@${participant.split('@')[0]}`,
          action: action,
          message: null,
          fakeQuotedMessage: null
        })
      }
    }

    return resolved

  } catch (error) {
    logger.error(`Failed to resolve participants for ${groupJid}:`, error)
    return []
  }
}

/**
 * Create action message (welcome, goodbye, promote, demote)
 * @private
 */
async function createActionMessage(sock, groupJid, action, displayName) {
  try {
    const themeEmoji = '🌟'
    const metadataManager = getGroupMetadataManager()
    const groupName = await metadataManager.getGroupName(sock, groupJid)

    // Timestamp with timezone fix (add 1 hour)
    const timestamp = Math.floor(Date.now() / 1000) + 3600
    const messageDate = new Date(timestamp * 1000)
    const currentTime = messageDate.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    })
    const currentDate = messageDate.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })

    const messages = {
      add: `╚»˙·٠${themeEmoji}●♥ WELCOME ♥●${themeEmoji}٠·˙«╝\n\n✨ Welcome ${displayName}! ✨\n\nWelcome to ⚡${groupName}⚡! 🎉\n\n🕐 Joined at: ${currentTime}, ${currentDate}\n\n> © PAUL Bot`,
      
      remove: `╚»˙·٠${themeEmoji}●♥ GOODBYE ♥●${themeEmoji}٠·˙«╝\n\n✨ Goodbye ${displayName}! ✨\n\nYou'll be missed from ⚡${groupName}⚡! 🥲\n\n🕐 Left at: ${currentTime}, ${currentDate}\n\n> © PAUL Bot`,
      
      promote: `╚»˙·٠${themeEmoji}●♥ PROMOTION ♥●${themeEmoji}٠·˙«╝\n\n👑 Congratulations ${displayName}!\n\nYou have been promoted to admin in ⚡${groupName}⚡! 🎉\n\nPlease use your powers responsibly.\n\n🕐 Promoted at: ${currentTime}, ${currentDate}\n\n> © PAUL Bot`,
      
      demote: `╚»˙·٠${themeEmoji}●♥ DEMOTION ♥●${themeEmoji}٠·˙«╝\n\n📉 ${displayName} has been demoted from admin in ⚡${groupName}⚡.\n\nYou can still participate normally.\n\n🕐 Demoted at: ${currentTime}, ${currentDate}\n\n> © PAUL Bot`
    }

    return messages[action] || `Group ${action} notification for ${displayName} in ⚡${groupName}⚡`

  } catch (error) {
    logger.error('Failed to create action message:', error)
    return `${displayName} ${action}`
  }
}

/**
 * Create fake quoted message for context
 * @private
 */
function createFakeQuotedMessage(action, displayName, participantJid, groupJid) {
  const actionMessages = {
    add: `${displayName} joined the group`,
    remove: `${displayName} left the group`,
    promote: `${displayName} was promoted to admin`,
    demote: `${displayName} was demoted from admin`
  }

  return {
    key: {
      id: `FAKE_QUOTE_${Date.now()}`,
      remoteJid: groupJid,
      fromMe: false,
      participant: participantJid
    },
    message: {
      conversation: actionMessages[action] || `${action} event`
    },
    participant: participantJid
  }
}

/**
 * Get participant display name
 */
export async function getParticipantName(sock, groupJid, participantJid) {
  try {
    const metadataManager = getGroupMetadataManager()
    const metadata = await metadataManager.getMetadata(sock, groupJid)

    if (!metadata?.participants) {
      return `@${participantJid.split('@')[0]}`
    }

    const participant = metadata.participants.find(p =>
      p.id === participantJid || p.jid === participantJid
    )

    if (participant) {
      if (participant.notify) {
        return `@${participant.notify}`
      }
      if (participant.jid) {
        return `@${participant.jid.split('@')[0]}`
      }
    }

    return `@${participantJid.split('@')[0]}`

  } catch (error) {
    logger.error(`Failed to get participant name for ${participantJid}:`, error)
    return `@${participantJid.split('@')[0]}`
  }
}