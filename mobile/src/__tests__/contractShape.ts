/**
 * Test-only TEXT parser shared by the client↔server contract parity tests
 * (proposedOperation-parity, aiInfer-contract-parity). The functions package
 * can't import core/ (and mobile must not import functions/), so the parity
 * tests read both sides as source text and compare a normalized SHAPE:
 *
 *   `<path>`             → sorted field keys (`name`, `name?` when optional)
 *   `<path>.<field>:literals` → sorted string-literal members, for a leaf whose
 *                          type is a string-literal union — inline
 *                          (`'a' | 'b'`, `| null` ignored) or a same-file alias
 *                          (`type Priority = 'high' | …`).
 *
 * It recurses into inline objects (`{…}`, `Array<{…}>`) and same-file
 * interfaces (`Name`, `Name[]`, `Array<Name>`). Other leaf types (string,
 * number, differently-named aliases of non-literal types) are ignored, so
 * naming/formatting differences don't false-positive.
 */

export interface Field {
  key: string // name + '?' when optional
  type: string
}

export const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/** Index of the `}` matching the `{` at `open`. */
export function matchBrace(s: string, open: number): number {
  let depth = 0
  for (let j = open; j < s.length; j++) {
    if (s[j] === '{') depth++
    else if (s[j] === '}' && --depth === 0) return j
  }
  throw new Error('unbalanced braces')
}

/** Top-level `name: type` / `name?: type` members of an object-type body. */
export function topLevelFields(bodyRaw: string): Field[] {
  const body = stripComments(bodyRaw)
  const fields: Field[] = []
  let depth = 0
  let token = ''
  const flush = () => {
    const t = token.trim()
    token = ''
    const fm = t.match(/^(\w+)\s*(\??)\s*:\s*([\s\S]*)$/)
    if (fm) fields.push({ key: fm[1] + (fm[2] ? '?' : ''), type: fm[3].trim() })
  }
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '{' || ch === '<' || ch === '(') depth++
    else if (ch === '}' || ch === '>' || ch === ')') depth--
    // Members end at `;` / `,` / newline (no-semicolon style) — except a
    // newline whose next line continues a union (`  | 'b'`).
    const continuesUnion = ch === '\n' && /^\s*\|/.test(body.slice(i + 1))
    if ((ch === ';' || ch === ',' || (ch === '\n' && !continuesUnion)) && depth === 0) {
      flush()
      continue
    }
    token += ch
  }
  flush()
  return fields
}

/** Body of `interface <name> { … }` in `src`, or null. */
export function interfaceBody(src: string, name: string): string | null {
  const m = new RegExp(`interface\\s+${name}\\s*\\{`).exec(src)
  if (!m) return null
  const open = m.index + m[0].length - 1
  return src.slice(open + 1, matchBrace(src, open))
}

/** The right-hand side of `type <name> = …` (single statement), or null. */
export function typeAliasRhs(src: string, name: string): string | null {
  const m = new RegExp(`\\btype\\s+${name}\\s*=\\s*([^;\\n]+(?:\\n\\s*\\|[^;\\n]+)*)`).exec(
    stripComments(src),
  )
  return m ? m[1].trim() : null
}

/** Sorted string-literal members of a leaf type, or null when it isn't a
 * string-literal union (after dropping `null` / `undefined`). */
export function literalMembers(src: string, type: string, seen = new Set<string>()): string[] | null {
  const t = type.trim()
  const alias = t.match(/^(\w+)$/)
  if (alias) {
    if (seen.has(alias[1])) return null
    seen.add(alias[1])
    const rhs = typeAliasRhs(src, alias[1])
    return rhs === null ? null : literalMembers(src, rhs, seen)
  }
  const parts = t
    .replace(/^\|/, '')
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p && p !== 'null' && p !== 'undefined')
  if (parts.length === 0 || !parts.every((p) => /^'[^']*'$/.test(p))) return null
  return parts.map((p) => p.slice(1, -1)).sort()
}

/** Flatten an object type into the shape map described in the file header. */
export function shape(src: string, path: string, body: string, out: Record<string, string[]>): void {
  const fields = topLevelFields(body)
  out[path] = fields.map((f) => f.key).sort()
  for (const f of fields) {
    const name = f.key.replace('?', '')
    const inline = f.type.indexOf('{')
    if (inline >= 0) {
      const isArray = /^Array\s*</.test(f.type)
      shape(src, `${path}.${name}${isArray ? '[]' : ''}`, f.type.slice(inline + 1, matchBrace(f.type, inline)), out)
      continue
    }
    const lits = literalMembers(src, f.type)
    if (lits) {
      out[`${path}.${name}:literals`] = lits
      continue
    }
    const named = f.type.match(/^(?:Array\s*<\s*)?(\w+)\s*>?\s*(\[\])?$/)
    if (!named) continue
    const iface = interfaceBody(src, named[1])
    if (iface !== null) {
      const isArray = !!named[2] || /^Array\s*</.test(f.type)
      shape(src, `${path}.${name}${isArray ? '[]' : ''}`, iface, out)
    }
  }
}

/** Shape map of a whole same-file interface, rooted at `root` (so two
 * differently-named interfaces compare equal). Throws when it isn't found. */
export function interfaceShape(src: string, name: string, root = '$'): Record<string, string[]> {
  const body = interfaceBody(src, name)
  if (body === null) throw new Error(`interface ${name} not found`)
  const out: Record<string, string[]> = {}
  shape(src, root, body, out)
  return out
}
