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
    //  logger.debug(`Resolved LID ${lidJid} to ${participant.jid}`)
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

        // Create participant data object (NO message creation here)
        resolved.push({
          jid: actualJid,
          originalId: participant,
          displayName: `@${displayName}`,
          action: action
        })

      } catch (error) {
        logger.error(`Failed to resolve participant ${participant}:`, error)
        // Add fallback participant data
        resolved.push({
          jid: participant,
          originalId: participant,
          displayName: `@${participant.split('@')[0]}`,
          action: action
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