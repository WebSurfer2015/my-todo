import { StyleSheet } from 'react-native'
import { type ThemeColors, SPACING, RADIUS, TYPE } from '../../../app/theme'

export function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    /* Header: ‹ Back   Remind me   Clear all */
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
    },
    headerSide: {
      minWidth: 72,
    },
    headerSideRight: {
      minWidth: 72,
      alignItems: 'flex-end',
    },
    backText: {
      fontSize: TYPE.body,
      fontWeight: '500',
      color: c.primary,
    },
    titleText: {
      fontSize: TYPE.body,
      fontWeight: '700',
      color: c.label,
    },
    clearAllText: {
      fontSize: TYPE.body,
      fontWeight: '500',
      color: c.primary,
    },
    clearAllTextDisabled: {
      color: c.label3,
    },

    /* Body container */
    body: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.xl,
      gap: SPACING.xl,
    },

    /* "Your reminders" pill list */
    listHeader: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      color: c.label3,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: SPACING.md,
    },
    listEmpty: {
      backgroundColor: c.surfaceAlt,
      borderRadius: RADIUS.card,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    listEmptyText: {
      fontSize: TYPE.body,
      color: c.label3,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    pillsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingLeft: SPACING.lg,
      paddingRight: SPACING.sm,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: c.primarySoft,
    },
    pillText: {
      fontSize: TYPE.footnote,
      fontWeight: '600',
      color: c.primary,
    },
    pillRemoveBtn: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillRemoveX: {
      color: c.primaryOn,
      fontSize: TYPE.footnote,
      fontWeight: '800',
      lineHeight: 13,
    },

    /* Section block — header + sub-helper + chips */
    section: {
      gap: SPACING.md,
    },
    fixedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      flexWrap: 'wrap',
    },
    fixedAddBtn: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADIUS.pill,
      backgroundColor: c.primary,
    },
    fixedAddBtnText: { color: c.primaryOn, fontSize: TYPE.body, fontWeight: '700' },
    fixedAndroidField: {
      flex: 1,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADIUS.control,
      backgroundColor: c.surface,
    },
    fixedAndroidFieldText: { color: c.label, fontSize: TYPE.body, fontWeight: '600' },
    sectionHeader: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      color: c.label3,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    sectionSubhelper: {
      fontSize: TYPE.footnote,
      color: c.label2,
      lineHeight: 18,
      marginTop: -8,
    },
    notice: {
      backgroundColor: c.surfaceAlt,
      borderRadius: RADIUS.card,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    noticeText: {
      fontSize: TYPE.body,
      color: c.label2,
      fontStyle: 'italic',
      textAlign: 'center',
    },

    /* Chip grid — wraps to multiple lines so the user doesn't
       have to horizontally scroll to find an option. */
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    chip: {
      minWidth: 56,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: {
      backgroundColor: c.primary,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 3,
      elevation: 2,
    },
    chipDisabled: {
      backgroundColor: c.surfaceAlt,
      opacity: 0.6,
    },
    chipText: {
      fontSize: TYPE.body,
      fontWeight: '600',
      color: c.primary,
    },
    chipTextActive: {
      color: c.primaryOn,
    },
    chipTextDisabled: {
      color: c.label3,
    },

    /* Sticky bottom Done button */
    footer: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: 20,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.gray3,
    },
    doneBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneBtnText: {
      fontSize: TYPE.bodyLg,
      fontWeight: '700',
      color: c.primaryOn,
    },
  })
}
