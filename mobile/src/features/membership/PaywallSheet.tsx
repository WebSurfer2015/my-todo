import React, { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Check, Sparkles } from 'lucide-react-native'
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases'
import { useLang } from '../../app/LangContext'
import { useTheme, ThemeColors, SPACING, RADIUS, TYPE } from '../../app/theme'
import { useSheetDismiss, sheetGrabZone } from '../../ui/useSheetDismiss'
import { PRIVACY_URL } from '../../app/links'
import {
  PRODUCT_IDS,
  tierAtLeast,
  isUpgrade,
  type Tier,
} from '../../core-bindings/entitlements'

type Billing = 'annual' | 'monthly'

// Apple/Google require functional Terms (EULA) + Privacy links in the purchase
// flow for auto-renewable subscriptions (App Store 3.1.2). Privacy is our own
// published policy; Terms falls back to Apple's standard EULA since we don't
// ship a custom one — swap in a custom URL here if that changes.
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
const openLink = (url: string) => Linking.openURL(url).catch(() => {})

interface PlanView {
  tier: Tier
  name: string
  bullets: string[]
  /** Absent for Free (no purchase). */
  product?: Record<Billing, string>
  /** Fallback price strings shown before RevenueCat is configured. */
  fallbackPrice?: Record<Billing, string>
}

const PLANS: PlanView[] = [
  {
    tier: 'free',
    name: 'Free',
    bullets: [
      'Unlimited to-dos & groceries',
      'Reminders, recurring & before-due',
      'Sage & Sky themes',
      'Mochi AI help, every day',
    ],
  },
  {
    // Two real Premium differentiators: a larger Mochi AI allowance (enforced
    // server-side once MOCHI_TIER_ENFORCEMENT is switched on at the v2.0.0
    // release — roadmap 5.6) and the full theme set (Free is limited to Sage +
    // Sky; gated client-side via FREE_THEMES). De-metered copy: NO request
    // counts on the paywall (docs/MOCHI-MONETIZATION-MODEL.md — the ceiling is
    // invisible), and not "unlimited" either — Premium's cap is a real 250/mo.
    tier: 'premium',
    name: 'Premium',
    bullets: [
      'Everything in Free',
      'More Mochi AI help for busy weeks',
      'All 6 color themes',
    ],
    product: { monthly: PRODUCT_IDS.premiumMonthly, annual: PRODUCT_IDS.premiumAnnual },
    fallbackPrice: { monthly: '$4.99/month', annual: '$29.99/year' },
  },
]

interface Props {
  visible: boolean
  reason?: string
  offering: PurchasesOffering | null
  offeringLoading: boolean
  purchasesEnabled: boolean
  currentTier: Tier
  /** Current active subscription product id (tier + billing), or null on Free. */
  currentProductId: string | null
  /** productId → eligible for its free trial / intro offer (false once used). */
  trialEligible: Record<string, boolean>
  onPurchase: (pkg: PurchasesPackage) => Promise<'purchased' | 'cancelled' | 'failed'>
  onRestore: () => Promise<'found' | 'none' | 'failed'>
  onRetry: () => void
  /** Open the OS subscription-management screen (downgrade / cancel to Free). */
  onManage: () => void
  onClose: () => void
}

export default function PaywallSheet({
  visible,
  reason,
  offering,
  offeringLoading,
  purchasesEnabled,
  currentTier,
  currentProductId,
  trialEligible,
  onPurchase,
  onRestore,
  onRetry,
  onManage,
  onClose,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [billing, setBilling] = useState<Billing>('annual')
  // Track the product mid-purchase so its own CTA shows the spinner (and all
  // CTAs disable) — the StoreKit call can take a couple seconds and a silent
  // disabled button reads as "stuck" at the highest-stakes tap in the app.
  const [pendingId, setPendingId] = useState<string | null>(null)
  const busy = pendingId !== null
  // Inline feedback for purchase/restore. A snackbar would render UNDER this
  // Modal, so result + error copy must live inside the sheet.
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [restoring, setRestoring] = useState(false)
  // Plans can't be shown when the offering hasn't loaded — distinguish the
  // transient load from a real "products not configured" so a network hiccup
  // doesn't mislabel shipping products "Coming soon".
  const offeringUnavailable = purchasesEnabled && !offering
  const { translateY, panHandlers } = useSheetDismiss(visible, onClose)

  const pkgFor = (productId: string): PurchasesPackage | null =>
    offering?.availablePackages.find((p) => p.product.identifier === productId) ?? null

  // Annual savings from the LIVE store prices (any currency) — a hardcoded
  // percentage went stale when the prices changed. Hidden without both.
  const annualPrice = pkgFor(PRODUCT_IDS.premiumAnnual)?.product.price
  const monthlyPrice = pkgFor(PRODUCT_IDS.premiumMonthly)?.product.price
  const annualSavingsPct =
    annualPrice && monthlyPrice ? Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100) : null

  // Which plan's CTA gets the prominent filled style. Lead with Premium when
  // it's a purchasable upgrade (the "Popular" choice for new subscribers);
  // otherwise lead with the lowest available upgrade (e.g. annual for an
  // existing monthly subscriber) — so the only actionable CTA isn't styled as
  // subordinate.
  const purchasableTiers = PLANS.filter((p) => {
    const pid = p.product?.[billing]
    return !!pid && isUpgrade(currentProductId, pid) && !!pkgFor(pid)
  }).map((p) => p.tier)
  const leadTier: Tier | null = purchasableTiers.includes('premium')
    ? 'premium'
    : purchasableTiers[0] ?? null

  async function buy(productId: string) {
    const pkg = pkgFor(productId)
    if (!pkg || busy) return
    setNotice(null)
    setPendingId(productId)
    const res = await onPurchase(pkg)
    setPendingId(null)
    if (res === 'purchased') onClose()
    else if (res === 'failed')
      setNotice({ kind: 'error', text: "Couldn't complete the purchase. Please try again." })
    // 'cancelled' → silent, the user backed out on purpose.
  }


  async function restore() {
    if (restoring) return
    setNotice(null)
    setRestoring(true)
    const res = await onRestore()
    setRestoring(false)
    setNotice(
      res === 'found'
        ? { kind: 'info', text: 'Purchases restored.' }
        : res === 'none'
          ? { kind: 'info', text: 'No purchases to restore.' }
          : { kind: 'error', text: "Couldn't reach the App Store. Please try again." },
    )
  }

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={sheetGrabZone} {...panHandlers}>
              <View style={styles.handle} />
            </View>
            <View style={styles.headerRow}>
              <View style={styles.titleRow}>
                <Sparkles size={16} color={theme.primary} strokeWidth={2.2} />
                <Text style={styles.title}>Sagely Membership</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.cancelBtn}>
                <Text style={styles.closeText}>{t.cancel}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {reason ? <Text style={styles.reason}>{reason}</Text> : null}

              {offeringUnavailable ? (
                <View style={styles.loadingBlock}>
                  {offeringLoading ? (
                    <>
                      <ActivityIndicator color={theme.primary} />
                      <Text style={styles.loadingText}>Loading plans…</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.loadingText}>
                        Couldn't load plans — check your connection.
                      </Text>
                      <TouchableOpacity
                        style={styles.ctaOutline}
                        onPress={onRetry}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                      >
                        <Text style={styles.ctaOutlineText}>Retry</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ) : (
              <>
              {/* Billing toggle */}
              <View style={styles.toggle}>
                {(['annual', 'monthly'] as Billing[]).map((b) => (
                  <TouchableOpacity
                    key={b}
                    style={[styles.toggleBtn, billing === b && styles.toggleBtnActive]}
                    onPress={() => setBilling(b)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.toggleText, billing === b && styles.toggleTextActive]}>
                      {b === 'annual'
                        ? annualSavingsPct && annualSavingsPct > 0
                          ? `Annual · save ${annualSavingsPct}%`
                          : 'Annual'
                        : 'Monthly'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {PLANS.map((plan) => {
                const owned = tierAtLeast(currentTier, plan.tier) // current or below
                const productId = plan.product?.[billing]
                const pkg = productId ? pkgFor(productId) : null
                // The card highlights the user's EXACT current product (this
                // tier at the selected billing), not just the tier — so toggling
                // billing correctly moves the "Current plan" marker. The Free
                // card is "current" whenever the user has no active subscription.
                const isCurrent =
                  plan.tier === 'free'
                    ? !currentProductId
                    : !!productId && productId === currentProductId
                // App Review 3.1.2: always show the billing period with the price.
                const period = billing === 'annual' ? 'year' : 'month'
                const price =
                  plan.tier === 'free'
                    ? 'Free'
                    : pkg
                      ? `${pkg.product.priceString}/${period}`
                      : plan.fallbackPrice?.[billing] ?? ''
                // Buyable only when this product is a strict UPGRADE from the
                // current plan (tier + billing), with a package available.
                // Premium-monthly → premium-annual. Downgrades
                // and same-product re-buys are never offered (cancel to Free is
                // the Manage-subscription link below).
                const purchasable = !!productId && isUpgrade(currentProductId, productId) && !!pkg
                // Trial CTA only for a FREE user, on a product that carries a
                // free intro offer (price 0) AND that RevenueCat still reports
                // as trial-eligible. The !currentProductId guard is the decisive
                // one: anyone who already has a subscription (incl. one running
                // on a trial) only ever sees "Upgrade", never another free
                // trial — even if the products sit in different App Store
                // subscription groups (where Apple would otherwise grant a
                // second per-group trial). RC eligibility additionally hides it
                // for a lapsed free user who already used the group's intro.
                const intro = pkg?.product.introPrice
                const eligibleForTrial =
                  !currentProductId && !!productId && trialEligible[productId] === true
                // Apple has no "7 day" trial duration — a 7-day trial is set up
                // as "1 week". Normalise weeks to days so the CTA reads
                // "7-day free trial" (how the trial is described everywhere
                // else) rather than "1-week free trial".
                const trialUnit = String(intro?.periodUnit ?? '').toUpperCase()
                const trialLength =
                  trialUnit === 'WEEK'
                    ? `${(intro?.periodNumberOfUnits ?? 0) * 7}-day`
                    : `${intro?.periodNumberOfUnits ?? 0}-${trialUnit.toLowerCase()}`
                const trialText =
                  intro && intro.price === 0 && eligibleForTrial ? `Start ${trialLength} free trial` : null
                // App Review 3.1.2: say what the trial turns into.
                const trialUnits = intro?.periodNumberOfUnits ?? 0
                const trialSpan =
                  trialUnit === 'WEEK'
                    ? `${trialUnits * 7} days`
                    : `${trialUnits} ${trialUnit.toLowerCase()}${trialUnits === 1 ? '' : 's'}`
                const trialTerms = trialText ? `${trialSpan} free, then ${price}. Cancel anytime.` : null
                // Premium is the only paid plan (Free + Premium), badged "Popular".
                const badgeLabel = plan.tier === 'premium' ? 'Popular' : null
                // The filled CTA follows the lead upgrade — so the user's only
                // actionable button is always the prominent one (e.g. annual for
                // an existing monthly subscriber), never a subordinate outline.
                const filledCta = plan.tier === leadTier
                const status = isCurrent
                  ? 'Current plan'
                  : plan.tier === 'free'
                    ? 'Free'
                    : owned
                      ? 'Included'
                      : 'Coming soon'
                return (
                  <View
                    key={plan.tier}
                    style={[styles.card, isCurrent && styles.cardCurrent]}
                  >
                    <View style={styles.cardHead}>
                      <View style={styles.planNameRow}>
                        <Text style={styles.planName}>{plan.name}</Text>
                        {isCurrent ? (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>Current</Text>
                          </View>
                        ) : badgeLabel ? (
                          <View style={styles.popularBadge}>
                            <Text style={styles.popularBadgeText}>{badgeLabel}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.price}>{price}</Text>
                    </View>
                    {plan.bullets.map((b) => (
                      <View key={b} style={styles.bulletRow}>
                        <Check size={15} color={theme.primary} strokeWidth={2.6} />
                        <Text style={styles.bulletText}>{b}</Text>
                      </View>
                    ))}
                    {purchasable ? (
                      <TouchableOpacity
                        style={filledCta ? styles.cta : styles.ctaOutline}
                        disabled={busy}
                        onPress={() => productId && buy(productId)}
                        activeOpacity={0.85}
                      >
                        {pendingId === productId ? (
                          <ActivityIndicator color={filledCta ? theme.primaryOn : theme.primary} />
                        ) : (
                          <Text style={filledCta ? styles.ctaText : styles.ctaOutlineText}>
                            {trialText ?? `${currentProductId ? 'Upgrade' : 'Subscribe'} · ${price}`}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                    {purchasable ? (
                      trialTerms ? <Text style={styles.ctaStatus}>{trialTerms}</Text> : null
                    ) : (
                      <Text style={styles.ctaStatus}>{status}</Text>
                    )}
                  </View>
                )
              })}
              </>
              )}

              {notice && (
                <Text style={notice.kind === 'error' ? styles.noticeError : styles.noticeInfo}>
                  {notice.text}
                </Text>
              )}

              <TouchableOpacity
                onPress={restore}
                disabled={restoring}
                style={styles.restore}
                hitSlop={10}
                accessibilityRole="button"
              >
                {restoring ? (
                  <ActivityIndicator size="small" color={theme.label2} />
                ) : (
                  <Text style={styles.restoreText}>Restore purchases</Text>
                )}
              </TouchableOpacity>
              {/* Downgrade / cancel to Free lives behind the OS subscription
                  manager — the only sanctioned path — kept as a quiet link
                  (not a button) so it's reachable but not a tap-magnet. */}
              {currentProductId && (
                <TouchableOpacity
                  onPress={onManage}
                  style={styles.manage}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Manage or cancel subscription"
                >
                  <Text style={styles.manageText}>Manage or cancel subscription</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.fine}>
                A free trial, where offered, converts to a paid subscription unless
                cancelled before it ends. Subscriptions renew automatically until
                cancelled — manage in your App Store account.
              </Text>
              <View style={styles.legalRow}>
                <TouchableOpacity onPress={() => openLink(TERMS_URL)} hitSlop={10}>
                  <Text style={styles.legalLink}>Terms of Use</Text>
                </TouchableOpacity>
                <Text style={styles.legalDot}>·</Text>
                <TouchableOpacity onPress={() => openLink(PRIVACY_URL)} hitSlop={10}>
                  <Text style={styles.legalLink}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      paddingBottom: Platform.OS === 'ios' ? SPACING.xxl : SPACING.lg,
      maxHeight: '92%',
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.separator,
      marginBottom: SPACING.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 28,
      marginBottom: SPACING.sm,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    title: { fontSize: TYPE.title, fontWeight: '700', color: c.label },
    cancelBtn: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center' },
    closeText: { fontSize: TYPE.body, color: c.label2, fontWeight: '500' },
    body: { flexGrow: 0, flexShrink: 1 },
    bodyContent: { paddingVertical: SPACING.sm, gap: SPACING.md },
    reason: { fontSize: TYPE.body, color: c.label2, textAlign: 'center', marginBottom: SPACING.xs },
    toggle: {
      flexDirection: 'row',
      gap: SPACING.sm,
      backgroundColor: c.bg,
      borderRadius: RADIUS.pill,
      padding: SPACING.xs,
    },
    toggleBtn: { flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill, alignItems: 'center' },
    toggleBtnActive: { backgroundColor: c.primary },
    toggleText: { fontSize: TYPE.footnote, fontWeight: '600', color: c.label2 },
    toggleTextActive: { color: c.primaryOn },
    card: {
      backgroundColor: c.card,
      borderRadius: RADIUS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: SPACING.md,
      gap: SPACING.sm,
    },
    cardCurrent: { borderColor: c.primary, borderWidth: 1.5 },
    cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    planNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    planName: { fontSize: TYPE.title, fontWeight: '700', color: c.label },
    currentBadge: {
      backgroundColor: c.primarySoft,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
    },
    currentBadgeText: { fontSize: TYPE.caption, fontWeight: '700', color: c.primary },
    popularBadge: {
      backgroundColor: c.primary,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
    },
    popularBadgeText: { fontSize: TYPE.caption, fontWeight: '700', color: c.primaryOn },
    ctaStatus: {
      marginTop: SPACING.xs,
      textAlign: 'center',
      fontSize: TYPE.footnote,
      fontWeight: '600',
      color: c.label3,
    },
    price: { fontSize: TYPE.body, fontWeight: '700', color: c.primary },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
    bulletText: { flex: 1, fontSize: TYPE.body, color: c.label, lineHeight: 20 },
    cta: {
      marginTop: SPACING.xs,
      height: 46,
      borderRadius: RADIUS.control,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: { color: c.primaryOn, fontSize: TYPE.body, fontWeight: '700' },
    ctaOutline: {
      marginTop: SPACING.xs,
      height: 46,
      borderRadius: RADIUS.control,
      borderWidth: 1.5,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaOutlineText: { color: c.primary, fontSize: TYPE.body, fontWeight: '700' },
    restore: { alignSelf: 'center', paddingVertical: SPACING.sm, minHeight: 32, justifyContent: 'center' },
    restoreText: { fontSize: TYPE.footnote, fontWeight: '600', color: c.primary },
    manage: { alignSelf: 'center', paddingVertical: SPACING.sm },
    manageText: { fontSize: TYPE.caption, fontWeight: '500', color: c.label3 },
    loadingBlock: { alignItems: 'center', gap: SPACING.lg, paddingVertical: 48 },
    loadingText: { fontSize: TYPE.body, color: c.label2, textAlign: 'center', lineHeight: 20 },
    noticeInfo: {
      fontSize: TYPE.footnote,
      color: c.label2,
      textAlign: 'center',
      marginBottom: SPACING.xs,
      fontWeight: '500',
    },
    noticeError: {
      fontSize: TYPE.footnote,
      color: c.red,
      textAlign: 'center',
      marginBottom: SPACING.xs,
      fontWeight: '500',
    },
    fine: { fontSize: TYPE.caption, color: c.label3, textAlign: 'center', lineHeight: 17 },
    legalRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
    legalLink: { fontSize: TYPE.caption, color: c.label2, fontWeight: '600', textDecorationLine: 'underline' },
    legalDot: { fontSize: TYPE.caption, color: c.label3 },
  })
}
