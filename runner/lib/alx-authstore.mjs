/**
 * 上游王者插件通过 authStore 拿「营地登录态」候选，并回写失效/成功。
 * 这里把它接到本插件的 store 上：只维护一份全局账号。
 */
import { getAccount, saveAccount } from './store.mjs'

const DEFAULT_PUBLIC_KEY =
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC0h62mV/zjJtFsNdfFNlxksfUOpjDI2KCcBrPiA8T7szABT4InLDTrdXAW84QyGNiazB0i7pgPCNGSAYbiJrCRutZ5jQsVS0Wg/RnXfwVQDJcAHJDjP5IXyroeLX7NUxDai8nPcpfRsvq6sneobyPexZSH0TlVSnecsJZTj5wu/wIDAQAB'

const state = { failures: 0, lastError: '' }

const authStore = {
  getAuthCandidates(targetUserId, options = {}) {
    const account = getAccount('kog')
    if (!account || !account.userId || !account.token) return []
    if (state.failures >= 3) return []
    return [
      {
        source: 'global',
        auth: {
          ...account,
          publicKey: DEFAULT_PUBLIC_KEY,
          gameAreaId: '1',
          gameUserSex: '1',
          kohDimGender: '2',
          enableAccountPool: true,
          allowPersonalAuthFallback: true
        }
      }
    ].filter(Boolean)
  },

  markAuthFailure(userId, message = '') {
    state.failures += 1
    state.lastError = message
    const account = getAccount('kog')
    if (account) {
      saveAccount('kog', { ...account, invalid: state.failures >= 3, lastError: message })
    }
    return { newlyInvalid: state.failures === 3 }
  },

  markAuthSuccess() {
    state.failures = 0
    state.lastError = ''
    const account = getAccount('kog')
    if (account && account.invalid) {
      saveAccount('kog', { ...account, invalid: false, lastError: '' })
    }
  }
}

export default authStore
export { authStore }
