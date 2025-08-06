import { v4 as uuidv4 } from 'uuid'

const STATE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * In-memory store.
 *
 * Requires something more robust in production that has persistence
 * and may be cleaned up by a background job.
 */
const stateStore = {}

/**
 * Generate and store state.
 * @returns {string} state
 */
export function generateState() {
  const state = uuidv4() // may want to use something more cryptographically secure
  stateStore[state] = new Date()

  return state
}

/**
 * Confirm state is valid and not expired
 * @param state
 * @returns {boolean}
 */
export function validateState(state) {
  const timestamp = stateStore[state]

  // Invalid state
  if (!timestamp) {
    return false
  }

  delete stateStore[state]

  // Return whether state is still valid
  return new Date() - timestamp <= STATE_TTL_MS
}
