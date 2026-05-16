# Sagely — Positioning & App Store Copy

This is the source of truth for Sagely's positioning. The behavioral rules in
**Principles** below should anchor every UX, copy, and feature decision. The
**App Store metadata** section is the current text shipped to ASC.

To re-load this into Claude's memory in a future conversation, ask Claude to
read this file and update `memory/project_marketing_positioning.md`.

---

## Principles

### One-liner

A calm to-do app for days you can't be a productivity person.

### Audience

Adults whose nervous systems are already loud — anxiety, OCD patterns, chronic
procrastination, low stress tolerance, negative self-talk — and who find
scoreboard-style productivity apps actively make things worse.

### Need

Track and finish tasks without the daily punishment loop ("you missed your
streak / you're behind / you failed").

### Promise

Move things forward without making the day feel like a scoreboard.

### Anti-positioning (the load-bearing stance)

- No streaks, no quotas, no "X days in a row"
- No exclamation marks anywhere — there's a unit test asserting this for
  every line of mascot copy (`mobile/src/__tests__/mascotLines.test.ts`)
- Past-due is "Carried over," not "Late"
- Done items "tucked away," reversible for 30 days
- Progress = ambient stones in a cairn, not a counter that resets
- Reduce-motion respected throughout
- Calm color palette — only truly irreversible actions are red
- Every destructive action is reversible or confirmed

### Voice

Mochi the mascot — soft, daily, never pushy. *"Mochi's resting. You can too."*
Lines rotate by day-stable seed so they stay the same all session but change
across days. When the user has set a personal quote, it alternates with
Mochi's line so neither one disappears.

### Competitive frame

| Vs. | They | We |
| --- | --- | --- |
| Habitica / Streaks | gamify and punish missed beats | don't keep score |
| Todoist / TickTick | maximize throughput | minimize harm |
| Notion / Things | cold, dense, complex | warm, quiet, focused |
| Apple Reminders | utilitarian, no emotional layer | emotional layer that doesn't grade |

### Mission-aligned features

| Feature | Why it serves the mission |
| --- | --- |
| Notes per to-do (8 KB) | Externalize what's blocking you, the smallest first step, why it matters |
| Snooze (Tomorrow / Next week / Custom) | "I can't face this today" without guilt |
| Defer all overdue → next week | Overwhelm-mode escape hatch; reversible |
| Bin discoverability footer | The 30-day safety net is visible without dominating |
| Mochi line + quote alternate daily | Neither warmth source disappears when the user customizes |
| Subtasks ("Steps") | Break the scary into the doable |
| Multi-instance recurrence with seriesId | Edit/cancel "this and all future" without text matching |

### How to apply

For any feature or copy proposal, ask: **does it punish, grade, or
scorekeep?** If yes, it's wrong for Sagely regardless of how well it'd score
in conventional UX heuristics.

When in doubt, run the dual-lens review (PM lens + UX lens) per
`memory/feedback_dual_lens_review.md` before implementing.

---

## App Store metadata (current — version 1.1.0)

### Subtitle (30-char limit)

```
Calmer to-dos for hard days
```

### Promotional text (170-char limit, editable without re-review)

```
A calm to-do app for days you can't be a productivity person. With support of your planning buddy Mochi, Sagely makes your hard moments more productive, in a gentle way.
```
*(168 chars)*

### Description (4000-char limit)

```
Sagely is a calm to-do app for people who find that conventional productivity tools — with their streaks, scoreboards, and "you missed your goal" notifications — actively make their anxiety and procrastination worse.

Sagely makes your hard moments more productive, in a gentle way. There are no streaks. No quotas. No "X days in a row." If today was hard, today was hard. Sagely doesn't grade you on it.

THE BASICS, DONE GENTLY

• To-dos with priority, due dates, recurrence, categories, and steps (subtasks)
• Recurring tasks: daily, weekly, monthly, yearly, or custom (specific weekdays, "second Thursday," with optional end date)
• Categories with custom colors and an 80+ icon library — configurable and drag to reorder
• Sign in with Apple, Google, or email
• Cross-device sync via secure cloud storage

WHAT MAKES IT DIFFERENT

Past-due is "Carried over," not "Late." A soft re-entry, not a failure.

Done items get tucked away into a 30-day bin — reversible for a month. Change your mind? They're still there.

Progress shows up as ambient stones in a cairn, not a counter that resets when life happens.

Mochi, your steady mascot, shows up with a soft daily line. Never pushy. Never hyped. Just there.


DESIGNED FOR THE HARD MOMENTS

• Notes per to-do — write what's blocking you, the smallest first step, why it matters. Your thinking stays with the task, not in your head.
• Snooze (Tomorrow / Next week / Pick a date) for the days you can't face an item yet.
• "Defer all to next week" for when Carried over feels heavy. One tap. Undoable.
• Steps for breaking the scary into the doable. Each step has its own priority and date.
• 30-day bin — every "delete" is reversible.

GENTLE ON YOUR SENSES

• Calm color palette. No anxiety-triggering bright reds — only truly irreversible actions are red.
• Reduce Motion respected throughout: splash animation, completion bounces, row flashes — all skipped when iOS Reduce Motion is on.
• Optional completion sound and animation, both togglable.
• Quiet typography. No exclamation marks anywhere.
• Optional daily check-in at a time you choose — not a streak, just a soft reminder if you want one.

PRIVACY-RESPECTING BY DEFAULT

• Your data is yours. Export everything as JSON, anytime.
• Delete your account and everything goes — cloud data wiped, local cache cleared.
• No third-party analytics tracking behavior across apps. No ads.

AVAILABLE IN

English, Simplified Chinese, Spanish, French, German, and Japanese.
```

### Keywords (100-char limit, comma-separated, no spaces in some locales)

```
todo,task,planner,productivity,tasks,anxiety,procrastination,mental health,calm,gentle,mindful
```
*(94 chars — dropped `to-do` since `todo` covers it; original was 102 over the limit)*

---

## Localized listing copy (zh / es / fr / de / ja)

App name (in App Information section) and subtitle (in the version section) are in the locale tables earlier in this file. Below are the longer fields. Char counts noted for the bounded fields.

### Simplified Chinese (zh-Hans)

**Promotional text** (170 chars max)
```
为你做不了高效人士的日子准备的安静待办应用。在计划伙伴 Mochi 的陪伴下，Sagely 让你的艰难时刻也变得高效——温柔地。
```

**Description**
```
Sagely 是一款安静的待办应用，专为那些发现传统效率工具——带着连胜、计分板、"你错过了目标"的通知——实际上让自己的焦虑和拖延变得更糟的人设计。

Sagely 让你的艰难时刻也变得高效，温柔地。没有连胜。没有定额。没有"连续 X 天"。如果今天很难，那今天就是难。Sagely 不会因此给你打分。

基础功能，温柔实现

• 待办事项支持优先级、截止日期、重复、分类和步骤
• 重复任务：每日、每周、每月、每年，或自定义（指定星期、"每月第二个周四"，可选结束日期）
• 自定义颜色和 80+ 图标的分类——可配置和拖动排序
• 用 Apple、Google 或邮箱登录
• 通过安全云存储跨设备同步

与众不同之处

延期的任务叫"延续"，而不是"逾期"。是温和的回归，不是失败。

完成的事项会被放入 30 天的"收起箱"——一个月内随时可恢复。改主意了？它们还在。

进展显示为石冢中静静堆叠的石子，而不是会因为生活打乱而重置的计数器。

Mochi，你稳重的吉祥物，会每天送上一句轻柔的话。从不催促，从不浮夸。就在那里。


为艰难时刻设计

• 每个待办的备注——写下是什么在阻碍你、最小的第一步、为什么重要。让思考留在任务上，而不是脑海里。
• 稍后处理（明天/下周/自选日期），为你"今天面对不了"的日子准备。
• "全部推迟到下周"，当"延续"让人沉重时。一次点击。可撤销。
• 步骤，把可怕的事情分解为可行的事情。每个步骤都有自己的优先级和日期。
• 30 天的收起箱——每一次"删除"都可恢复。

对感官温柔

• 安静的色彩。没有引发焦虑的明亮红色——只有真正不可恢复的操作才是红色。
• 全程尊重"减少动效"设置。
• 可选的完成音效和动画，均可关闭。
• 安静的字体。任何地方都没有感叹号。
• 可选的每日签到，在你选择的时间——不是连胜，只是想要时的温柔提醒。

默认尊重隐私

• 你的数据是你的。随时可导出为 JSON。
• 删除账户，所有数据都会消失——云端数据被擦除，本地缓存被清空。
• 没有第三方分析跨应用追踪行为。没有广告。

可用语言

英语、简体中文、西班牙语、法语、德语、日语。
```

**Keywords** (100 chars max)
```
待办,任务,计划,效率,清单,提醒,焦虑,拖延,心理健康,平静,温柔,mochi
```

### Spanish (es-MX, es-ES)

**Promotional text** (170 chars max)
```
App de tareas tranquila para días en que no puedes ser productivo. Con Mochi, tu compañero de planificación, Sagely hace productivos tus momentos difíciles, con calma.
```
*(166 chars)*

**Description**
```
Sagely es una app de tareas tranquila para personas que descubren que las herramientas de productividad convencionales — con sus rachas, marcadores y notificaciones de "no cumpliste tu meta" — empeoran su ansiedad y procrastinación.

Sagely hace tus momentos difíciles más productivos, con calma. No hay rachas. No hay cuotas. No hay "X días seguidos". Si hoy fue difícil, hoy fue difícil. Sagely no te califica por ello.

LO BÁSICO, HECHO CON CUIDADO

• Tareas con prioridad, fechas, recurrencia, categorías y pasos
• Tareas recurrentes: diaria, semanal, mensual, anual o personalizada (días específicos, "el segundo jueves", con fecha final opcional)
• Categorías con colores personalizados y una biblioteca de más de 80 íconos — configurables y arrastra para reordenar
• Inicia sesión con Apple, Google o correo
• Sincronización entre dispositivos con almacenamiento seguro en la nube

LO QUE LO HACE DIFERENTE

Lo vencido se llama "Pendientes de antes", no "Atrasado". Una reentrada suave, no un fracaso.

Las tareas completadas se guardan en una papelera de 30 días — reversible por un mes. ¿Cambiaste de opinión? Ahí siguen.

El progreso aparece como piedras serenas en un cairn, no como un contador que se reinicia cuando la vida pasa.

Mochi, tu mascota constante, aparece con una línea diaria suave. Nunca insistente. Nunca exaltada. Solo presente.

DISEÑADA PARA MOMENTOS DIFÍCILES

• Notas por tarea — escribe qué te bloquea, el primer paso más pequeño, por qué importa. Tu pensamiento queda con la tarea, no en tu cabeza.
• Posponer (mañana / próxima semana / elegir fecha) para los días en que no puedes enfrentar algo todavía.
• "Posponer todas a la próxima semana" cuando lo pendiente pesa demasiado. Un toque. Reversible.
• Pasos para dividir lo aterrador en lo manejable. Cada paso tiene su propia prioridad y fecha.
• Papelera de 30 días — cada "eliminar" es reversible.

GENTIL CON TUS SENTIDOS

• Paleta de colores tranquila. Sin rojos brillantes que disparen la ansiedad — solo las acciones verdaderamente irreversibles son rojas.
• Respeta "Reducir movimiento" en todo el sistema.
• Sonido y animación de completado opcionales, ambos desactivables.
• Tipografía silenciosa. Sin signos de exclamación en ninguna parte.
• Check-in diario opcional a la hora que elijas — no es una racha, solo un recordatorio suave si lo quieres.

RESPETUOSA CON LA PRIVACIDAD POR DEFECTO

• Tus datos son tuyos. Exporta todo como JSON cuando quieras.
• Elimina tu cuenta y todo desaparece — datos en la nube borrados, caché local limpiada.
• Sin análisis de terceros que rastreen tu comportamiento entre apps. Sin anuncios.

DISPONIBLE EN

Inglés, chino simplificado, español, francés, alemán y japonés.
```

**Keywords** (100 chars max)
```
tareas,planificador,productividad,lista,recordatorios,ansiedad,procrastinación,salud mental,mochi
```

### French (fr-FR)

**Promotional text** (170 chars max)
```
App de tâches calme pour les jours où tu n'es pas productif. Avec Mochi, ton compagnon de planification, Sagely rend tes moments durs productifs, en douceur.
```
*(157 chars)*

**Description**
```
Sagely est une app de tâches calme pour les personnes qui trouvent que les outils de productivité conventionnels — avec leurs séries, leurs tableaux de score et leurs notifications "tu as manqué ton objectif" — aggravent leur anxiété et leur procrastination.

Sagely rend tes moments difficiles plus productifs, en douceur. Pas de série. Pas de quota. Pas de "X jours d'affilée". Si la journée a été dure, elle a été dure. Sagely ne te note pas pour cela.

L'ESSENTIEL, FAIT EN DOUCEUR

• Tâches avec priorité, dates, récurrence, catégories et étapes
• Récurrence : quotidienne, hebdomadaire, mensuelle, annuelle ou personnalisée (jours spécifiques, "le deuxième jeudi", avec date de fin optionnelle)
• Catégories avec couleurs personnalisées et plus de 80 icônes — configurables et réorganise par glissement
• Connexion avec Apple, Google ou email
• Synchronisation entre appareils via stockage cloud sécurisé

CE QUI LA REND DIFFÉRENTE

Le passé est "Reporté", pas "En retard". Une réintégration douce, pas un échec.

Les tâches terminées sont mises de côté dans une corbeille de 30 jours — réversible pendant un mois. Tu changes d'avis ? Elles sont toujours là.

Le progrès apparaît comme des pierres dans un cairn, pas comme un compteur qui se remet à zéro quand la vie arrive.

Mochi, ta mascotte constante, t'apporte une phrase douce chaque jour. Jamais insistante. Jamais exaltée. Juste là.

CONÇUE POUR LES MOMENTS DIFFICILES

• Notes par tâche — écris ce qui te bloque, la plus petite première étape, pourquoi c'est important. Ta réflexion reste avec la tâche, pas dans ta tête.
• Reporter (demain / semaine prochaine / choisir une date) pour les jours où tu ne peux pas y faire face encore.
• "Tout reporter à la semaine prochaine" quand le Reporté pèse trop. Un appui. Réversible.
• Étapes pour découper ce qui fait peur en ce qui est faisable. Chaque étape a sa propre priorité et date.
• Corbeille de 30 jours — chaque "supprimer" est réversible.

DOUCE POUR TES SENS

• Palette de couleurs apaisante. Pas de rouges criards déclencheurs d'anxiété — seules les actions vraiment irréversibles sont en rouge.
• "Réduire les animations" respecté partout.
• Son et animation de complétion optionnels, désactivables.
• Typographie tranquille. Aucun point d'exclamation nulle part.
• Check-in quotidien optionnel à l'heure de ton choix — pas une série, juste un rappel doux si tu en veux un.

RESPECT DE LA VIE PRIVÉE PAR DÉFAUT

• Tes données t'appartiennent. Exporte tout en JSON, à tout moment.
• Supprime ton compte et tout disparaît — données cloud effacées, cache local vidé.
• Pas d'analytics tiers qui suivent ton comportement entre apps. Pas de pub.

DISPONIBLE EN

Anglais, chinois simplifié, espagnol, français, allemand et japonais.
```

**Keywords** (100 chars max)
```
tâches,planificateur,productivité,liste,rappels,anxiété,procrastination,santé mentale,calme,mochi
```

### German (de-DE)

**Promotional text** (170 chars max)
```
Eine ruhige To-Do-App für Tage, an denen du nicht produktiv sein kannst. Mit Mochi, deinem Planungs-Buddy, macht Sagely deine schweren Momente produktiv — sanft.
```
*(160 chars)*

**Description**
```
Sagely ist eine ruhige To-Do-App für Menschen, die feststellen, dass herkömmliche Produktivitäts-Tools — mit ihren Streaks, Punktetafeln und "Du hast dein Ziel verfehlt"-Benachrichtigungen — ihre Angst und Aufschieberitis aktiv verschlimmern.

Sagely macht deine schweren Momente produktiver, auf sanfte Art. Keine Streaks. Keine Quoten. Kein "X Tage in Folge". Wenn heute schwer war, war heute schwer. Sagely bewertet dich nicht dafür.

DAS GRUNDLEGENDE, SANFT GEMACHT

• To-dos mit Priorität, Fälligkeitsdaten, Wiederholung, Kategorien und Schritten
• Wiederkehrende Aufgaben: täglich, wöchentlich, monatlich, jährlich oder benutzerdefiniert (bestimmte Wochentage, "zweiter Donnerstag", mit optionalem Enddatum)
• Kategorien mit eigenen Farben und einer Bibliothek von über 80 Symbolen — konfigurierbar und zum Umsortieren ziehen
• Anmeldung mit Apple, Google oder E-Mail
• Synchronisierung zwischen Geräten über sicheren Cloud-Speicher

WAS SIE ANDERS MACHT

Überfälliges heißt "Übertragen", nicht "Verspätet". Ein sanfter Wiedereinstieg, kein Versagen.

Erledigte Aufgaben werden in einen 30-Tage-Papierkorb weggeräumt — einen Monat lang umkehrbar. Hast du es dir anders überlegt? Sie sind noch da.

Fortschritt zeigt sich als ruhige Steine in einem Cairn, nicht als Zähler, der zurückspringt, wenn das Leben dazwischenkommt.

Mochi, dein beständiges Maskottchen, bringt eine sanfte tägliche Zeile. Nie drängend. Nie überdreht. Einfach da.

FÜR DIE SCHWEREN MOMENTE GEMACHT

• Notizen pro To-do — schreibe, was dich blockiert, der kleinste erste Schritt, warum es wichtig ist. Dein Denken bleibt bei der Aufgabe, nicht in deinem Kopf.
• Verschieben (Morgen / Nächste Woche / Datum wählen) für Tage, an denen du es noch nicht angehen kannst.
• "Alle auf nächste Woche verschieben", wenn Übertragenes schwer wird. Ein Tippen. Umkehrbar.
• Schritte, um Beängstigendes in Machbares zu zerlegen. Jeder Schritt hat eigene Priorität und Datum.
• 30-Tage-Papierkorb — jedes "Löschen" ist umkehrbar.

SANFT FÜR DEINE SINNE

• Ruhige Farbpalette. Keine angsterzeugenden grellen Rottöne — nur wirklich unumkehrbare Aktionen sind rot.
• "Bewegung reduzieren" wird überall respektiert.
• Optionale Erledigt-Töne und -Animationen, beide abschaltbar.
• Stille Typografie. Keine Ausrufezeichen, nirgendwo.
• Optionaler täglicher Check-in zu deiner gewählten Zeit — kein Streak, nur eine sanfte Erinnerung, wenn du willst.

PRIVATSPHÄRE IST STANDARD

• Deine Daten gehören dir. Exportiere alles jederzeit als JSON.
• Lösche dein Konto und alles ist weg — Cloud-Daten gelöscht, lokaler Cache geleert.
• Keine Drittanbieter-Analytik, die App-übergreifend Verhalten verfolgt. Keine Werbung.

VERFÜGBAR IN

Englisch, vereinfachtes Chinesisch, Spanisch, Französisch, Deutsch und Japanisch.
```

**Keywords** (100 chars max)
```
Aufgaben,Planer,Produktivität,To-do,Erinnerung,Angst,Aufschieberitis,psychische Gesundheit,mochi
```

### Japanese (ja)

**Promotional text** (170 chars max)
```
生産的な人になれない日のための、静かなToDoアプリ。プランニング・バディのMochiと一緒に、Sagelyはあなたの辛い瞬間もやさしく前に進めます。
```

**Description**
```
Sagely は、従来の生産性ツール—連続記録、スコアボード、「目標を逃しました」という通知—が、自分の不安や先延ばし癖を実際に悪化させていると気づいた人のための、静かなToDoアプリです。

Sagely はあなたの辛い瞬間もやさしく生産的にします。連続記録はありません。ノルマもありません。「○日連続」もありません。今日が辛かったなら、今日は辛かった。Sagely はそれで評価しません。

基本機能、やさしく

• 優先度、期日、繰り返し、カテゴリー、ステップを持つToDo
• 繰り返しタスク：毎日・毎週・毎月・毎年、またはカスタム（特定の曜日、「第2木曜日」、終了日も任意）
• カスタムカラーと80以上のアイコンライブラリのカテゴリー—設定可能で、ドラッグで並び替え
• Apple、Google、メールでサインイン
• 安全なクラウドストレージでデバイス間同期

何が違うのか

期限切れは「遅延」ではなく「繰越」。失敗ではなく、優しい再始動です。

完了したものは30日間の箱にしまわれます—1か月間は戻せます。気が変わった？まだそこにあります。

進歩はケルン（積み石）の中の静かな石として現れます。人生に何かあって止まる、リセットされるカウンターではありません。

Mochi、あなたの穏やかなマスコットは、毎日やさしい一言を届けます。決して急かさない。決して大げさにしない。ただそこにいる。

辛い瞬間のために設計

• タスクごとのメモ—何があなたを止めているか、一番小さな最初の一歩、なぜ大切かを書きましょう。考えはタスクと一緒に残り、頭の中ではありません。
• スヌーズ（明日・来週・日付選択）—まだ今日は向き合えない日のために。
• 「すべて来週に延期」—「繰越」が重く感じる時に。タップ一つ。元に戻せます。
• ステップ—怖いことを、できることに分解します。各ステップには独自の優先度と日付があります。
• 30日間の箱—すべての「削除」は元に戻せます。

感覚にやさしく

• 穏やかなカラーパレット。不安を引き起こすような明るい赤はありません—本当に取り消せない操作だけが赤です。
• 「視差効果を減らす」設定を全体で尊重します。
• 完了時の音とアニメーションは任意、どちらもオフにできます。
• 静かなタイポグラフィ。どこにも感嘆符はありません。
• 任意の毎日のチェックインを、あなたが選ぶ時刻に—連続記録ではなく、欲しい時の優しいリマインダーです。

プライバシーを尊重

• あなたのデータはあなたのもの。いつでもJSONでエクスポートできます。
• アカウントを削除すれば、すべて消えます—クラウドデータは消去され、ローカルキャッシュもクリアされます。
• アプリ間で行動を追跡する第三者の分析はありません。広告もありません。

対応言語

英語、簡体字中国語、スペイン語、フランス語、ドイツ語、日本語。
```

**Keywords** (100 chars max)
```
ToDo,タスク,プランナー,リマインダー,生産性,不安,先延ばし,メンタルヘルス,落ち着いた,やさしい,mochi
```

---

## Screenshot specs (8 screens, narrative order)

Capture from the iOS simulator at App Store sizes:
`1242×2688` (iPhone 6.5"), `1290×2796` (iPhone 6.7"),
`2048×2732` (iPad Pro 12.9").

`scripts/asc_upload_screenshots.py` handles upload to ASC; image dimensions
map to display type via `SUPPORTED_SIZES` in that script.

| # | Screen to capture | What to show | Caption |
| - | --- | --- | --- |
| 1 | All view, populated | Mascot greeting, pebble cairn, 2–3 tasks across Today + This Week with categories | **Your day, gently** |
| 2 | TaskDetails open with notes filled in | Notes textarea visible with sample text like "smallest step: open the doc" | **Externalize what's blocking you** |
| 3 | Long-press snooze menu | Action sheet showing Tomorrow / Next week / Pick a date / Cancel | **Snooze without guilt** |
| 4 | All view with Carried Over expanded | "Defer all to next week →" link visible | **When today feels heavy, defer in one tap** |
| 5 | Done filter view | 30-day retention notice header + a few tucked-away rows | **Reversible for 30 days. Always.** |
| 6 | Subtasks expanded with progress pill | Parent + 3 subtasks (some checked) + chevron + progress | **Break the scary into the doable** |
| 7 | Onboarding screen 1 | Cairn glyph + Mochi line + Skip affordance | **Mochi takes it slow. So can you.** |
| 8 | Profile sheet | Daily check-in section, calm settings | **Quiet by design** |

**Tip**: populate sample data with humane content ("Refill prescription,"
"Email therapist," "Tidy the desk for 5 min") not generic "Task 1." The
sample data IS marketing.

---

## Maintenance

When updating positioning or App Store copy:

1. Edit this file
2. Bump the version reference in the App Store metadata section
3. Commit on `dev`, promote to `main`
4. Ask Claude to re-sync the memory entry
   (`memory/project_marketing_positioning.md`) from this file
