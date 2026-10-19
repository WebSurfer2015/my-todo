import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { interfaceShape, literalMembers, matchBrace, stripComments, typeAliasRhs } from './contractShape'

/**
 * Drift guard for the hand-duplicated aiInfer wire contract.
 *
 * The CLIENT contract lives in core/src/ports/aiContracts.ts (shared by
 * web + mobile). The SERVER owns its own copies in functions/src/
 * aiInfer*.ts because the functions package is deployed standalone with a
 * separate tsconfig and genuinely CANNOT import core/ — so the field shapes
 * are copied. If the server renames/adds/removes/re-optionalizes a field,
 * the client silently parses the old shape until something checks.
 *
 * This reads every side as text (an fs read, not an import — no arch-boundary
 * violation; test files are exempt anyway). Nothing is hand-listed:
 *  - the SERVER modes come from its dispatch registry (`MODES` in aiInfer.ts):
 *    each entry's `validateInput: validate<X>Input` names the mode's prefix
 *    X, and the import of that validator names the server file holding
 *    `<X>Input` / `<X>Output`;
 *  - the CLIENT modes come from the adapter's `callAiInfer<<X>Result>('mode')`
 *    calls (mobile/src/adapters/aiInfer.ts), with `<X>Input` / `<X>Result` in
 *    core/src/ports/aiContracts.ts.
 * Per mode it compares the RECURSIVE shape (contractShape.ts): field names +
 * optionality, nested inline objects / same-file interfaces, and the members
 * of string-literal union leaves.
 */

const CLIENT_CONTRACT = resolve(__dirname, '../../../core/src/ports/aiContracts.ts')
const CLIENT_ADAPTER = resolve(__dirname, '../adapters/aiInfer.ts')
const SRV = (f: string) => resolve(__dirname, `../../../functions/src/${f}`)

interface ServerMode {
  mode: string
  prefix: string
  file: string
}

/** Modes from the server's dispatch registry (`export const MODES … = {…}`). */
function serverModes(dispatcher: string): ServerMode[] {
  const src = stripComments(dispatcher)
  const at = src.search(/export const MODES\b[^=]*=\s*\{/)
  if (at < 0) throw new Error('MODES registry not found')
  const open = src.indexOf('{', src.indexOf('=', at))
  const body = src.slice(open + 1, matchBrace(src, open))
  const out: ServerMode[] = []
  const entryRe = /'([\w-]+)'\s*:\s*\{/g
  let m: RegExpExecArray | null
  while ((m = entryRe.exec(body))) {
    const entryOpen = m.index + m[0].length - 1
    const entry = body.slice(entryOpen, matchBrace(body, entryOpen))
    entryRe.lastIndex = entryOpen + entry.length
    const v = entry.match(/validateInput:\s*validate(\w+)Input\b/)
    if (!v) throw new Error(`mode ${m[1]}: no validate<X>Input`)
    const imp = new RegExp(`import\\s*\\{[^}]*\\bvalidate${v[1]}Input\\b[^}]*\\}\\s*from\\s*'\\./([\\w]+)'`).exec(src)
    if (!imp) throw new Error(`mode ${m[1]}: validator import not found`)
    out.push({ mode: m[1], prefix: v[1], file: `${imp[1]}.ts` })
  }
  return out
}

/** mode → client result prefix, from `callAiInfer<XResult>('mode'`. */
function clientModes(adapter: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /callAiInfer<(\w+)Result>\(\s*'([\w-]+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(adapter))) out[m[2]] = m[1]
  return out
}

const dispatcher = readFileSync(SRV('aiInfer.ts'), 'utf8')
const server = serverModes(dispatcher)
const client = clientModes(readFileSync(CLIENT_ADAPTER, 'utf8'))
const clientContract = readFileSync(CLIENT_CONTRACT, 'utf8')

describe('aiInfer contract client↔server parity', () => {
  it('derives the mode list from the server registry, matching its `Mode` union', () => {
    expect(server.length).toBeGreaterThan(0)
    const rhs = typeAliasRhs(dispatcher, 'Mode')
    expect(rhs, 'server `type Mode = …` not found').not.toBeNull()
    expect(literalMembers(dispatcher, rhs as string)).toEqual(server.map((s) => s.mode).sort())
  })

  it('the client calls exactly the modes the server dispatches', () => {
    expect(Object.keys(client).sort()).toEqual(server.map((s) => s.mode).sort())
  })

  for (const { mode, prefix, file } of server) {
    const serverSrc = readFileSync(SRV(file), 'utf8')

    it(`${mode}: client and server use the same type prefix (${prefix})`, () => {
      expect(client[mode]).toBe(prefix)
    })

    it(`${mode}: input shape matches (recursive, incl. literal leaves)`, () => {
      expect(interfaceShape(clientContract, `${prefix}Input`)).toEqual(interfaceShape(serverSrc, `${prefix}Input`))
    })

    it(`${mode}: output shape matches (recursive, incl. literal leaves)`, () => {
      expect(interfaceShape(clientContract, `${prefix}Result`)).toEqual(interfaceShape(serverSrc, `${prefix}Output`))
    })
  }

  it('recursion reaches nested fields (self-test)', () => {
    const a = "interface XOutput { items: Array<{ id: string; kind: 'a' | 'b' }>; meta?: M }\ninterface M { n: number }\n"
    const b = "interface XOutput { items: Array<{ id: string; kind: 'a' | 'c' }>; meta?: M }\ninterface M { n?: number }\n"
    expect(interfaceShape(a, 'XOutput')).toEqual({
      $: ['items', 'meta?'],
      '$.items[]': ['id', 'kind'],
      '$.items[].kind:literals': ['a', 'b'],
      '$.meta': ['n'],
    })
    expect(interfaceShape(a, 'XOutput')).not.toEqual(interfaceShape(b, 'XOutput'))
  })
})
