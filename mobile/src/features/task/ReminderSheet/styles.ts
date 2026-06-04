import { StyleSheet } from 'react-native'
import type { ThemeColors } from '../../../app/theme'

export type ReminderSheetStyles = ReturnType<typeof makeStyles>

export function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    /* Header: ‹ Back   Remind me   Clear all */
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
    },
    headerSide: {
      minWidth: 72,
    },
    headerSideRight: {
      minWidth: 72,
      alignItems: 'flex-end',
    },
    backText: {
      fontSize: 15,
      fontWeight: '500',
      color: c.primary,
    },
    titleText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.label,
    },
    clearAllText: {
      fontSize: 14,
      fontWeight: '500',
      color: c.primary,
    },
    clearAllTextDisabled: {
      color: c.label3,
    },

    /* Body container */
    body: {
      paddingHorizontal: 16,
      paddingBottom: 24,
      gap: 24,
    },

    /* "Your reminders" pill list */
    listHeader: {
      fontSize: 11,
      fontWeight: '700',
      color: c.label3,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    listEmpty: {
      backgroundColor: c.surfaceAlt,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    listEmptyText: {
      fontSize: 14,
      color: c.label3,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    pillsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 14,
      paddingRight: 6,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    pillText: {
      fontSize: 13,
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
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 13,
    },

    /* Section block — header + sub-helper + chips */
    section: {
      gap: 12,
    },
    sectionHeader: {
      fontSize: 11,
      fontWeight: '700',
      color: c.label3,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    sectionSubhelper: {
      fontSize: 13,
      color: c.label2,
      lineHeight: 18,
      marginTop: -8,
    },
    notice: {
      backgroundColor: c.surfaceAlt,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    noticeText: {
      fontSize: 14,
      color: c.label2,
      fontStyle: 'italic',
      textAlign: 'center',
    },

    /* Chip grid — wraps to multiple lines so the user doesn't
       have to horizontally scroll to find an option. */
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      minWidth: 56,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
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
      fontSize: 14,
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
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 20,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.gray3,
    },
    doneBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: c.primaryOn,
    },
  })
}
