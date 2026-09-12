/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { BILLING_CACHE_VAR_MAP } from './billing-expr'

export const CACHE_MODE_TIMED = 'timed'
export const CACHE_MODE_GENERIC = 'generic'
export type CacheMode = typeof CACHE_MODE_TIMED | typeof CACHE_MODE_GENERIC

export type TierConditionInput = {
  var: 'p' | 'c' | 'len'
  op: '<' | '<=' | '>' | '>='
  value: number | string
}

export type VisualTier = {
  label: string
  conditions: TierConditionInput[]
  input_unit_cost: number
  output_unit_cost: number
  thinking_output_enabled?: boolean
  thinking_output_unit_cost?: number
  thinking_param_path?: string
  audio_output_only?: boolean
  multimodal_output_enabled?: boolean
  multimodal_output_unit_cost?: number
  cache_mode: CacheMode
  cache_read_unit_cost?: number
  cache_create_unit_cost?: number
  cache_create_1h_unit_cost?: number
  image_unit_cost?: number
  image_output_unit_cost?: number
  audio_input_unit_cost?: number
  audio_output_unit_cost?: number
  video_input_unit_cost?: number
  video_output_unit_cost?: number
  audio_duration_unit_cost?: number
  [field: string]: unknown
}

export type VisualConfig = {
  tiers: VisualTier[]
}

export function getTierCacheMode(
  tier: Partial<VisualTier> | null | undefined
): CacheMode {
  if (tier?.cache_mode === CACHE_MODE_TIMED) return CACHE_MODE_TIMED
  if (tier?.cache_mode === CACHE_MODE_GENERIC) return CACHE_MODE_GENERIC
  return Number(tier?.cache_create_1h_unit_cost) > 0
    ? CACHE_MODE_TIMED
    : CACHE_MODE_GENERIC
}

export function normalizeVisualTier(
  tier: Partial<VisualTier> = {}
): VisualTier {
  return {
    label: tier.label ?? '',
    input_unit_cost: Number(tier.input_unit_cost) || 0,
    output_unit_cost: Number(tier.output_unit_cost) || 0,
    thinking_output_enabled: Boolean(tier.thinking_output_enabled),
    thinking_output_unit_cost: Number(tier.thinking_output_unit_cost) || 0,
    thinking_param_path: String(tier.thinking_param_path || 'enable_thinking'),
    audio_output_only: Boolean(tier.audio_output_only),
    multimodal_output_enabled: Boolean(tier.multimodal_output_enabled),
    multimodal_output_unit_cost: Number(tier.multimodal_output_unit_cost) || 0,
    cache_mode: getTierCacheMode(tier),
    conditions: Array.isArray(tier.conditions) ? tier.conditions : [],
    ...tier,
    cache_read_unit_cost: Number(tier.cache_read_unit_cost) || 0,
    cache_create_unit_cost: Number(tier.cache_create_unit_cost) || 0,
    cache_create_1h_unit_cost: Number(tier.cache_create_1h_unit_cost) || 0,
    image_unit_cost: Number(tier.image_unit_cost) || 0,
    image_output_unit_cost: Number(tier.image_output_unit_cost) || 0,
    audio_input_unit_cost: Number(tier.audio_input_unit_cost) || 0,
    audio_output_unit_cost: Number(tier.audio_output_unit_cost) || 0,
    video_input_unit_cost: Number(tier.video_input_unit_cost) || 0,
    video_output_unit_cost: Number(tier.video_output_unit_cost) || 0,
    audio_duration_unit_cost: Number(tier.audio_duration_unit_cost) || 0,
  }
}

export function createDefaultVisualConfig(): VisualConfig {
  return {
    tiers: [
      normalizeVisualTier({
        conditions: [],
        input_unit_cost: 0,
        output_unit_cost: 0,
        label: 'base',
        cache_mode: CACHE_MODE_GENERIC,
      }),
    ],
  }
}

export function normalizeVisualConfig(
  config: VisualConfig | null | undefined
): VisualConfig {
  if (!config || !Array.isArray(config.tiers) || config.tiers.length === 0) {
    return createDefaultVisualConfig()
  }
  return {
    ...config,
    tiers: config.tiers.map((tier) => normalizeVisualTier(tier)),
  }
}

function buildConditionStr(conditions: TierConditionInput[]): string {
  if (!conditions || conditions.length === 0) return ''
  return conditions
    .filter((c) => c.var && c.op && c.value != null && c.value !== '')
    .map((c) => `${c.var} ${c.op} ${c.value}`)
    .join(' && ')
}

function buildTierBodyExpr(tier: VisualTier): string {
  const parts: string[] = []
  const ic = Number(tier.input_unit_cost) || 0
  const oc = Number(tier.output_unit_cost) || 0
  parts.push(`p * ${ic}`)
  if (tier.multimodal_output_enabled) {
    const multimodalPrice = Number(tier.multimodal_output_unit_cost) || 0
    parts.push(`c * (ao > 0 ? 0 : (img + ai + vid > 0 ? ${multimodalPrice} : ${oc}))`)
  } else if (tier.audio_output_only) {
    parts.push(`c * (ao > 0 ? 0 : ${oc})`)
  } else if (tier.thinking_output_enabled) {
    const path = JSON.stringify(tier.thinking_param_path || 'enable_thinking')
    const thinkingPrice = Number(tier.thinking_output_unit_cost) || 0
    parts.push(`c * (param(${path}) == true ? ${thinkingPrice} : ${oc})`)
  } else {
    parts.push(`c * ${oc}`)
  }
  for (const cv of BILLING_CACHE_VAR_MAP) {
    const v = Number((tier as Record<string, unknown>)[cv.field]) || 0
    if (v !== 0) parts.push(`${cv.exprVar} * ${v}`)
  }
  return parts.join(' + ')
}

export function generateExprFromVisualConfig(
  config: VisualConfig | null | undefined
): string {
  if (!config || !config.tiers || config.tiers.length === 0) {
    return 'p * 0 + c * 0'
  }
  const tiers = config.tiers

  if (tiers.length === 1) {
    const tier = tiers[0]
    const label = tier.label || 'default'
    const body = `tier("${label}", ${buildTierBodyExpr(tier)})`
    const cond = buildConditionStr(tier.conditions)
    if (cond) {
      return `${cond} ? ${body} : p * 0 + c * 0`
    }
    return body
  }

  const parts: string[] = []
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]
    const label = tier.label || `tier_${i + 1}`
    const body = `tier("${label}", ${buildTierBodyExpr(tier)})`
    const cond = buildConditionStr(tier.conditions)

    if (i < tiers.length - 1 && cond) {
      parts.push(`${cond} ? ${body}`)
    } else {
      parts.push(body)
    }
  }
  return parts.join(' : ')
}

export function tryParseVisualConfig(
  exprStr: string | null | undefined
): VisualConfig | null {
  if (!exprStr) return null
  try {
    let body = exprStr
    const versionMatch = body.match(/^v\d+:([\s\S]*)$/)
    if (versionMatch) body = versionMatch[1]
    const thinkingOutputs: Record<number, { path: string; thinking: number }> = {}
    const audioOnlyOutputs = new Set<number>()
    const multimodalOutputs: Record<number, number> = {}
    const numeric = '([\\d.eE+-]+)'
    body = body.replace(
      new RegExp(`c\\s*\\*\\s*\\(\\s*ao\\s*>\\s*0\\s*\\?\\s*0\\s*:\\s*\\(\\s*img\\s*\\+\\s*ai\\s*\\+\\s*vid\\s*>\\s*0\\s*\\?\\s*${numeric}\\s*:\\s*${numeric}\\s*\\)\\s*\\)`, 'g'),
      (_match, multimodal: string, standard: string, offset: number) => {
        const tierIndex = Math.max(0, (body.slice(0, offset).match(/tier\(/g) || []).length - 1)
        multimodalOutputs[tierIndex] = Number(multimodal)
        return `c * ${standard}`
      }
    )
    body = body.replace(
      new RegExp(`c\\s*\\*\\s*\\(\\s*ao\\s*>\\s*0\\s*\\?\\s*0\\s*:\\s*${numeric}\\s*\\)`, 'g'),
      (_match, standard: string, offset: number) => {
        const tierIndex = Math.max(0, (body.slice(0, offset).match(/tier\(/g) || []).length - 1)
        audioOnlyOutputs.add(tierIndex)
        return `c * ${standard}`
      }
    )
    body = body.replace(
      new RegExp(`c\\s*\\*\\s*\\(\\s*param\\("([^"]+)"\\)\\s*==\\s*true\\s*\\?\\s*${numeric}\\s*:\\s*${numeric}\\s*\\)`, 'g'),
      (_match, path: string, thinking: string, standard: string, offset: number) => {
        const tierIndex = Math.max(0, (body.slice(0, offset).match(/tier\(/g) || []).length - 1)
        thinkingOutputs[tierIndex] = { path, thinking: Number(thinking) }
        return `c * ${standard}`
      }
    )
    const originalWithoutThinking = body
    const cacheVarNames = BILLING_CACHE_VAR_MAP.map((cv) => cv.exprVar)
    const optCacheStr = cacheVarNames
      .map((v) => `(?:\\s*\\+\\s*${v}\\s*\\*\\s*([\\d.eE+-]+))?`)
      .join('')

    const bodyPat = `p\\s*\\*\\s*([\\d.eE+-]+)\\s*\\+\\s*c\\s*\\*\\s*([\\d.eE+-]+)${optCacheStr}`

    const singleRe = new RegExp(`^tier\\("([^"]*)",\\s*${bodyPat}\\)$`)
    const simple = body.match(singleRe)
    if (simple) {
      const tier: Record<string, unknown> = {
        conditions: [],
        input_unit_cost: Number(simple[2]),
        output_unit_cost: Number(simple[3]),
        label: simple[1],
      }
      if (thinkingOutputs[0]) {
        tier.thinking_output_enabled = true
        tier.thinking_output_unit_cost = thinkingOutputs[0].thinking
        tier.thinking_param_path = thinkingOutputs[0].path
      }
      if (audioOnlyOutputs.has(0)) tier.audio_output_only = true
      if (multimodalOutputs[0] != null) {
        tier.multimodal_output_enabled = true
        tier.multimodal_output_unit_cost = multimodalOutputs[0]
      }
      BILLING_CACHE_VAR_MAP.forEach((cv, i) => {
        const val = simple[4 + i]
        if (val != null) tier[cv.field] = Number(val)
      })
      return normalizeVisualConfig({
        tiers: [normalizeVisualTier(tier as Partial<VisualTier>)],
      })
    }

    const condGroup =
      `((?:(?:p|c|len)\\s*(?:<|<=|>|>=)\\s*[\\d.eE+]+)` +
      `(?:\\s*&&\\s*(?:p|c|len)\\s*(?:<|<=|>|>=)\\s*[\\d.eE+]+)*)`
    const tierRe = new RegExp(
      `(?:${condGroup}\\s*\\?\\s*)?tier\\("([^"]*)",\\s*${bodyPat}\\)`,
      'g'
    )
    const tiers: VisualTier[] = []
    let tierIndex = 0
    let match: RegExpExecArray | null
    while ((match = tierRe.exec(body)) !== null) {
      const condStr = match[1] || ''
      const conditions: TierConditionInput[] = []
      if (condStr) {
        for (const cp of condStr.split(/\s*&&\s*/)) {
          const cm = cp.trim().match(/^(p|c|len)\s*(<|<=|>|>=)\s*([\d.eE+]+)$/)
          if (cm) {
            conditions.push({
              var: cm[1] as TierConditionInput['var'],
              op: cm[2] as TierConditionInput['op'],
              value: Number(cm[3]),
            })
          }
        }
      }
      const tier: Record<string, unknown> = {
        conditions,
        input_unit_cost: Number(match[3]),
        output_unit_cost: Number(match[4]),
        label: match[2],
      }
      if (thinkingOutputs[tierIndex]) {
        tier.thinking_output_enabled = true
        tier.thinking_output_unit_cost = thinkingOutputs[tierIndex].thinking
        tier.thinking_param_path = thinkingOutputs[tierIndex].path
      }
      if (audioOnlyOutputs.has(tierIndex)) tier.audio_output_only = true
      if (multimodalOutputs[tierIndex] != null) {
        tier.multimodal_output_enabled = true
        tier.multimodal_output_unit_cost = multimodalOutputs[tierIndex]
      }
      tierIndex += 1
      const m = match
      BILLING_CACHE_VAR_MAP.forEach((cv, i) => {
        const val = m[5 + i]
        if (val != null) tier[cv.field] = Number(val)
      })
      tiers.push(normalizeVisualTier(tier as Partial<VisualTier>))
    }
    if (tiers.length === 0) return null

    const cfg = normalizeVisualConfig({ tiers })
    const regenerated = generateExprFromVisualConfig(cfg)
    const regeneratedWithoutThinking = regenerated.replace(
      new RegExp(`c\\s*\\*\\s*\\(\\s*param\\("([^"]+)"\\)\\s*==\\s*true\\s*\\?\\s*${numeric}\\s*:\\s*${numeric}\\s*\\)`, 'g'),
      (_match, _path: string, _thinking: string, standard: string) => `c * ${standard}`
    )
    const regeneratedWithoutOutputModes = regeneratedWithoutThinking.replace(
      new RegExp(`c\\s*\\*\\s*\\(\\s*ao\\s*>\\s*0\\s*\\?\\s*0\\s*:\\s*${numeric}\\s*\\)`, 'g'),
      (_match, standard: string) => `c * ${standard}`
    )
    const regeneratedWithoutMultimodalOutput = regeneratedWithoutOutputModes.replace(
      new RegExp(`c\\s*\\*\\s*\\(\\s*ao\\s*>\\s*0\\s*\\?\\s*0\\s*:\\s*\\(\\s*img\\s*\\+\\s*ai\\s*\\+\\s*vid\\s*>\\s*0\\s*\\?\\s*${numeric}\\s*:\\s*${numeric}\\s*\\)\\s*\\)`, 'g'),
      (_match, _multimodal: string, standard: string) => `c * ${standard}`
    )
    if (regeneratedWithoutMultimodalOutput.replace(/\s+/g, '') !== originalWithoutThinking.replace(/\s+/g, '')) {
      return null
    }
    return cfg
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Local cost evaluator (for the estimator preview)
// ---------------------------------------------------------------------------

const ESTIMATOR_VARS = [
  { var: 'cr', stateKey: 'cacheReadTokens' },
  { var: 'cc', stateKey: 'cacheCreateTokens' },
  { var: 'cc1h', stateKey: 'cacheCreate1hTokens' },
  { var: 'img', stateKey: 'imageTokens' },
  { var: 'img_o', stateKey: 'imageOutputTokens' },
  { var: 'ai', stateKey: 'audioInputTokens' },
  { var: 'ao', stateKey: 'audioOutputTokens' },
  { var: 'vid', stateKey: 'videoInputTokens' },
  { var: 'vid_o', stateKey: 'videoOutputTokens' },
  { var: 'aud_s', stateKey: 'audioDurationSeconds' },
] as const

export type ExtraTokenValues = Record<
  (typeof ESTIMATOR_VARS)[number]['stateKey'],
  number
>

export type EvalResult = {
  cost: number
  matchedTier: string
  error: string | null
}

export function evalExprLocally(
  exprStr: string,
  promptTokens: number,
  completionTokens: number,
  extraTokenValues: ExtraTokenValues,
  requestParams: Record<string, unknown> = {}
): EvalResult {
  try {
    if (!exprStr || !exprStr.trim()) {
      return { cost: 0, matchedTier: '', error: null }
    }
    let matchedTier = ''
    const tierFn = (name: string, value: number) => {
      matchedTier = name
      return value
    }
    const cacheReadTokens = extraTokenValues.cacheReadTokens || 0
    const cacheCreateTokens = extraTokenValues.cacheCreateTokens || 0
    const cacheCreate1hTokens = extraTokenValues.cacheCreate1hTokens || 0
    const len =
      promptTokens + cacheReadTokens + cacheCreateTokens + cacheCreate1hTokens
    const env: Record<string, unknown> = {
      p: promptTokens,
      c: completionTokens,
      len,
      tier: tierFn,
      max: Math.max,
      min: Math.min,
      abs: Math.abs,
      ceil: Math.ceil,
      floor: Math.floor,
      param: (path: string) => requestParams[path],
      // Request-usage expressions are also editable in the generic expression
      // tab. The token estimator has no media request facts, so use zero rather
      // than throwing "u is not defined". The advanced media editor remains
      // the authoritative preview for these rules.
      u: (_name: string) => 0,
    }
    for (const field of ESTIMATOR_VARS) {
      env[field.var] = extraTokenValues[field.stateKey] || 0
    }
    const fn = new Function(
      ...Object.keys(env),
      `"use strict"; return (${exprStr});`
    )
    const cost = Number(fn(...Object.values(env))) || 0
    return { cost, matchedTier, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { cost: 0, matchedTier: '', error: message }
  }
}

export function exprUsesExtraVars(exprStr: string): boolean {
  if (!exprStr) return false
  const varNames = ESTIMATOR_VARS.map((f) => f.var).join('|')
  return new RegExp(`\\b(${varNames})\\b`).test(exprStr)
}

export const ESTIMATOR_EXTRA_FIELDS = ESTIMATOR_VARS
