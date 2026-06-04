/**
 * Mochi-voice greeting tagline. Time-of-day + plate-aware variants picked
 * deterministically from the day's date so the line stays the same across
 * a session but rotates daily. Anxiety-friendly tone — no exclamation
 * marks (incl. fullwidth ！ and Spanish ¡), no "let's crush it" energy,
 * never goal-oriented.
 *
 * Localized into all six app languages. The voice principles cross
 * locales: informal tú/tu/du in romance + germanic, casual non-keigo
 * forms in Japanese, 你 in Simplified Chinese, soft and slightly
 * literary throughout.
 *
 * Pure module — no React, no platform deps. Lives in mobile/ rather than
 * core/ because the lines are mobile-specific copy. Web has its own
 * mascot voice in its store.
 */

import type { Lang } from "../../core/src/data/i18n";

export type TimeOfDay = "morning" | "afternoon" | "evening";

type Bucket = { fresh: string[]; going: string[] };
type DaySet = Record<TimeOfDay, Bucket>;

export const MASCOT_LINES: Record<Lang, DaySet> = {
  en: {
    morning: {
      fresh: [
        "Mochi's here. Take it slow today.",
        "Quiet start. One thing at a time.",
        "Mochi's stretching. So can you.",
        "No rush. The day's just opening.",
        "Mochi's waiting. Pick the smallest.",
        "A clean morning. Yours for the choosing.",
        "Pace yourself. Mochi insists.",
        "Light start, light steps.",
      ],
      going: [
        "Steady morning. Mochi's pacing.",
        "Nice rhythm. Keep it gentle.",
        "Mochi sees you. Carry on.",
        "One pebble at a time.",
        "Easy does it. The day's wide open.",
        "Soft start, real progress.",
      ],
    },
    afternoon: {
      fresh: [
        "Afternoon, Mochi-style. Slow is fine.",
        "One small thing — that's enough for now.",
        "Mochi's still pacing. No hurry.",
        "Pick something tiny. The rest will keep.",
        "Quiet middle of the day. No agenda required.",
        "Mochi's nearby. You can rest here too.",
      ],
      going: [
        "Mochi's halfway there. So are you.",
        "Steady on. The rest can wait.",
        "Quiet progress. Mochi approves.",
        "Keep the pace. No need to push.",
        "Soft afternoon. You're moving fine.",
        "One pebble more, then a breath.",
      ],
    },
    evening: {
      fresh: [
        "Evening. Mochi's curling up.",
        "Wind down. Tomorrow has more time.",
        "Slow now. Today did its part.",
        "Mochi's resting. You can too.",
        "Quiet hour. Nothing else needs doing.",
        "Day's almost done. So is Mochi.",
      ],
      going: [
        "Mochi's settling. Save the rest.",
        "Quiet end. Well done.",
        "One last gentle thing — or none.",
        "Tomorrow's pebbles can wait.",
        "Light off the day. You've earned it.",
        "Mochi's content. So can you be.",
      ],
    },
  },
  zh: {
    morning: {
      fresh: [
        "Mochi 在这。今天慢慢来。",
        "安静地开始。一次一件事。",
        "Mochi 在伸懒腰。你也可以。",
        "不急。一天才刚开始。",
        "Mochi 在等。挑最小的那件。",
        "干净的早晨。任你选择。",
        "放慢节奏。Mochi 这么说。",
        "轻轻开始，轻轻地走。",
      ],
      going: [
        "稳稳的早晨。Mochi 也在踱步。",
        "节奏不错。保持轻柔。",
        "Mochi 看到你了。继续。",
        "一次一颗石子。",
        "慢慢来。一天还很长。",
        "柔软的开始，真实的进展。",
      ],
    },
    afternoon: {
      fresh: [
        "Mochi 的下午。慢一点也行。",
        "一件小事——现在这就够了。",
        "Mochi 还在踱步。不急。",
        "挑一件小事。其他还在那。",
        "安静的午后。不需要安排什么。",
        "Mochi 就在旁边。你也可以歇着。",
      ],
      going: [
        "Mochi 走到一半。你也是。",
        "稳着走。剩下的可以等。",
        "安静的进展。Mochi 满意。",
        "保持节奏。不必加速。",
        "柔和的下午。你做得很好。",
        "再放一颗石子，再喘口气。",
      ],
    },
    evening: {
      fresh: [
        "傍晚了。Mochi 在蜷起来。",
        "慢慢收尾。明天还有时间。",
        "现在慢下来。今天已经做了它的部分。",
        "Mochi 在休息。你也可以。",
        "安静的时间。其他都不必做了。",
        "一天快结束了。Mochi 也是。",
      ],
      going: [
        "Mochi 在安顿。其余的留到明天。",
        "安静地结束。做得好。",
        "最后一件温柔的事——或者没有也行。",
        "明天的石子可以等。",
        "为今天熄灯。你应得的。",
        "Mochi 满足了。你也可以。",
      ],
    },
  },
  es: {
    morning: {
      fresh: [
        "Mochi está aquí. Hoy, tómatelo con calma.",
        "Comienzo tranquilo. Una cosa a la vez.",
        "Mochi se estira. Tú también puedes.",
        "Sin prisa. El día apenas empieza.",
        "Mochi espera. Elige la más pequeña.",
        "Mañana limpia. Tuya para elegir.",
        "Tu propio ritmo. Mochi insiste.",
        "Comienzo ligero, pasos ligeros.",
      ],
      going: [
        "Mañana firme. Mochi camina al lado.",
        "Buen ritmo. Mantenlo suave.",
        "Mochi te ve. Sigue.",
        "Una piedra a la vez.",
        "Despacio. El día es ancho.",
        "Comienzo suave, progreso real.",
      ],
    },
    afternoon: {
      fresh: [
        "Tarde tipo Mochi. Lento está bien.",
        "Una cosa pequeña — por ahora basta.",
        "Mochi sigue caminando. Sin prisa.",
        "Elige algo diminuto. Lo demás esperará.",
        "Medio día tranquilo. Sin agenda.",
        "Mochi está cerca. Tú también puedes descansar.",
      ],
      going: [
        "Mochi va a medio camino. Tú también.",
        "Constancia. Lo demás puede esperar.",
        "Progreso tranquilo. Mochi aprueba.",
        "Mantén el paso. Sin empujar.",
        "Tarde suave. Vas bien.",
        "Una piedra más, luego un respiro.",
      ],
    },
    evening: {
      fresh: [
        "Atardecer. Mochi se acurruca.",
        "Bajemos el ritmo. Mañana hay más tiempo.",
        "Despacio ahora. Hoy ya hizo lo suyo.",
        "Mochi descansa. Tú también puedes.",
        "Hora tranquila. Nada más por hacer.",
        "El día casi termina. Mochi también.",
      ],
      going: [
        "Mochi se acomoda. Guarda el resto.",
        "Final tranquilo. Bien hecho.",
        "Una última cosa suave — o ninguna.",
        "Las piedras de mañana pueden esperar.",
        "Apaga la luz del día. Te lo has ganado.",
        "Mochi está en paz. Tú también puedes estarlo.",
      ],
    },
  },
  fr: {
    morning: {
      fresh: [
        "Mochi est là. Prends ton temps aujourd'hui.",
        "Début tranquille. Une chose à la fois.",
        "Mochi s'étire. Toi aussi tu peux.",
        "Pas pressé. La journée s'ouvre à peine.",
        "Mochi attend. Prends la plus petite.",
        "Matin propre. À toi de choisir.",
        "Va à ton rythme. Mochi insiste.",
        "Début léger, pas légers.",
      ],
      going: [
        "Matin posé. Mochi avance aussi.",
        "Bon rythme. Garde-le doux.",
        "Mochi te voit. Continue.",
        "Une pierre à la fois.",
        "Doucement. La journée est large.",
        "Début doux, vrai progrès.",
      ],
    },
    afternoon: {
      fresh: [
        "Après-midi à la Mochi. Lent, c'est très bien.",
        "Une petite chose — ça suffit pour l'instant.",
        "Mochi avance toujours. Sans hâte.",
        "Prends quelque chose de minuscule. Le reste tient.",
        "Milieu de journée calme. Aucun programme requis.",
        "Mochi est tout près. Tu peux te reposer ici aussi.",
      ],
      going: [
        "Mochi est à mi-chemin. Toi aussi.",
        "Continue, posément. Le reste peut attendre.",
        "Progrès tranquille. Mochi approuve.",
        "Garde le rythme. Pas besoin de forcer.",
        "Après-midi doux. Tu avances bien.",
        "Une pierre de plus, puis un souffle.",
      ],
    },
    evening: {
      fresh: [
        "Soir. Mochi se pelotonne.",
        "On ralentit. Demain a plus de temps.",
        "Plus doucement. Aujourd'hui a fait sa part.",
        "Mochi se repose. Toi aussi tu peux.",
        "Heure tranquille. Rien d'autre n'est nécessaire.",
        "La journée touche à sa fin. Mochi aussi.",
      ],
      going: [
        "Mochi s'installe. Garde le reste.",
        "Fin tranquille. C'est très bien.",
        "Une dernière chose douce — ou aucune.",
        "Les pierres de demain peuvent attendre.",
        "Éteins la journée. Tu l'as mérité.",
        "Mochi est apaisé. Tu peux l'être aussi.",
      ],
    },
  },
  ja: {
    morning: {
      fresh: [
        "Mochi はここに。今日はゆっくり。",
        "静かな始まり。一度にひとつずつ。",
        "Mochi が伸びをしてる。あなたも。",
        "急がなくていい。一日はまだ始まったばかり。",
        "Mochi が待ってる。一番小さなものから。",
        "きれいな朝。選ぶのはあなた。",
        "自分のペースで。Mochi がそう言ってる。",
        "軽やかに始まる、軽やかに進む。",
      ],
      going: [
        "落ち着いた朝。Mochi も歩いてる。",
        "いいリズム。やさしく保って。",
        "Mochi が見てる。そのまま。",
        "一つずつ、石を積んで。",
        "ゆっくりでいい。一日は広い。",
        "やわらかな始まり、確かな進み。",
      ],
    },
    afternoon: {
      fresh: [
        "Mochi 流の午後。ゆっくりでいい。",
        "小さなことひとつ。今はそれで十分。",
        "Mochi はまだ歩いてる。急がないで。",
        "ちいさなものをひとつ。残りはまだそこに。",
        "静かな日中。予定もいらない。",
        "Mochi がそばに。ここで休んでも。",
      ],
      going: [
        "Mochi も半分。あなたも。",
        "そのまま静かに。残りは待てる。",
        "静かな前進。Mochi も納得。",
        "ペースは保って。押さなくていい。",
        "やわらかな午後。よく進めてる。",
        "もう一つ石を積んで、ひと息。",
      ],
    },
    evening: {
      fresh: [
        "夜。Mochi が丸まる。",
        "ゆるめて。明日にはもっと時間がある。",
        "もうゆっくり。今日はちゃんと働いた。",
        "Mochi は休んでる。あなたも。",
        "静かな時間。もう何もしなくていい。",
        "一日が終わる。Mochi も同じ。",
      ],
      going: [
        "Mochi が落ち着いてる。残りは置いておこう。",
        "静かな終わり。お疲れさま。",
        "最後にやさしいことひとつ — なくてもいい。",
        "明日の石は待ってくれる。",
        "今日の灯を消そう。よく頑張った。",
        "Mochi は満たされてる。あなたもそうなれる。",
      ],
    },
  },
  de: {
    morning: {
      fresh: [
        "Mochi ist da. Heute mach es langsam.",
        "Ruhiger Anfang. Eines nach dem anderen.",
        "Mochi streckt sich. Du kannst auch.",
        "Keine Eile. Der Tag öffnet sich gerade.",
        "Mochi wartet. Nimm das Kleinste.",
        "Ein klarer Morgen. Du hast die Wahl.",
        "Lass dir Zeit. Mochi besteht darauf.",
        "Leichter Anfang, leichte Schritte.",
      ],
      going: [
        "Ruhiger Morgen. Mochi geht mit.",
        "Schöner Rhythmus. Bleib sanft.",
        "Mochi sieht dich. Weiter so.",
        "Ein Stein nach dem anderen.",
        "Locker. Der Tag ist weit.",
        "Sanfter Anfang, echter Fortschritt.",
      ],
    },
    afternoon: {
      fresh: [
        "Nachmittag, Mochi-Art. Langsam ist okay.",
        "Eine kleine Sache — das reicht jetzt.",
        "Mochi geht weiter. Keine Eile.",
        "Nimm etwas Winziges. Der Rest bleibt.",
        "Ruhige Mitte des Tages. Kein Plan nötig.",
        "Mochi ist nah. Du darfst auch rasten.",
      ],
      going: [
        "Mochi ist auf halbem Weg. Du auch.",
        "Bleib dabei. Der Rest kann warten.",
        "Stiller Fortschritt. Mochi nickt.",
        "Halte das Tempo. Kein Drücken nötig.",
        "Sanfter Nachmittag. Du bewegst dich gut.",
        "Ein Stein mehr, dann Atem holen.",
      ],
    },
    evening: {
      fresh: [
        "Abend. Mochi rollt sich ein.",
        "Lass nach. Morgen hat mehr Zeit.",
        "Jetzt langsam. Heute hat seinen Teil getan.",
        "Mochi ruht. Du darfst auch.",
        "Stille Stunde. Mehr braucht es nicht.",
        "Der Tag ist fast vorbei. Mochi auch.",
      ],
      going: [
        "Mochi richtet sich ein. Den Rest aufheben.",
        "Stiller Abschluss. Gut gemacht.",
        "Eine letzte sanfte Sache — oder keine.",
        "Die Steine von morgen können warten.",
        "Lass den Tag aus. Du hast es verdient.",
        "Mochi ist zufrieden. Du auch.",
      ],
    },
  },
};

/**
 * Day-stable seed from an ISO yyyy-mm-dd string. Sums the digit groups so
 * the value rolls over predictably across days but stays steady within
 * a single calendar day.
 */
export function dateSeed(isoDate: string): number {
  return isoDate.split("-").reduce((acc, part) => acc + Number(part), 0);
}

/**
 * Per-language regex for the "pebble" noun(s) used in the brand mascot
 * lines. When the user has opted into theme-from-avatar with a non-
 * default preset, any line matching the language's pattern is filtered
 * out so the mascot voice no longer references pebbles. Patterns cover
 * the singular and plural forms used in the lines above.
 */
const PEBBLE_PATTERNS: Record<Lang, RegExp> = {
  en: /\bpebbles?\b/i,
  zh: /石子|石/,
  es: /\bpiedras?\b/i,
  fr: /\bpierres?\b/i,
  ja: /石/,
  de: /\bSteine?\b/,
};

/**
 * Picks a mascot line for the given locale + time-of-day + plate state.
 * `today` is the local ISO date string used as the rotation seed; passed
 * in (rather than read from a clock) so this function stays pure and
 * testable. Falls back to English if the requested locale is missing
 * (shouldn't happen — all six Lang values are populated). When
 * `dethemePebbles` is true, lines that mention the language's pebble
 * token are dropped from the pool — used when the user has switched
 * to a themed avatar so the mascot voice stops referencing pebbles.
 */
export function pickMascotLine(
  lang: Lang,
  timeOfDay: TimeOfDay,
  plateCount: number,
  today: string,
  dethemePebbles: boolean = false,
): string {
  const set = (MASCOT_LINES[lang] ?? MASCOT_LINES.en)[timeOfDay];
  let variants = plateCount === 0 ? set.fresh : set.going;
  if (dethemePebbles) {
    const pattern = PEBBLE_PATTERNS[lang] ?? PEBBLE_PATTERNS.en;
    const filtered = variants.filter((line) => !pattern.test(line));
    if (filtered.length > 0) variants = filtered;
  }
  return variants[dateSeed(today) % variants.length];
}
