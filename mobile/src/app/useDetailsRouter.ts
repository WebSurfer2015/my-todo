/**
 * Opening the ONE to-do details sheet from anywhere — a row tap, or a
 * reminder tap that can arrive while ANY sheet or modal is up — plus the
 * sheet → sheet handoff timers SheetProvider uses for every Modal switch.
 *
 * iOS can't stack <Modal>s, and force-closing what's open would silently
 * drop the user's work (a Compose draft, a half-picked date). So when
 * something is presented, the request is PARKED; once nothing is presented
 * (no provider sheet, no details, no counted Modal — for a dismiss grace), a
 * calm `Reminder: “<title>” · Open` snackbar is offered. It's shown at the
 * app root, which sits UNDER any presented Modal — showing it earlier meant
 * it expired unseen. A newer request replaces the parked one.
 *
 * When just details is up on ANOTHER to-do, it closes through its own save
 * path (commits typed text / series edits) and the new one opens once it has
 * closed. Everything is reset when the signed-in account changes.
 *
 * Plain hook (no JSX) so the routing rules are unit-testable with renderHook.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { detailsNotifyMessage, planDetailsOpen, type DetailsReq } from './detailsOpenPlan'
import { isAnyModalPresented } from './modalPresence'
import { MODAL_DISMISS_GRACE_MS, MODAL_HANDOFF_MS } from './modalTiming'

/** How often a parked request checks whether the screen is clear. */
export const PARK_POLL_MS = 100
/** How long the reminder offer stays up once it's visible. */
export const DETAILS_OFFER_MS = 8000
/** Snackbar "Open" retries while something is still dismissing. */
const MAX_OPEN_RETRIES = 6

export interface DetailsRouterDeps {
  /** A sheet SheetProvider owns (Compose, Mochi, Profile, …) is open. */
  anySheetOpen: boolean
  /** The signed-in account; a change resets everything. */
  accountUid: string | null
  /** Live lookup of a to-do's title (undefined once it's gone). */
  findTodo: (id: string) => { text: string } | undefined
  showSnackbar: (opts: {
    message: string
    actionLabel: string
    onAction: () => void
    durationMs: number
    queue: boolean
  }) => void
}

export interface DetailsRouter {
  /** The to-do the details sheet shows (null = closed). */
  detailsReq: DetailsReq | null
  openTaskDetails: (todoId: string, subtaskId?: string | null) => void
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

  const detailsCloseRef = useRef<(() => void) | null>(null)
  const registerDetailsClose = useCallback((fn: (() => void) | null) => {
    detailsCloseRef.current = fn
  }, [])
  const pendingRef = useRef<DetailsReq | null>(null)
  const openDetailsRef = useRef<(req: DetailsReq, retry?: number) => void>(() => {})

  // ---- Parked request → offered once the screen is clear ----
  const parkedRef = useRef<DetailsReq | null>(null)
  const [parkSeq, setParkSeq] = useState(0)
  const park = useCallback((req: DetailsReq) => {
    parkedRef.current = req
    setParkSeq((n) => n + 1)
  }, [])
  useEffect(() => {
    if (!parkedRef.current) return
    let clearFor = 0
    const id = setInterval(() => {
      const req = parkedRef.current
      if (!req) {
        clearInterval(id)
        return
      }
      const { anySheetOpen, detailsId } = openStateRef.current
      const clear = !anySheetOpen && detailsId === null && !isAnyModalPresented()
      clearFor = clear ? clearFor + PARK_POLL_MS : 0
      if (clearFor < MODAL_DISMISS_GRACE_MS) return
      clearInterval(id)
      parkedRef.current = null
      const td = depsRef.current.findTodo(req.id)
      if (!td) return
      depsRef.current.showSnackbar({
        message: detailsNotifyMessage(td.text),
        actionLabel: 'Open',
        onAction: () => openDetailsRef.current(req, 0),
        durationMs: DETAILS_OFFER_MS,
        // Never clobber an Undo that's showing — wait for it.
        queue: true,
      })
    }, PARK_POLL_MS)
    return () => clearInterval(id)
  }, [parkSeq])

  // `retry` = the snackbar's Open: if something is still dismissing, try
  // again a few handoffs later instead of parking again right away.
  const openDetails = useCallback(
    (req: DetailsReq, retry?: number) => {
      const plan = planDetailsOpen({
        ...openStateRef.current,
        anyModalOpen: isAnyModalPresented(),
        todoId: req.id,
      })
      if (plan !== 'notify' && parkedRef.current?.id === req.id) parkedRef.current = null
      switch (plan) {
        case 'already-open':
          return
        case 'notify':
          if (retry !== undefined && retry < MAX_OPEN_RETRIES) {
            afterModalClose(() => openDetailsRef.current(req, retry + 1))
          } else park(req)
          return
        case 'swap':
          pendingRef.current = req
          if (detailsCloseRef.current) detailsCloseRef.current()
          else setDetailsReq(null)
          // The close path ran synchronously unless details asked a series
          // confirm first (an Alert). Don't leave the request queued — a
          // Cancel there keeps details open, and a later close would pop
          // this one open out of nowhere. Park it instead.
          if (pendingRef.current === req) {
            pendingRef.current = null
            park(req)
          }
          return
        case 'now':
          setDetailsReq(req)
      }
    },
    [afterModalClose, park],
  )
  useEffect(() => {
    openDetailsRef.current = openDetails
  }, [openDetails])

  const openTaskDetails = useCallback(
    (todoId: string, subtaskId: string | null = null) => openDetails({ id: todoId, subtaskId }),
    [openDetails],
  )
  // A queued swap goes back through the plan: something may have opened
  // during the handoff.
  const closeTaskDetails = useCallback(() => {
    setDetailsReq(null)
    const next = pendingRef.current
    pendingRef.current = null
    if (next) afterModalClose(() => openDetailsRef.current(next))
  }, [afterModalClose])
  const forgetDetails = useCallback(() => {
    pendingRef.current = null
    setDetailsReq(null)
  }, [])

  // Per account: nothing opened, queued or parked survives an account change.
  useEffect(() => {
    setDetailsReq(null)
    pendingRef.current = null
    parkedRef.current = null
    cancelHandoffs()
  }, [deps.accountUid, cancelHandoffs])

  return {
    detailsReq,
    openTaskDetails,
    closeTaskDetails,
    registerDetailsClose,
    forgetDetails,
    afterModalClose,
    cancelHandoffs,
  }
}
