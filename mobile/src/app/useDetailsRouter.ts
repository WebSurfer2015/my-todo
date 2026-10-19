/**
 * Opening the ONE to-do details sheet from anywhere — a row tap, or a
 * reminder tap that can arrive while ANY sheet or modal is up — plus the
 * sheet → sheet handoff timers SheetProvider uses for every Modal switch.
 *
 * iOS can't stack <Modal>s, and force-closing what's open would silently
 * drop the user's work (a Compose draft, a half-picked date). So when
 * something is presented, a REMINDER request is PARKED; once nothing is
 * presented (no provider sheet, no details, no counted Modal — for a dismiss
 * grace), a calm `Reminder: “<title>” · Open` snackbar is offered. It's shown
 * at the app root, which sits UNDER any presented Modal — showing it earlier
 * meant it expired unseen. So the offer also re-checks when it would show
 * (after a visible Undo ends) and is handed back to wait if a sheet opened
 * meanwhile. A newer request replaces the parked one; a parked request is
 * dropped after PARK_TTL_MS, and never offered for a gone / trashed to-do.
 *
 * The user's OWN row tap is never parked or relabelled "Reminder": if
 * something is still dismissing it retries a few handoffs later, then drops.
 *
 * When just details is up on ANOTHER to-do, it closes through its own save
 * path (commits typed text / series edits) and the new one opens once it has
 * closed. Details' own dismiss animation counts as presented (a grace) for
 * every other open. A request whose Modal never reports `onShow` (iOS
 * refused to present it) is cleared DETAILS_SHOW_TIMEOUT_MS after the sheet
 * MOUNTED (not after the request — a slow cold launch / resume would
 * otherwise close a sheet that is still presenting), so it can't linger as
 * an invisible ghost; while the app isn't active the guard re-arms once
 * instead. Everything is reset when the signed-in account changes.
 *
 * Plain hook (no JSX) so the routing rules are unit-testable with renderHook.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { reportNonFatal } from '../adapters/crashReporting'
import { detailsNotifyMessage, planDetailsOpen, type DetailsReq } from './detailsOpenPlan'
import { isAnyModalPresented } from './modalPresence'
import { MODAL_DISMISS_GRACE_MS, MODAL_HANDOFF_MS } from './modalTiming'

/** How often a parked request checks whether the screen is clear. */
export const PARK_POLL_MS = 100
/** How long the reminder offer stays up once it's visible. */
export const DETAILS_OFFER_MS = 8000
/** A parked reminder older than this is dropped — an offer long after the
 * tap (a sheet left open for hours) would be out of context. */
export const PARK_TTL_MS = 3 * 60_000
/** Retries (one handoff apart) while something is still dismissing — for
 * the snackbar's Open and the user's own row tap. */
export const MAX_OPEN_RETRIES = 6
/** Details must report it presented (RN Modal `onShow`) within this long
 * after the sheet MOUNTED (`detailsMounted`). If it doesn't, iOS refused the
 * presentation (something native, e.g. an uncounted system sheet, was up),
 * so the request is cleared rather than left as an invisible "ghost" that
 * blocks later opens — a reminder's is parked as an offer instead. Timed
 * from mount, not from the request, and generous, so a slow present (cold
 * launch from a reminder, warm resume, an older device) isn't cut off; if
 * the app isn't active when it fires, it re-arms once. */
export const DETAILS_SHOW_TIMEOUT_MS = 2500

/** Where an open request came from. `user` = their own row tap. */
export type OpenSource = 'user' | 'reminder'

export interface DetailsRouterDeps {
  /** A sheet SheetProvider owns (Compose, Mochi, Profile, …) is open. */
  anySheetOpen: boolean
  /** The signed-in account; a change resets everything. */
  accountUid: string | null
  /** Live lookup of a to-do (undefined once it's gone). */
  findTodo: (id: string) => { text: string; trashed?: boolean } | undefined
  showSnackbar: (opts: {
    message: string
    actionLabel: string
    onAction: () => void
    durationMs: number
    queue: boolean
    canShow: () => boolean
    onBlocked: () => void
  }) => void
}

export interface DetailsRouter {
  /** The to-do the details sheet shows (null = closed). */
  detailsReq: DetailsReq | null
  /** `source` is required: a 'reminder' request parks when it can't open; a
   * 'user' tap retries a few handoffs, then drops. */
  openTaskDetails: (todoId: string, subtaskId: string | null, opts: { source: OpenSource }) => void
  /** The details sheet mounted — starts the ghost guard's clock. */
  detailsMounted: () => void
  /** The details sheet presented (its Modal's onShow). */
  detailsShown: () => void
  /** The details sheet closed (its onClose): open a queued swap, if any. */
  closeTaskDetails: () => void
  /** The mounted details sheet registers its close-and-save path here. */
  registerDetailsClose: (fn: (() => void) | null) => void
  /** The open to-do vanished (deleted elsewhere): forget it and any swap. */
  forgetDetails: () => void
  /** Run `fn` once the current Modal has animated out. */
  afterModalClose: (fn: () => void) => void
  /** Drop every pending handoff (unmount / account change). */
  cancelHandoffs: () => void
}

/** One open attempt. `retry` = handoffs waited so far; `swap` = a queued
 * swap whose handoff already waited out details' own dismissal. */
interface OpenAttempt {
  source: OpenSource
  retry?: number
  swap?: boolean
}

interface Parked {
  req: DetailsReq
  /** Dropped at this time (Date.now()). */
  expiresAt: number
  /** `openCounts` for this to-do when it was parked: if the user has opened
   * it since, the reminder is moot and its offer is dropped. */
  openSeq: number
}

export function useDetailsRouter(deps: DetailsRouterDeps): DetailsRouter {
  const [detailsReq, setDetailsReq] = useState<DetailsReq | null>(null)
  // Latest deps for callbacks that run later (timers, snackbar actions).
  const depsRef = useRef(deps)
  useEffect(() => {
    depsRef.current = deps
  })
  const openStateRef = useRef({ anySheetOpen: deps.anySheetOpen, detailsId: null as string | null })
  openStateRef.current = { anySheetOpen: deps.anySheetOpen, detailsId: detailsReq?.id ?? null }

  // Sheet → sheet handoffs. SheetProvider sits ABOVE AppGate, so sign-out
  // does NOT unmount it — pending handoffs are dropped on an account change.
  const handoffTimers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const cancelHandoffs = useCallback(() => {
    handoffTimers.current.forEach(clearTimeout)
    handoffTimers.current.clear()
  }, [])
  useEffect(() => cancelHandoffs, [cancelHandoffs])
  const afterModalClose = useCallback((fn: () => void) => {
    const id = setTimeout(() => {
      handoffTimers.current.delete(id)
      fn()
    }, MODAL_HANDOFF_MS)
    handoffTimers.current.add(id)
  }, [])

  // Details' OWN dismiss animation counts as presented, with the same grace
  // useModalPresence gives every other Modal. Tracked here, not in the
  // global count — that would make details block its own swaps.
  const detailsDismissingRef = useRef(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    },
    [],
  )
  const clearDetails = useCallback(() => {
    if (openStateRef.current.detailsId !== null) {
      detailsDismissingRef.current = true
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => {
        dismissTimerRef.current = null
        detailsDismissingRef.current = false
      }, MODAL_DISMISS_GRACE_MS)
    }
    setDetailsReq(null)
  }, [])

  /** Nothing is presented or animating out: an offer would be seen. */
  const isScreenClear = useCallback(() => {
    const { anySheetOpen, detailsId } = openStateRef.current
    return !anySheetOpen && detailsId === null && !detailsDismissingRef.current && !isAnyModalPresented()
  }, [])

  /** A reminder for a to-do that's gone or in the Done bin isn't offered. */
  const isOfferable = useCallback((id: string) => {
    const td = depsRef.current.findTodo(id)
    return !!td && !td.trashed
  }, [])

  const detailsCloseRef = useRef<(() => void) | null>(null)
  const registerDetailsClose = useCallback((fn: (() => void) | null) => {
    detailsCloseRef.current = fn
  }, [])
  const pendingRef = useRef<{ req: DetailsReq; source: OpenSource } | null>(null)
  const openDetailsRef = useRef<(req: DetailsReq, attempt: OpenAttempt) => void>(() => {})

  // ---- Parked request → offered once the screen is clear ----
  const parkedRef = useRef<Parked | null>(null)
  const [parkSeq, setParkSeq] = useState(0)
  // How many times each to-do has been opened (any source). A parked / handed
  // back offer remembers the count it was parked at — once the user has
  // opened that to-do directly, its reminder offer is moot.
  const openCountsRef = useRef(new Map<string, number>())
  const openCount = useCallback((id: string) => openCountsRef.current.get(id) ?? 0, [])
  const isStillMeaningful = useCallback(
    (p: Parked) => openCount(p.req.id) === p.openSeq && isOfferable(p.req.id),
    [openCount, isOfferable],
  )
  // `expiresAt` / `openSeq` carry over when an offer is handed back (re-parked).
  const park = useCallback(
    (req: DetailsReq, carried?: { expiresAt: number; openSeq: number }) => {
      if (!isOfferable(req.id)) return
      const openSeq = carried?.openSeq ?? openCount(req.id)
      if (openSeq !== openCount(req.id)) return
      parkedRef.current = { req, expiresAt: carried?.expiresAt ?? Date.now() + PARK_TTL_MS, openSeq }
      setParkSeq((n) => n + 1)
    },
    [isOfferable, openCount],
  )
  useEffect(() => {
    if (!parkedRef.current) return
    let clearFor = 0
    const id = setInterval(() => {
      const parked = parkedRef.current
      if (!parked || Date.now() >= parked.expiresAt) {
        // Gone, or out of context by now: stop polling.
        parkedRef.current = null
        clearInterval(id)
        return
      }
      clearFor = isScreenClear() ? clearFor + PARK_POLL_MS : 0
      if (clearFor < MODAL_DISMISS_GRACE_MS) return
      clearInterval(id)
      parkedRef.current = null
      const { req } = parked
      const td = depsRef.current.findTodo(req.id)
      if (!td || td.trashed || !isStillMeaningful(parked)) return
      depsRef.current.showSnackbar({
        message: detailsNotifyMessage(td.text),
        actionLabel: 'Open',
        onAction: () => openDetailsRef.current(req, { source: 'reminder', retry: 0 }),
        durationMs: DETAILS_OFFER_MS,
        // Never clobber an Undo that's showing — wait for it…
        queue: true,
        // …and if a sheet opened meanwhile, don't play it hidden under that
        // sheet: hand it back to wait again (same expiry).
        // (Dropped if the user opened this to-do meanwhile.)
        canShow: () => isScreenClear() && isStillMeaningful(parked),
        onBlocked: () => park(req, parked),
      })
    }, PARK_POLL_MS)
    return () => clearInterval(id)
  }, [parkSeq, isScreenClear, isStillMeaningful, park])

  // ---- Ghost guard: a set request whose Modal never presented ----
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current)
    showTimerRef.current = null
  }, [])
  useEffect(() => clearShowTimer, [clearShowTimer])
  // The request now set (opened 'now'), and whether its Modal reported onShow.
  const currentRef = useRef<{ req: DetailsReq; source: OpenSource; shown: boolean } | null>(null)
  const detailsShown = useCallback(() => {
    clearShowTimer()
    if (currentRef.current) currentRef.current.shown = true
  }, [clearShowTimer])
  // Armed when the sheet MOUNTS: on a slow present (cold launch from a
  // reminder, resume, older device) the clock no longer runs while React is
  // still getting the sheet onto the screen.
  const detailsMounted = useCallback(() => {
    const cur = currentRef.current
    if (!cur || cur.shown || openStateRef.current.detailsId !== cur.req.id) return
    clearShowTimer()
    const arm = (rearmed: boolean) => {
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null
        if (currentRef.current !== cur || cur.shown || openStateRef.current.detailsId !== cur.req.id) return
        // Backgrounded / inactive (e.g. a resume still in flight): iOS
        // presents once the app is active — give it one more budget.
        if (!rearmed && AppState.currentState !== 'active') {
          arm(true)
          return
        }
        // Never presented: don't leave a ghost that blocks every later
        // open. A reminder's request waits as an offer instead.
        currentRef.current = null
        pendingRef.current = null
        clearDetails()
        if (cur.source === 'reminder') park(cur.req)
      }, DETAILS_SHOW_TIMEOUT_MS)
    }
    arm(false)
  }, [clearShowTimer, clearDetails, park])

  const openDetails = useCallback(
    (req: DetailsReq, attempt: OpenAttempt) => {
      const plan = planDetailsOpen({
        ...openStateRef.current,
        // A swap's handoff already waited for details to animate out.
        anyModalOpen: isAnyModalPresented() || (!attempt.swap && detailsDismissingRef.current),
        todoId: req.id,
      })
      // Opening the parked to-do itself makes its offer moot (only that
      // to-do — another one opening keeps the offer). Counted per to-do so an
      // offer already handed to the snackbar queue is dropped too.
      if (plan !== 'notify') {
        openCountsRef.current.set(req.id, openCount(req.id) + 1)
        if (parkedRef.current?.req.id === req.id) parkedRef.current = null
      }
      switch (plan) {
        case 'already-open':
          return
        case 'notify': {
          const retry = attempt.retry ?? (attempt.source === 'user' ? 0 : undefined)
          if (retry !== undefined && retry < MAX_OPEN_RETRIES) {
            afterModalClose(() => openDetailsRef.current(req, { source: attempt.source, retry: retry + 1 }))
          } else if (attempt.source === 'reminder') park(req)
          // A user tap that still can't open is dropped (they can tap
          // again) — never relabelled as a "Reminder". Reported: a leaked
          // presence count would make this happen on every tap.
          else reportNonFatal('details: user tap dropped after MAX_OPEN_RETRIES (something still presented)')
          return
        }
        case 'swap':
          pendingRef.current = { req, source: attempt.source }
          if (detailsCloseRef.current) detailsCloseRef.current()
          else clearDetails()
          // The close path ran synchronously unless details asked a series
          // confirm first (an Alert). Don't leave the request queued — a
          // Cancel there keeps details open, and a later close would pop
          // this one open out of nowhere. Park a reminder instead.
          if (pendingRef.current?.req === req) {
            pendingRef.current = null
            if (attempt.source === 'reminder') park(req)
          }
          return
        case 'now':
          // The ghost guard is armed by detailsMounted (the sheet's mount).
          clearShowTimer()
          currentRef.current = { req, source: attempt.source, shown: false }
          setDetailsReq(req)
      }
    },
    [afterModalClose, park, clearDetails, clearShowTimer, openCount],
  )
  useEffect(() => {
    openDetailsRef.current = openDetails
  }, [openDetails])

  const openTaskDetails = useCallback(
    (todoId: string, subtaskId: string | null, opts: { source: OpenSource }) =>
      openDetails({ id: todoId, subtaskId }, { source: opts.source }),
    [openDetails],
  )
  // A queued swap goes back through the plan: something may have opened
  // during the handoff.
  const closeTaskDetails = useCallback(() => {
    clearShowTimer()
    currentRef.current = null
    clearDetails()
    const next = pendingRef.current
    pendingRef.current = null
    if (next) afterModalClose(() => openDetailsRef.current(next.req, { source: next.source, swap: true }))
  }, [afterModalClose, clearDetails, clearShowTimer])
  const forgetDetails = useCallback(() => {
    clearShowTimer()
    currentRef.current = null
    pendingRef.current = null
    clearDetails()
  }, [clearDetails, clearShowTimer])

  // Per account: nothing opened, queued or parked survives an account change.
  useEffect(() => {
    setDetailsReq(null)
    currentRef.current = null
    pendingRef.current = null
    parkedRef.current = null
    openCountsRef.current.clear()
    clearShowTimer()
    cancelHandoffs()
  }, [deps.accountUid, cancelHandoffs, clearShowTimer])

  return {
    detailsReq,
    openTaskDetails,
    detailsMounted,
    detailsShown,
    closeTaskDetails,
    registerDetailsClose,
    forgetDetails,
    afterModalClose,
    cancelHandoffs,
  }
}
