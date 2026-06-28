/**
 * Run the cross-package drift guards inside WEB'S suite too.
 *
 * The two guards below compare the SERVER copies (web/functions: agentTools'
 * ProposedOperation union + entitlements' TIER_LIMITS) against the core/mobile
 * source of truth. They physically live in mobile/src/__tests__ — so a change
 * to web/functions that drifted from core only failed *mobile's* suite, and a
 * commit that ran *web's* suite sailed through (that's exactly how the
 * entitlements `free.themes` mismatch shipped uncaught).
 *
 * Importing the test modules here re-registers their describe()/it() blocks in
 * web's run, with no duplicated assertions to keep in sync. The guards read
 * their target files via `__dirname`, so the paths resolve regardless of which
 * package's runner collected them.
 */
import '../../mobile/src/__tests__/proposedOperation-parity.test'
import '../../mobile/src/__tests__/entitlements-parity.test'
