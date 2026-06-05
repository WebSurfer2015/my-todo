/**
 * #15 a11y fix: convert wrapping backdrop <Pressable> to a SIBLING tap-layer
 * so iOS stops collapsing each Modal sheet into one a11y leaf.
 *
 * Only safe for sheets whose ONLY <Pressable> elements are the backdrop
 * (+ optional inner sheet) — buttons are TouchableOpacity. Multiline
 * Pressable opens are excluded (hand-fixed). Run: node scripts/fix-sheet-a11y.cjs
 */
const fs = require('fs')
const FILES = [
  'mobile/src/features/mochi/ChatSheet.tsx',
  'mobile/src/features/profile/SettingsSheet.tsx',
  'mobile/src/features/profile/ManageAnimationSoundSheet.tsx',
  'mobile/src/features/profile/ManageHomeTilesSheet.tsx',
  'mobile/src/features/profile/ProfileSheet/index.tsx',
  'mobile/src/features/task/AddSubtaskSheet.tsx',
  'mobile/src/features/groceries/GroceryComposeSheet.tsx',
  'mobile/src/features/groceries/GroceryEditSheet.tsx',
  'mobile/src/features/onboarding/GuideMenuSheet.tsx',
  'mobile/src/features/category/CategorySheet/index.tsx',
]

for (const f of FILES) {
  let s = fs.readFileSync(f, 'utf8')
  const before = s

  // 1. backdrop Pressable (single-line) -> View + sibling absolute tap-layer
  s = s.replace(
    /^([ \t]*)<Pressable style=\{styles\.backdrop\} onPress=\{(\w+)\}>/m,
    (_m, ind, handler) =>
      `${ind}{/* Sibling backdrop tap-layer (not a wrapper) — a wrapping Pressable\n${ind}    collapses the sheet into one iOS a11y leaf (breaks VoiceOver/Maestro). */}\n` +
      `${ind}<View style={styles.backdrop}>\n` +
      `${ind}  <Pressable style={StyleSheet.absoluteFill} onPress={${handler}} accessible={false} />`,
  )

  // 2. inner sheet Pressable (single-line) -> plain View
  s = s.replace(
    /<Pressable style=\{styles\.sheet\} onPress=\{\(e\) => e\.stopPropagation\(\)\}>/,
    '<View style={styles.sheet}>',
  )

  // 3. all remaining </Pressable> (backdrop + sheet closings) -> </View>
  s = s.replace(/<\/Pressable>/g, '</View>')

  // (StyleSheet is already imported in every target file — it's used by
  //  makeStyles' StyleSheet.create — so no import patching is needed.)

  if (s !== before) { fs.writeFileSync(f, s); console.log('fixed:', f.replace('mobile/src/features/', '')) }
  else console.log('NO CHANGE (check):', f)
}
