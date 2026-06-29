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
import { useTheme, ThemeColors } from '../../app/theme'
import { useSheetDismiss, sheetGrabZone } from '../../ui/useSheetDismiss'
import {
  PRODUCT_IDS,
  TIER_LIMITS,
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
const PRIVACY_URL = 'https://websurfer2015.github.io/my-todo/PRIVACY.html'
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
      `${TIER_LIMITS.free.mochiDaily} Mochi AI requests / day, then pay as you go`,
    ],
  },
  {
    tier: 'premium',
    name: 'Premium',
    bullets: [
      'Everything in Free',
      `${TIER_LIMITS.premium.mochiMonthly} Mochi AI requests / month, then pay as you go`,
      'Premium features — theme-based UI, auto-defer',
    ],
    product: { monthly: PRODUCT_IDS.premiumMonthly, annual: PRODUCT_IDS.premiumAnnual },
    fallbackPrice: { monthly: '$2.99/mo', annual: '$19.99/yr' },
  },
  {
    tier: 'max',
    name: 'Max',
    bullets: [
      'Everything in Premium',
      `${TIER_LIMITS.max.mochiMonthly} Mochi requests / month, then pay as you go`,
      'Planning features — weekly planner, event planner with to-do generation',
    ],
    product: { monthly: PRODUCT_IDS.maxMonthly, annual: PRODUCT_IDS.maxAnnual },
    fallbackPrice: { monthly: '$7.99/mo', annual: '$59.99/yr' },
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
  const [billing, setBilling] = useState<Billing>('monthly')
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

  // Which plan's CTA gets the prominent filled style. Lead with Premium when
  // it's a purchasable upgrade (the "Popular" choice for new subscribers);
  // otherwise lead with the lowest available upgrade — e.g. Max for an existing
  // Premium subscriber — so the only actionable CTA isn't styled as
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
                      {b === 'annual' ? 'Annual · save ~44%' : 'Monthly'}
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
                const price =
                  plan.tier === 'free'
                    ? 'Free'
                    : pkg?.product.priceString ?? plan.fallbackPrice?.[billing] ?? ''
                // Buyable only when this product is a strict UPGRADE from the
                // current plan (tier + billing), with a package available.
                // Premium-monthly → premium-annual / max-monthly / max-annual;
                // premium-annual → max-monthly / max-annual; etc. Downgrades
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
                const trialText =
                  intro && intro.price === 0 && eligibleForTrial
                    ? trialUnit === 'WEEK'
                      ? `Start ${intro.periodNumberOfUnits * 7}-day free trial`
                      : `Start ${intro.periodNumberOfUnits}-${trialUnit.toLowerCase()} free trial`
                    : null
                // Per-product highlight badge: Monthly Premium is the "Popular"
                // pick, Yearly Max is the "Best Value". (Billing-aware, so the
                // badge follows the toggle.)
                const badgeLabel =
                  plan.tier === 'premium' && billing === 'monthly'
                    ? 'Popular'
                    : plan.tier === 'max' && billing === 'annual'
                      ? 'Best Value'
                      : null
                // The filled CTA follows the lead upgrade — so the user's only
                // actionable button is always the prominent one (e.g. Max for an
                // existing Premium subscriber), never a subordinate outline.
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
                cancelled — manage in your App Store account. Pay-as-you-go requests
                are available when your Mochi allowance runs out.
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
      paddingTop: 16,
      paddingHorizontal: 16,
      paddingBottom: Platform.OS === 'ios' ? 32 : 16,
      maxHeight: '92%',
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.separator,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 28,
      marginBottom: 8,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { fontSize: 20, fontWeight: '700', color: c.label },
    cancelBtn: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center' },
    closeText: { fontSize: 15, color: c.label2, fontWeight: '500' },
    body: { flexGrow: 0, flexShrink: 1 },
    bodyContent: { paddingVertical: 8, gap: 12 },
    reason: { fontSize: 14, color: c.label2, textAlign: 'center', marginBottom: 4 },
    toggle: {
      flexDirection: 'row',
      gap: 6,
      backgroundColor: c.bg,
      borderRadius: 999,
      padding: 4,
    },
    toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
    toggleBtnActive: { backgroundColor: c.primary },
    toggleText: { fontSize: 13, fontWeight: '600', color: c.label2 },
    toggleTextActive: { color: c.primaryOn },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: 12,
      gap: 8,
    },
    cardCurrent: { borderColor: c.primary, borderWidth: 1.5 },
    cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    planNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    planName: { fontSize: 18, fontWeight: '700', color: c.label },
    currentBadge: {
      backgroundColor: c.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    currentBadgeText: { fontSize: 11, fontWeight: '700', color: c.primary },
    popularBadge: {
      backgroundColor: c.primary,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    popularBadgeText: { fontSize: 11, fontWeight: '700', color: c.primaryOn },
    ctaStatus: {
      marginTop: 4,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
      color: c.label3,
    },
    price: { fontSize: 15, fontWeight: '700', color: c.primary },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    bulletText: { flex: 1, fontSize: 14, color: c.label, lineHeight: 20 },
    cta: {
      marginTop: 4,
      height: 46,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: { color: c.primaryOn, fontSize: 15, fontWeight: '700' },
    ctaOutline: {
      marginTop: 4,
      height: 46,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaOutlineText: { color: c.primary, fontSize: 15, fontWeight: '700' },
    restore: { alignSelf: 'center', paddingVertical: 8, minHeight: 32, justifyContent: 'center' },
    restoreText: { fontSize: 13, fontWeight: '600', color: c.primary },
    manage: { alignSelf: 'center', paddingVertical: 6 },
    manageText: { fontSize: 12, fontWeight: '500', color: c.label3 },
    loadingBlock: { alignItems: 'center', gap: 14, paddingVertical: 48 },
    loadingText: { fontSize: 14, color: c.label2, textAlign: 'center', lineHeight: 20 },
    noticeInfo: {
      fontSize: 13,
      color: c.label2,
      textAlign: 'center',
      marginBottom: 4,
      fontWeight: '500',
    },
    noticeError: {
      fontSize: 13,
      color: c.red,
      textAlign: 'center',
      marginBottom: 4,
      fontWeight: '500',
    },
    fine: { fontSize: 12, color: c.label3, textAlign: 'center', lineHeight: 17 },
    legalRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    legalLink: { fontSize: 12, color: c.label2, fontWeight: '600', textDecorationLine: 'underline' },
    legalDot: { fontSize: 12, color: c.label3 },
  })
}
