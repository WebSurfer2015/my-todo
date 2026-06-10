import React, { useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
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
import {
  PRODUCT_IDS,
  TIER_LIMITS,
  tierAtLeast,
  type Tier,
} from '../../core-bindings/entitlements'

type Billing = 'annual' | 'monthly'

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
      'No daily limit',
      `${TIER_LIMITS.premium.mochiMonthly} Mochi AI requests / month, then pay as you go`,
      'Premium features — theme-based UI',
    ],
    product: { monthly: PRODUCT_IDS.premiumMonthly, annual: PRODUCT_IDS.premiumAnnual },
    fallbackPrice: { monthly: '$2.99/mo', annual: '$19.99/yr' },
  },
  {
    tier: 'max',
    name: 'Max',
    bullets: [
      'Everything in Premium',
      `${TIER_LIMITS.max.mochiMonthly} Mochi requests / month`,
      'Planning features — weekly planner, auto-defer, event planner with to-do generation',
    ],
    product: { monthly: PRODUCT_IDS.maxMonthly, annual: PRODUCT_IDS.maxAnnual },
    fallbackPrice: { monthly: '$7.99/mo', annual: '$59.99/yr' },
  },
]

interface Props {
  visible: boolean
  reason?: string
  offering: PurchasesOffering | null
  currentTier: Tier
  onPurchase: (pkg: PurchasesPackage) => Promise<boolean>
  onRestore: () => void
  onClose: () => void
}

export default function PaywallSheet({
  visible,
  reason,
  offering,
  currentTier,
  onPurchase,
  onRestore,
  onClose,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [billing, setBilling] = useState<Billing>('annual')
  const [busy, setBusy] = useState(false)

  const pkgFor = (productId: string): PurchasesPackage | null =>
    offering?.availablePackages.find((p) => p.product.identifier === productId) ?? null

  async function buy(productId: string) {
    const pkg = pkgFor(productId)
    if (!pkg || busy) return
    setBusy(true)
    const ok = await onPurchase(pkg)
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
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
                const isCurrent = currentTier === plan.tier
                const owned = tierAtLeast(currentTier, plan.tier) // current or below
                const productId = plan.product?.[billing]
                const pkg = productId ? pkgFor(productId) : null
                const price =
                  plan.tier === 'free'
                    ? 'Free'
                    : pkg?.product.priceString ?? plan.fallbackPrice?.[billing] ?? ''
                // A button only for a plan the user can actually buy (above
                // their current tier, with a package available). Otherwise a
                // quiet status.
                const purchasable = !owned && plan.tier !== 'free' && !!pkg
                const status = isCurrent
                  ? 'Current plan'
                  : owned
                    ? 'Included'
                    : plan.tier === 'free'
                      ? 'Free'
                      : 'Coming soon'
                return (
                  <View
                    key={plan.tier}
                    style={[styles.card, isCurrent && styles.cardCurrent]}
                  >
                    <View style={styles.cardHead}>
                      <View style={styles.planNameRow}>
                        <Text style={styles.planName}>{plan.name}</Text>
                        {isCurrent && (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>Current</Text>
                          </View>
                        )}
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
                        style={styles.cta}
                        disabled={busy}
                        onPress={() => productId && buy(productId)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.ctaText}>
                          {billing === 'annual'
                            ? 'Start 7-day free trial'
                            : `Subscribe · ${price}`}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.ctaStatus}>{status}</Text>
                    )}
                  </View>
                )
              })}

              <TouchableOpacity onPress={onRestore} style={styles.restore} hitSlop={8}>
                <Text style={styles.restoreText}>Restore purchases</Text>
              </TouchableOpacity>
              <Text style={styles.fine}>
                Subscriptions renew automatically until cancelled. Manage in your App
                Store account. Pay-as-you-go requests are available when your Mochi allowance runs out.
              </Text>
            </ScrollView>
          </View>
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
      padding: 14,
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
    restore: { alignSelf: 'center', paddingVertical: 8 },
    restoreText: { fontSize: 13, fontWeight: '600', color: c.primary },
    fine: { fontSize: 11, color: c.label3, textAlign: 'center', lineHeight: 16 },
  })
}
