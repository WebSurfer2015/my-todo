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

| Feature | Shipped | Why it serves the mission |
| --- | --- | --- |
| Notes per to-do (8 KB) | 1.1.0 | Externalize what's blocking you, the smallest first step, why it matters |
| Snooze (Tomorrow / Next week / Custom) | 1.1.0 | "I can't face this today" without guilt |
| Defer all overdue → next week | 1.1.0 | Overwhelm-mode escape hatch; reversible |
| Bin discoverability footer | 1.1.0 | The 30-day safety net is visible without dominating |
| Mochi line + quote alternate daily | 1.1.0 | Neither warmth source disappears when the user customizes |
| Subtasks ("Steps") | 1.1.0 | Break the scary into the doable |
| Multi-instance recurrence with seriesId | 1.1.0 | Edit/cancel "this and all future" without text matching |
| Pick-your-own Background (8 color/pattern pairs) | 1.2.0 | Calming personalization — the app shell takes on a tone the user chose, not one forced on them |
| Home tab — Today as the default landing | 1.3.0 | Answers "what do I need to do right now?" without making you browse the whole backlog. The work isn't hidden, it's just not in your face on open. Stats and the lifetime cairn sit gently below as ambient context. |
| Body-tap un-checks done rows on Home | 1.3.0 | The "I changed my mind" gesture lives on the same target as the check-off — no menu hunt, no penalty for second-guessing |
| Groceries tab — items grouped by store department | 1.3.0 | Produce / Dairy & Eggs / Bread & Bakery / Frozen / Pantry / etc., so the list reads in store-aisle order rather than entry order. Items don't auto-purge; check-offs are fully reversible. |
| Configurable grocery departments | 1.3.0 | Hide built-ins you don't use, rename to match your store, add your own — the list mirrors how the user actually shops |
| Unified Todos + Groceries pill row | 1.3.0 | Same All-pill + filter behavior in both tabs — predictability between tabs is itself calming; the UI doesn't get relearned between trips |
| Reduce-motion toggle in Settings | 1.3.0 | One switch quiets every animation for hard days — not gated behind iOS Reduce Motion, so the user can opt in here even when their system setting is off |
| Colored pebble palette (eight calm hues) | 1.3.0 | Ambient progress reads like a curated riverbed, not a uniform counter |
| Sticky filter + pebble strip on Todos | 1.3.0 | Your day's context stays visible while you scroll — less mental load to re-find where you are |

### How to apply

For any feature or copy proposal, ask: **does it punish, grade, or
scorekeep?** If yes, it's wrong for Sagely regardless of how well it'd score
in conventional UX heuristics.

When in doubt, run the dual-lens review (PM lens + UX lens) per
`memory/feedback_dual_lens_review.md` before implementing.

---

## App Store metadata (current — version 1.3.0)

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


HOME, FOR TODAY ONLY

Open Sagely and you land on Home — a quiet view of just today and whatever carried over from yesterday. The whole backlog isn't shouting at you the moment you open the app. Stats and your lifetime cairn sit gently below — ambient context, not a scoreboard. Tap a done row to un-check it; the "I changed my mind" gesture lives on the same target as the check-off.


GROCERIES, BY AISLE

A second tab for the list you keep on the way to the store. Items group themselves by department — Produce, Dairy & Eggs, Bread & Bakery, Frozen, Pantry, and more — so the list reads in the order you actually walk the store. Items don't disappear when you check them off; uncheck to bring them back next time. Rename or hide built-in departments, add your own. The filter and "All" pill behave exactly like Todos, so you don't relearn the UI between trips.


DESIGNED FOR THE HARD MOMENTS

• Notes per to-do — write what's blocking you, the smallest first step, why it matters. Your thinking stays with the task, not in your head.
• Snooze (Tomorrow / Next week / Pick a date) for the days you can't face an item yet.
• "Defer all to a future date" for when Carried over feels heavy. One tap. Undoable.
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

## Play Store metadata (current — version 1.3.0)

Play Console's listing fields don't 1:1 map to ASC's. Play has **no subtitle** and **no promotional text** — it has one **Short description** (80 chars) that appears under the icon in search, plus the same **Full description** (4000 chars) as ASC. Full descriptions are byte-identical to the App Store text above (and to the localized text below) so the two stores stay in sync.

### App name (50-char limit)

```
Sagely — Calm To-Dos
```
*(20 chars; matches `mobile/app.json > expo.name`)*

### Short description (80-char limit, English)

```
A calm to-do app for days you can't be a productivity person.
```
*(61 chars — the canonical one-liner from Principles above)*

### Full description (English)

Reuse the App Store description verbatim — no changes for Play.

### Tags (up to 5, from Play's fixed catalog)

- **To-do list** (Productivity) — core function, highest-intent match
- **Notes** (Productivity) — Sagely's per-todo notes (8 KB) and journal-adjacent feel
- **Shopping list** (Productivity) — the Groceries half of the app
- **Planner** (Productivity) — recurring tasks, snooze, defer-all
- **Mindfulness** (Health & fitness) — anti-positioning anchor; puts Sagely adjacent to Calm/Headspace discovery instead of head-to-head with Things/TickTick

Avoid **Habit tracker** even though it's productivity-adjacent — it implies streaks, which is anti-positioning. If Play renames "Mindfulness," the closest fallback is **Self-improvement** or **Meditation**.

### App category, content rating, declarations

- **Category**: Productivity (differentiation lives in description + tags, not category)
- **Content rating**: IARC → Everyone (no UGC, no harm content)
- **Target age**: 13+
- **Ads**: No
- **In-app purchases**: No
- **Government app**: No
- **Financial features**: No

### "What's new" / release notes (≤500-char limit per locale)

Play's "What's new" caps shorter than ASC's. The full release-notes copy lives in `mobile/scripts/asc/whats_new.json` (one entry per version, 7 locales) — those entries are sized for ASC and exceed Play's cap, so Play-sized variants live below. When shipping a new version, draft Play variants in parallel and put them under `mobile/scripts/play/whats_new.json` (file to be created on the first Play submission).

**English (v1.3.0)** — *(~472 chars)*

```
A more accessible, more polished Sagely.

• Reduce motion toggle in Settings — quiets every animation on hard days.
• Edit step: Cancel discards changes; parent task shows in subtitle; destructive action reads "Delete."
• Notes inline under the title in Edit to-do.
• Pebbles in eight calm colors.
• Sticky filter + pebble strip on Todos.
• Groceries "All" pill pinned to the left.
• Compose sheet caps height for the keyboard.
• Crash reporting expanded.

Thanks for using Sagely.
```

### Localized short descriptions (80-char limit each)

| Locale | Short description | Count |
| --- | --- | --- |
| es-MX / es-ES | `Una app de tareas tranquila para días en que no puedes ser productivo.` | 70 |
| fr-FR | `Une app de tâches calme pour les jours où tu n'es pas productif.` | 64 |
| de-DE | `Eine ruhige To-Do-App für Tage, an denen du nicht produktiv sein kannst.` | 72 |
| zh-Hans | `为你做不了高效人士的日子准备的安静待办应用。` | 21 (CJK) |
| ja | `生産的な人になれない日のための、静かなToDoアプリ。` | 23 (CJK) |

Localized full descriptions reuse the App Store descriptions in the **Localized listing copy** section below — no Play-specific text needed.

### Localized "What's new" (v1.3.0, ≤500 chars each)

**zh-Hans**

```
更易用、更精致的 Sagely。

• 设置中新增「减少动效」——一个开关静音所有动画。
• 「编辑步骤」更新：「取消」真正丢弃修改；父任务显示在副标题；删除操作改为文字「删除」。
• 编辑待办事项时，「备注」直接位于标题下方。
• 石冢中的石子现在有 8 种平和的颜色。
• 待办的「筛选」与「石子带」滚动时始终一起停在顶部。
• 购物的「全部」固定在筛选行的最左侧。
• 添加待办事项的弹窗限制最大高度。
• 崩溃上报扩展。

感谢使用 Sagely。
```

**es-MX / es-ES**

```
Una Sagely más accesible y pulida.

• Reducir movimiento en Ajustes — un solo interruptor silencia toda animación.
• Editar paso: Cancelar descarta cambios; la tarea padre en el subtítulo; la acción destructiva dice "Eliminar."
• Notas en línea bajo el título al editar una tarea.
• Piedras del cairn en ocho colores serenos.
• Filtros y tira de piedras fijos en Tareas.
• "Todas" en Compras anclada a la izquierda.
• Hoja de Componer limita su altura.
• Reportes de errores ampliados.

Gracias por usar Sagely.
```

**fr-FR**

```
Une Sagely plus accessible, plus soignée.

• Réduire les animations dans Réglages — apaise toutes les animations.
• Modifier l'étape : Annuler abandonne vraiment ; tâche parente en sous-titre ; action « Supprimer ».
• Notes en ligne sous le titre dans Modifier la tâche.
• Pierres du cairn en huit couleurs apaisantes.
• Filtres + bande de pierres restent en haut.
• Pille « Tout » des courses ancrée à gauche.
• Feuille « Composer » plafonne sa hauteur.
• Rapports d'erreurs élargis.

Merci d'utiliser Sagely.
```

**de-DE**

```
Ein zugänglicheres, polierteres Sagely.

• Bewegung reduzieren in Einstellungen — ein Schalter beruhigt alle Animationen.
• Schritt bearbeiten: Abbrechen verwirft Änderungen; übergeordnete Aufgabe im Untertitel; destruktive Aktion „Löschen".
• Notizen direkt unter dem Titel in „To-do bearbeiten".
• Cairn-Steine in acht ruhigen Farben.
• Filter + Steinleiste bleiben oben angeheftet.
• „Alle"-Pille in Einkaufsliste links angeheftet.
• Verfassen-Sheet begrenzt seine Höhe.
• Erweitertes Crash-Reporting.

Danke, dass du Sagely nutzt.
```

**ja**

```
より使いやすく、より洗練された Sagely。

• 設定に「視差効果を減らす」を追加 — ひとつのスイッチで全アニメを静かに。
• 「ステップ編集」：「キャンセル」が本当に変更を破棄、親タスクがサブタイトル、削除操作は「削除」テキスト。
• 「To-do を編集」でメモがタイトル直下。
• ケルンの石は 8 色の穏やかなパレット。
• To-do タブのフィルター行とペブル帯がスクロール時も上部に固定。
• 買い物リストの「全部」は左端にピン留め。
• 作成シートに高さ上限。
• クラッシュレポートを拡張。

ご利用ありがとうございます。
```

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


主页，只看今天

打开 Sagely，你首先看到的是「主页」——只展示今天和从昨天延续过来的事项。打开应用的瞬间，整个待办背景不会冲着你喊。统计和你的累计石冢安静地排在下方——是氛围般的陪伴，不是计分板。轻点已完成的事项即可取消勾选；「我改主意了」与勾选用的是同一个目标。


购物清单，按通道排列

第二个标签页是你去商店路上要带的清单。物品会自动按部门分组——农产品、乳制品和蛋类、面包烘焙、冷冻、食品柜等等——让清单按你实际走商店的顺序读起来。勾选完不会消失；再次取消勾选就能下次再用。可以重命名或隐藏内置部门，也可以添加自己的。筛选和「全部」按钮与待办事项一致——不同标签页间无需重新学习界面。


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

INICIO, SOLO PARA HOY

Abre Sagely y aterrizas en Inicio — una vista tranquila de solo hoy y lo que se trajo de ayer. Todo el pendiente no te grita en el momento que abres la app. Las estadísticas y tu cairn de toda la vida quedan abajo, contexto ambiental, no un marcador. Toca una tarea hecha para desmarcarla; el gesto de "cambié de opinión" vive en el mismo objetivo que el de marcar.

COMPRAS, POR PASILLO

Una segunda pestaña para la lista que llevas camino al supermercado. Los artículos se agrupan por departamento — Frutas y verduras, Lácteos y huevos, Pan y panadería, Congelados, Despensa y más — para que la lista se lea en el orden en que de verdad recorres la tienda. Los artículos no desaparecen al marcarlos; desmárcalos para traerlos de vuelta la próxima vez. Renombra u oculta los departamentos predeterminados, agrega los tuyos. El filtro y la pastilla "Todas" funcionan igual que en Tareas — no hace falta reaprender la interfaz entre pestañas.

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

ACCUEIL, POUR AUJOURD'HUI SEULEMENT

Ouvre Sagely et tu arrives sur Accueil — une vue calme uniquement d'aujourd'hui, plus ce qui a été reporté d'hier. Tout l'arriéré ne te crie pas dessus dès que tu ouvres l'app. Les statistiques et ton cairn de toujours restent en bas, contexte d'ambiance, pas un tableau de score. Touche une tâche terminée pour la décocher ; le geste « j'ai changé d'avis » vit sur la même cible que celui pour cocher.

COURSES, PAR RAYON

Un second onglet pour la liste que tu emportes en faisant les courses. Les articles se groupent par rayon — Fruits et légumes, Produits laitiers, Pain et boulangerie, Surgelés, Garde-manger, et plus — pour que la liste se lise dans l'ordre où tu parcours réellement le magasin. Les articles ne disparaissent pas quand tu les coches ; décoche pour les ramener la prochaine fois. Renomme ou cache les rayons par défaut, ajoute les tiens. Le filtre et la pille « Tout » se comportent exactement comme dans Tâches — pas de réapprentissage entre onglets.

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

STARTSEITE, NUR FÜR HEUTE

Öffne Sagely und du landest auf der Startseite — eine ruhige Ansicht nur von heute, plus dem, was von gestern übertragen wurde. Der gesamte Rückstand schreit dich nicht an, sobald du die App öffnest. Statistiken und dein Lebens-Cairn sitzen sanft darunter — Umgebungskontext, kein Punktestand. Tippe eine erledigte Zeile an, um sie zu entstreichen; die „Ich hab's mir anders überlegt"-Geste sitzt auf demselben Ziel wie das Abhaken.

EINKAUFSLISTE, NACH GANG

Ein zweiter Tab für die Liste, die du auf dem Weg in den Laden mitnimmst. Artikel gruppieren sich nach Abteilung — Obst & Gemüse, Milchprodukte & Eier, Brot & Backwaren, Tiefkühl, Vorratskammer und mehr — sodass die Liste in der Reihenfolge zu lesen ist, in der du den Laden tatsächlich durchgehst. Artikel verschwinden nicht, wenn du sie abhakst; hake sie ab, um sie beim nächsten Mal wieder mitzunehmen. Benenne Standard-Abteilungen um oder verstecke sie, füge eigene hinzu. Filter und die „Alle"-Pille verhalten sich genauso wie in Aufgaben — keine UI muss zwischen Tabs neu gelernt werden.

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

ホーム、今日だけのために

Sagely を開くと、まず「ホーム」に着きます — 今日と、昨日から繰り越したものだけの静かなビューです。アプリを開いた瞬間、バックログ全体があなたに叫びかけることはありません。統計と人生のケルンは下にやさしく置かれ、スコアボードではなく、ただの環境的なコンテキストとして存在します。完了した行をタップしてチェックを外せます — 「気が変わった」のジェスチャーは、チェックを付けるのと同じターゲットに乗っています。

買い物リスト、通路順で

お店へ向かう途中で持っていくリストのための、もうひとつのタブ。アイテムは自動で部門ごとにグループ化されます — 青果、乳製品・卵、パン・ベーカリー、冷凍食品、食料品など — お店を実際に歩く順番でリストが読めるようになっています。チェックを入れても消えません；チェックを外せば次回また使えます。組み込みの部門は名前を変えたり隠したりでき、自分の部門も追加できます。フィルターと「全部」ピルは To-do タブとまったく同じ挙動 — タブ間で UI を学び直す必要はありません。

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

Slot plan is canonical in `mobile/scripts/screenshots/capture.sh`. Keep this table in lockstep.

| # | Slot key (capture.sh) | What to show | Caption |
| - | --- | --- | --- |
| 1 | `home-today-hero` | Home tab — Today list with 2–3 actionable rows + pebble strip + cairn glyph anchor below; greeting line + Mochi visible | **Today, gently** |
| 2 | `todos-all-grouped` | Todos tab, All filter, grouped sections (Today / This Week / etc.) with category icons + sticky filter pill row | **Your day, organized — without the scoreboard** |
| 3 | `defer-to-sheet` | DeferModal open showing Tomorrow / Next week / Pick a date / Cancel | **Snooze without guilt** |
| 4 | `edit-todo-notes-inline` | Edit to-do sheet with Notes inline under the title, sample text like "smallest step: open the doc" | **Externalize what's blocking you** |
| 5 | `steps-with-dates` | Todo with Steps expanded — parent + 3 subtasks, each step showing its own date + priority + completion stamp | **Break the scary into the doable** |
| 6 | `groceries-by-store` | Groceries tab, items grouped by department (Produce, Dairy & Eggs, Bread & Bakery, …) with the pinned All pill visible on the left | **Groceries, by aisle** |
| 7 | `profile-sheet` | Profile sheet — Background picker row + Reduce-motion toggle + density + calm Animations & Sound settings | **Quiet by design** |
| 8 | `recurring-repeats` | Repeat picker open showing Daily / Weekly / Monthly / Yearly + Custom, "second Thursday" example visible | **Recurring tasks, without the streak guilt** |

**Tip**: populate sample data with humane content ("Refill prescription,"
"Email therapist," "Tidy the desk for 5 min") not generic "Task 1." For
Groceries, use the same humanizing pattern ("Sourdough loaf," "Cilantro,"
"Frozen peas") so the screenshot still reads like a real person's list.
The sample data IS marketing.

---

## Maintenance

When updating positioning or store copy:

1. Edit this file
2. Bump the version reference in **both** the App Store and Play Store metadata sections so they stay in lockstep
3. Add a new row to the **Mission-aligned features** table for any user-visible shipped feature, with its release version
4. Draft Play "What's new" variants alongside the ASC variants — Play's ≤500-char limit means the ASC copy needs trimming, not just translating
5. Commit on `dev`, promote to `main` (see repo `CLAUDE.md` dev-first workflow)
6. Ask Claude to re-sync the memory entry
   (`memory/project_marketing_positioning.md`) from this file
