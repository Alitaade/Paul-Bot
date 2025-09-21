// WhatsApp pairing utility
import { logger } from "./logger.js";

export async function handlePairing(
  sock,
  sessionId,
  phoneNumber,
  pairingState,
  callbacks
) {
  try {
    if (!phoneNumber) return;

    const existingPair = pairingState.get(sessionId);
    const now = Date.now();
    if (existingPair && now < existingPair.expiresAt && existingPair.active) {
      if (callbacks?.onPairingCode)
        await callbacks.onPairingCode(existingPair.code);
      return;
    }

    // Use Sineine's method: remove all non-numeric characters
    const formattedPhone = phoneNumber.replace(/[^0-9]/g, "");
    logger.info(
      `[SessionManager] Original: ${phoneNumber}, Formatted: ${formattedPhone}`
    );

    // Wait a moment before requesting pairing code
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const code = await sock.requestPairingCode(formattedPhone);
    const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;

    pairingState.set(sessionId, {
      code: formattedCode,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      active: true,
    });

    logger.info(
      `[SessionManager] Pairing code for ${sessionId}: ${formattedCode}`
    );
    if (callbacks?.onPairingCode) await callbacks.onPairingCode(formattedCode);
  } catch (error) {
    logger.error(`[SessionManager] Pairing code error: ${error.message}`);
  }
}

export function markPairingRestartHandled(pairingState, sessionId) {
  const pair = pairingState.get(sessionId);
  if (pair) pairingState.set(sessionId, { ...pair, active: false });
}

export function clearPairing(pairingState, sessionId) {
  pairingState.delete(sessionId);
}
