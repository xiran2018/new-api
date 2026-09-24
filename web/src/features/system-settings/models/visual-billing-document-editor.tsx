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
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableRowActionMenu } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  formatPricingAmount,
  type PricingCurrency,
} from '@/features/model-pricing/currency'
import { PricingAmountInput } from '@/features/model-pricing/pricing-amount-input'
import { BILLING_VARS } from '@/features/pricing/lib/billing-expr'
import { formatBillingCondition } from '@/features/pricing/lib/billing-expression/condition-display'
import {
  visualConditionExpression,
  visualNodeId,
  createEmptyVisualCondition,
  type VisualBillingDocument,
  type VisualBillingIssue,
  type VisualPricingNode,
  type VisualCondition,
} from '@/features/pricing/lib/billing-expression/visual'

import { TierPriceFields } from './tier-price-fields'
import { VisualConditionTree } from './visual-condition-tree'
import {
  PlatformVisualBillingDocumentEditor,
  supportsPlatformVisualBillingDocumentEditor,
} from '@/platform/model-prices/visual-billing-document-editor'

type PricingNodeProps = {
  node: VisualPricingNode
  source: string
  currency: PricingCurrency
  issues: VisualBillingIssue[]
  onChange: (node: VisualPricingNode) => void
}

function tokenLengthLabel(value: string): string | null {
  if (!value.trim()) return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const scale = amount >= 1_000_000_000 ? [1_000_000_000, 'B']
    : amount >= 1_000_000 ? [1_000_000, 'M'] : [1_000, 'K']
  return amount >= 1_000
    ? `${Number((amount / Number(scale[0])).toFixed(2))}${scale[1]}`
    : String(amount)
}

function syncDefaultTierNames(
  root: Extract<VisualPricingNode, { kind: 'branch' }>,
  previous: VisualCondition,
  next: VisualCondition
): Extract<VisualPricingNode, { kind: 'branch' }> {
  const replacements: [string, string][] = []
  const collect = (old: VisualCondition, updated: VisualCondition) => {
    if (old.kind === 'comparison' && updated.kind === 'comparison' &&
        old.probe === 'len' && updated.probe === 'len' && old.value !== updated.value) {
      const oldLabel = tokenLengthLabel(old.value)
      const newLabel = tokenLengthLabel(updated.value)
      if (oldLabel && newLabel) replacements.push([oldLabel, newLabel])
    } else if ((old.kind === 'all' || old.kind === 'any') &&
               (updated.kind === 'all' || updated.kind === 'any')) {
      old.children.forEach((child, index) => {
        if (updated.children[index]) collect(child, updated.children[index])
      })
    }
  }
  collect(previous, next)
  if (replacements.length === 0) return root
  // Only rename generated numeric-range labels. A manually named tier is left alone.
  const numericRange = /^(?:\d+(?:\.\d+)?[KMB]?(?:-|\+|\s)|≤\s*\d)/i
  const rename = (node: VisualPricingNode): VisualPricingNode => {
    if (node.kind === 'branch') {
      return { ...node, yes: rename(node.yes), no: rename(node.no) }
    }
    if (!numericRange.test(node.label)) return node
    let label = node.label
    for (const [oldLabel, newLabel] of replacements) {
      const escaped = oldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const matchingBoundary = new RegExp(`(^|[^\\d.KMB])${escaped}(?![\\d.KMB])`, 'gi')
      label = label.replace(matchingBoundary, `$1${newLabel}`)
    }
    return { ...node, label }
  }
  return { ...root, yes: rename(root.yes), no: rename(root.no) }
}

function PricingTierFields(
  props: PricingNodeProps & {
    node: Extract<VisualPricingNode, { kind: 'tier' }>
    scopeId: string
  }
) {
  const { t } = useTranslation()
  const node = props.node
  const issues = props.issues.filter(
    (issue) => issue.id === node.id || issue.id.startsWith(`${node.id}:`)
  )
  return (
    <div className='min-w-0 space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <Badge variant='secondary'>{t('Tier')}</Badge>
          <Input
            aria-label={t('Tier name')}
            value={node.label}
            onChange={(event) =>
              props.onChange({ ...node, label: event.target.value })
            }
            className='w-40 max-w-full'
          />
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() =>
            props.onChange({
              id: visualNodeId(),
              kind: 'branch',
              condition: createEmptyVisualCondition(),
              yes: {
                ...node,
                id: visualNodeId(),
                origin: undefined,
                prices: node.prices.map(({ variable, value }) => ({
                  variable,
                  value,
                })),
              },
              no: node,
            })
          }
        >
          {t('Add pricing branch')}
        </Button>
      </div>
      <TierPriceFields
        currency={props.currency}
        billingUnit={node.billingUnit}
        fixedPrice={node.fixedPrice}
        onBillingUnitChange={(billingUnit) =>
          props.onChange({
            ...node,
            billingUnit,
            prices:
              billingUnit === 'token' && node.prices.length === 0
                ? [
                    { variable: 'p', value: '0' },
                    { variable: 'c', value: '0' },
                  ]
                : node.prices,
          })
        }
        onFixedPriceChange={(fixedPrice) =>
          props.onChange({ ...node, fixedPrice })
        }
        prices={Object.fromEntries(
          node.prices.map((price) => [price.variable, price.value])
        )}
        invalidVariables={issues.map((issue) =>
          issue.id.slice(node.id.length + 1)
        )}
        scope={node.label}
        scopeId={props.scopeId}
        onChange={(variable, value) =>
          props.onChange({
            ...node,
            prices: node.prices.map((price) =>
              price.variable === variable ? { ...price, value } : price
            ),
          })
        }
        onInclude={(variable, included) =>
          props.onChange({
            ...node,
            prices: included
              ? [...node.prices, { variable, value: '0' }]
              : node.prices.filter((price) => price.variable !== variable),
          })
        }
      />
      {issues.map((issue) => (
        <p
          role='alert'
          key={`${issue.id}:${issue.message}`}
          className='text-destructive text-xs'
        >
          {t(issue.message)}
        </p>
      ))}
    </div>
  )
}

function PricingRuleCard(
  props: PricingNodeProps & {
    number: string
    first: boolean
    fallback: boolean
    onRemove?: () => void
  }
) {
  const { t, i18n } = useTranslation()
  const node = props.node
  const [open, setOpen] = useState(props.first)
  const tier = node.kind === 'tier' ? node : node.yes
  const name =
    tier.kind === 'tier'
      ? tier.label
      : t('Pricing rule {{number}}', { number: props.number })
  const condition =
    node.kind === 'branch'
      ? visualConditionExpression(node.condition, props.source)
      : null
  const description =
    condition && formatBillingCondition(condition, t, i18n.language)
  let matchDescription = description || t('Tier conditions')
  if (node.kind === 'tier') {
    matchDescription = props.fallback
      ? t('No preceding rule matched')
      : t('Always matches (default tier).')
  } else if (!props.first) {
    matchDescription = t('If no preceding rule matched: {{condition}}', {
      condition: matchDescription,
    })
  }

  // A later rule owns its conditions and matched subtree, but not the following fallback rules.
  const ids = new Set<string>()
  const pending: (VisualPricingNode | VisualCondition)[] =
    node.kind === 'tier' ? [node] : [node.condition, node.yes]
  for (let index = 0; index < pending.length; index++) {
    const current = pending[index]
    ids.add(current.id)
    if (current.kind === 'branch') {
      pending.push(current.condition, current.yes, current.no)
    }
    if (current.kind === 'all' || current.kind === 'any') {
      pending.push(...current.children)
    }
    if (current.kind === 'not') pending.push(current.child)
  }
  const hasIssues = props.issues.some((issue) =>
    ids.has(issue.id.split(':')[0])
  )
  useEffect(() => {
    if (hasIssues) setOpen(true)
  }, [hasIssues])

  return (
    <Collapsible
      open={open || hasIssues}
      onOpenChange={setOpen}
      render={
        <section
          role='group'
          aria-label={t('Pricing tier {{name}}', { name })}
        />
      }
      className='bg-background min-w-0 overflow-hidden rounded-xl border data-open:border-blue-300 dark:data-open:border-blue-800'
    >
      <div className='flex items-start gap-1 p-3'>
        <CollapsibleTrigger
          aria-label={t('Edit pricing rule {{name}}', { name })}
          className='flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2'
        >
          <Badge variant='secondary' className='mt-0.5 shrink-0 tabular-nums'>
            {props.number}
          </Badge>
          <span className='min-w-0 flex-1 space-y-2'>
            <span className='flex flex-wrap items-center gap-2 font-medium'>
              <span className='break-all'>{name}</span>
              {props.fallback && (
                <Badge variant='outline'>{t('Fallback tier')}</Badge>
              )}
            </span>
            <span className='text-muted-foreground block text-sm break-words'>
              {matchDescription}
            </span>
            {tier.kind === 'tier' && (
              <span className='flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums'>
                {tier.billingUnit === 'request' ? (
                  <span>
                    {t('Price per request')}:{' '}
                    {formatPricingAmount(tier.fixedPrice, props.currency) ||
                      '—'}
                    /{t('request')}
                  </span>
                ) : (
                  <>
                    {tier.prices.map((price) => (
                      <span key={price.variable}>
                        {t(
                          BILLING_VARS.find(
                            (variable) => variable.key === price.variable
                          )?.shortLabel ?? price.variable
                        )}
                        :{' '}
                        {formatPricingAmount(price.value, props.currency) ||
                          '—'}
                      </span>
                    ))}
                    <span className='text-muted-foreground'>
                      /{t('1M token')}
                    </span>
                  </>
                )}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden='true'
            className={`mt-1 size-4 shrink-0 transition-transform ${open || hasIssues ? 'rotate-180' : ''}`}
          />
        </CollapsibleTrigger>
        {tier.kind === 'tier' && (
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={t('Edit tier name')}
            title={t('Edit tier name')}
            onClick={() => setOpen(true)}
          >
            <Pencil aria-hidden='true' className='size-4' />
          </Button>
        )}
        {node.kind === 'branch' && (
          <DataTableRowActionMenu
            ariaLabel={t('Branch actions {{path}}', { path: props.number })}
          >
            <DropdownMenuItem
              variant='destructive'
              onClick={() =>
                props.onRemove ? props.onRemove() : props.onChange(node.no)
              }
            >
              {t('Remove branch')}
            </DropdownMenuItem>
          </DataTableRowActionMenu>
        )}
      </div>
      <CollapsibleContent keepMounted className='border-t p-3'>
        <div className='space-y-4'>
          {node.kind === 'branch' && (
            <div className='space-y-2'>
              <p className='text-sm font-medium'>{t('Tier conditions')}</p>
              <VisualConditionTree
                node={node.condition}
                path={props.number}
                issues={props.issues}
                onChange={(condition) => props.onChange({
                  ...syncDefaultTierNames(node, node.condition, condition),
                  condition,
                })}
              />
            </div>
          )}
          {tier.kind === 'tier' ? (
            <PricingTierFields
              {...props}
              node={tier}
              scopeId={props.number}
              onChange={(next) =>
                props.onChange(
                  node.kind === 'tier' ? next : { ...node, yes: next }
                )
              }
            />
          ) : (
            <div className='space-y-3 border-l-2 pl-3'>
              <p className='text-sm font-medium'>
                {t('When conditions match')}
              </p>
              <PricingRuleList
                {...props}
                node={tier}
                prefix={`${props.number}.`}
                onChange={(yes) =>
                  node.kind === 'branch' && props.onChange({ ...node, yes })
                }
              />
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function cloneConditionForNewTier(condition: VisualCondition): VisualCondition {
  if (condition.kind === 'all' || condition.kind === 'any') {
    return {
      ...condition,
      id: visualNodeId(),
      origin: undefined,
      children: condition.children.map(cloneConditionForNewTier),
    }
  }
  if (condition.kind === 'not') {
    return {
      ...condition,
      id: visualNodeId(),
      origin: undefined,
      child: cloneConditionForNewTier(condition.child),
    }
  }
  return { ...condition, id: visualNodeId(), origin: undefined }
}

function PricingRuleList(props: PricingNodeProps & { prefix: string }) {
  const { t } = useTranslation()
  const rules: VisualPricingNode[] = []
  let current = props.node
  while (current.kind === 'branch') {
    rules.push(current)
    current = current.no
  }
  rules.push(current)
  const removeRule = (index: number) => {
    const node = rules[index]
    if (!node) return
    let root: VisualPricingNode
    let firstWrappedIndex = index - 1
    const isFinalModeRule =
      node.kind === 'branch' &&
      node.condition.kind === 'request-comparison' &&
      node.no.kind === 'tier' &&
      index === rules.length - 2
    if (isFinalModeRule) {
      // A final mode rule is stored as a condition followed by a fallback
      // tier. Removing it must remove both modes and promote the preceding
      // tier to the fallback so the expression remains valid.
      const predecessor = rules[index - 1]
      root = predecessor.kind === 'branch' ? predecessor.yes : predecessor
      firstWrappedIndex = index - 2
    } else if (index === rules.length - 1) {
      root = node
    } else {
      root = node.kind === 'branch' ? node.no : rules[index + 1]
    }
    for (let previous = firstWrappedIndex; previous >= 0; previous--) {
      const branch = rules[previous]
      if (branch.kind === 'branch') root = { ...branch, no: root }
    }
    props.onChange(root)
  }
  const addRule = () => {
    const finalModeRule = rules.length >= 2
      ? rules.at(-2)
      : undefined
    const hasFinalModeRule = finalModeRule?.kind === 'branch' &&
      finalModeRule.condition.kind === 'request-comparison' &&
      finalModeRule.no.kind === 'tier'
    const fallback = hasFinalModeRule ? finalModeRule : rules.at(-1)
    if (!fallback || (fallback.kind !== 'tier' && !hasFinalModeRule)) return
    const previousBranch = rules.at(hasFinalModeRule ? -3 : -2)
    const condition = previousBranch?.kind === 'branch'
      ? cloneConditionForNewTier(previousBranch.condition)
      : createEmptyVisualCondition()
    if (condition.kind === 'comparison' && condition.probe === 'len') {
      const current = Number(condition.value)
      if (Number.isFinite(current) && current > 0) {
        condition.value = String(Math.round(current * 2))
      }
    }
    const cloneFallback = (node: VisualPricingNode): VisualPricingNode => {
      if (node.kind === 'tier') {
        const lower = node.label.toLowerCase()
        const suffix = lower.includes('non-thinking')
          ? ' non-thinking'
          : lower.includes('thinking') ? ' thinking' : ''
        return {
          ...node,
          id: visualNodeId(),
          origin: undefined,
          label: `${t('New pricing tier')}${suffix}`,
          prices: node.prices.map(({ variable, value }) => ({ variable, value })),
          sharedPrices: node.sharedPrices?.map(({ variable, value }) => ({ variable, value })),
        }
      }
      return {
        ...node,
        id: visualNodeId(),
        origin: undefined,
        condition: cloneConditionForNewTier(node.condition),
        yes: cloneFallback(node.yes),
        no: cloneFallback(node.no),
      }
    }
    const inserted: VisualPricingNode = {
      id: visualNodeId(),
      kind: 'branch',
      condition,
      yes: cloneFallback(fallback),
      no: fallback,
    }
    let root: VisualPricingNode = inserted
    const firstWrappedIndex = hasFinalModeRule ? rules.length - 3 : rules.length - 2
    for (let previous = firstWrappedIndex; previous >= 0; previous--) {
      const branch = rules[previous]
      if (branch.kind === 'branch') root = { ...branch, no: root }
    }
    props.onChange(root)
  }
  return (
    <div className='space-y-3'>
      <ol aria-label={t('Pricing rules')} className='min-w-0 space-y-3'>
        {rules.map((node, index) => (
          <li key={node.id} className='min-w-0'>
            <PricingRuleCard
              {...props}
              node={node}
              number={`${props.prefix}${index + 1}`}
              first={index === 0}
              fallback={index > 0 && node.kind === 'tier'}
              onRemove={() => removeRule(index)}
              onChange={(next) => {
                let root = next
                for (let previous = index - 1; previous >= 0; previous--) {
                  const branch = rules[previous]
                  if (branch.kind === 'branch') root = { ...branch, no: root }
                }
                props.onChange(root)
              }}
            />
          </li>
        ))}
      </ol>
      <Button type='button' variant='outline' size='sm' onClick={addRule}>
        <Plus className='mr-2 size-4' />
        {t('Add pricing tier')}
      </Button>
    </div>
  )
}

function SharedThinkingPriceEditor(props: {
  document: VisualBillingDocument
  currency: PricingCurrency
  issues: VisualBillingIssue[]
  onChange: (document: VisualBillingDocument) => void
}) {
  const { t } = useTranslation()
  const shared = props.document.shared!
  const branch = props.document.root as Extract<VisualPricingNode, { kind: 'branch' }>
  const thinking = branch.yes as Extract<VisualPricingNode, { kind: 'tier' }>
  const standard = branch.no as Extract<VisualPricingNode, { kind: 'tier' }>
  const fields = [
    { label: t('Input price'), price: shared.prices[0], id: shared.id,
      update: (value: string) => props.onChange({ ...props.document, shared: { ...shared, prices: [{ ...shared.prices[0], value }] } }) },
    { label: t('Non-thinking output price'), price: standard.prices[0], id: standard.id,
      update: (value: string) => props.onChange({ ...props.document, root: { ...branch, no: { ...standard, prices: [{ ...standard.prices[0], value }] } } }) },
    { label: t('Thinking output price'), price: thinking.prices[0], id: thinking.id,
      update: (value: string) => props.onChange({ ...props.document, root: { ...branch, yes: { ...thinking, prices: [{ ...thinking.prices[0], value }] } } }) },
  ]
  return (
    <div className='grid gap-4 sm:grid-cols-3'>
      {fields.map((field) => (
        <label key={field.id} className='min-w-0 space-y-2 text-sm font-medium'>
          <span>{field.label}</span>
          <PricingAmountInput
            aria-label={field.label}
            currency={props.currency}
            value={field.price.value}
            onChange={field.update}
            aria-invalid={props.issues.some((issue) => issue.id === `${field.id}:${field.price.variable}`) || undefined}
          />
          <span className='text-muted-foreground block text-xs font-normal'>
            {props.currency.symbol}/{t('1M token')}
          </span>
        </label>
      ))}
    </div>
  )
}

function isSharedThinkingPrice(document: VisualBillingDocument): boolean {
  const branch = document.root
  return document.shared?.prices.length === 1 &&
    document.shared.prices[0].variable === 'p' &&
    branch.kind === 'branch' &&
    branch.condition.kind === 'request-comparison' &&
    branch.condition.source === 'param' &&
    branch.condition.path === 'enable_thinking' &&
    branch.condition.operator === '==' &&
    branch.condition.value === true &&
    branch.yes.kind === 'tier' && branch.no.kind === 'tier' &&
    branch.yes.billingUnit === 'token' && branch.no.billingUnit === 'token' &&
    branch.yes.prices.length === 1 && branch.yes.prices[0].variable === 'c' &&
    branch.no.prices.length === 1 && branch.no.prices[0].variable === 'c'
}

type SharedThinkingRange = {
  id: string
  condition?: VisualCondition
  thinking: Extract<VisualPricingNode, { kind: 'tier' }>
  nonThinking: Extract<VisualPricingNode, { kind: 'tier' }>
}

type ThinkingPair = Extract<VisualPricingNode, { kind: 'branch' }> & {
  yes: Extract<VisualPricingNode, { kind: 'tier' }>
  no: Extract<VisualPricingNode, { kind: 'tier' }>
}

function isThinkingPair(node: VisualPricingNode): node is ThinkingPair {
  if (node.kind !== 'branch' || node.condition.kind !== 'request-comparison') return false
  if (node.condition.source !== 'param' || node.condition.path !== 'enable_thinking' || node.condition.operator !== '==' || node.condition.value !== true) return false
  return node.yes.kind === 'tier' && node.no.kind === 'tier' &&
    node.yes.billingUnit === 'token' && node.no.billingUnit === 'token' &&
    node.yes.sharedPrices?.some((price) => price.variable === 'p') === true &&
    node.no.sharedPrices?.some((price) => price.variable === 'p') === true &&
    node.yes.prices.some((price) => price.variable === 'c') &&
    node.no.prices.some((price) => price.variable === 'c')
}

function collectSharedThinkingRanges(root: VisualPricingNode): SharedThinkingRange[] | null {
  const ranges: SharedThinkingRange[] = []
  let current: VisualPricingNode = root
  while (current.kind === 'branch') {
    if (isThinkingPair(current)) {
      ranges.push({ id: current.id, thinking: current.yes, nonThinking: current.no })
      break
    }
    if (!isThinkingPair(current.yes)) return null
    ranges.push({ id: current.id, condition: current.condition, thinking: current.yes.yes, nonThinking: current.yes.no })
    current = current.no
  }
  return ranges.length >= 1 ? ranges : null
}

function updateVisualNode(
  node: VisualPricingNode,
  id: string,
  update: (node: VisualPricingNode) => VisualPricingNode,
): VisualPricingNode {
  if (node.id === id) return update(node)
  if (node.kind !== 'branch') return node
  return { ...node, yes: updateVisualNode(node.yes, id, update), no: updateVisualNode(node.no, id, update) }
}

function removeSharedThinkingRange(
  node: VisualPricingNode,
  range: SharedThinkingRange,
): VisualPricingNode {
  if (node.kind !== 'branch') return node
  if (range.condition && node.id === range.id) return node.no
  if (!range.condition && node.no.id === range.id) return node.yes
  return {
    ...node,
    yes: removeSharedThinkingRange(node.yes, range),
    no: removeSharedThinkingRange(node.no, range),
  }
}

function cloneSharedTier(
  tier: Extract<VisualPricingNode, { kind: 'tier' }>,
  label: string
): Extract<VisualPricingNode, { kind: 'tier' }> {
  return {
    ...tier,
    id: visualNodeId(),
    origin: undefined,
    label,
    prices: tier.prices.map(({ variable, value }) => ({ variable, value })),
    sharedPrices: tier.sharedPrices?.map(({ variable, value }) => ({ variable, value })),
  }
}

function insertSharedThinkingRange(
  node: VisualPricingNode,
  fallback: SharedThinkingRange,
  condition: VisualCondition,
  baseName: string
): VisualPricingNode {
  if (node.id === fallback.id) {
    const modeCondition: VisualCondition = {
      id: visualNodeId(),
      kind: 'request-comparison',
      source: 'param',
      path: 'enable_thinking',
      operator: '==',
      value: true,
    }
    const thinking = cloneSharedTier(
      fallback.thinking,
      `${baseName} thinking (shared input)`
    )
    const nonThinking = cloneSharedTier(
      fallback.nonThinking,
      `${baseName} non-thinking (shared input)`
    )
    const mode: VisualPricingNode = {
      id: visualNodeId(),
      kind: 'branch',
      condition: modeCondition,
      yes: thinking,
      no: nonThinking,
    }
    return {
      id: visualNodeId(),
      kind: 'branch',
      condition,
      yes: mode,
      no: node,
    }
  }
  if (node.kind !== 'branch') return node
  return {
    ...node,
    yes: insertSharedThinkingRange(node.yes, fallback, condition, baseName),
    no: insertSharedThinkingRange(node.no, fallback, condition, baseName),
  }
}

function nextSharedThinkingRangeCondition(
  ranges: SharedThinkingRange[]
): VisualCondition {
  const previous = [...ranges]
    .reverse()
    .find((range) => range.condition?.kind === 'comparison')?.condition
  if (previous?.kind === 'comparison' && previous.probe === 'len') {
    const value = Number(previous.value)
    if (Number.isFinite(value) && value > 0) {
      return {
        ...previous,
        id: visualNodeId(),
        origin: undefined,
        value: String(Math.round(value * 2)),
      }
    }
  }
  return {
    id: visualNodeId(),
    kind: 'comparison',
    probe: 'len',
    timezone: '',
    operator: '<=',
    value: '128000',
  }
}

function sharedThinkingTierName(label: string): string {
  return label
    .replace(/\s*\(shared\s+input\)\s*/i, ' ')
    .replace(/\s*(?:non[-\s]?thinking|thinking)\b\s*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function SharedInputThinkingRangesEditor(props: {
  document: VisualBillingDocument
  currency: PricingCurrency
  issues: VisualBillingIssue[]
  ranges: SharedThinkingRange[]
  onChange: (document: VisualBillingDocument) => void
}) {
  const { t, i18n } = useTranslation()
  const updateTier = (id: string, update: (tier: Extract<VisualPricingNode, { kind: 'tier' }>) => Extract<VisualPricingNode, { kind: 'tier' }>) =>
    props.onChange({ ...props.document, root: updateVisualNode(props.document.root, id, (node) => update(node as Extract<VisualPricingNode, { kind: 'tier' }>) ) })
  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground text-xs'>{t('Each token range uses one shared input price. Thinking and non-thinking output prices can be set separately.')}</p>
      {props.ranges.map((range, index) => {
        const shared = range.thinking.sharedPrices?.find((price) => price.variable === 'p')
        const thinking = range.thinking.prices.find((price) => price.variable === 'c')
        const nonThinking = range.nonThinking.prices.find((price) => price.variable === 'c')
        if (!shared || !thinking || !nonThinking) return null
        const condition = range.condition && visualConditionExpression(range.condition, props.document.source)
        const setShared = (value: string) => {
          const set = (tier: Extract<VisualPricingNode, { kind: 'tier' }>) => ({
            ...tier,
            sharedPrices: tier.sharedPrices?.map((price) => price.variable === 'p' ? { ...price, value } : price),
          })
          props.onChange({
            ...props.document,
            root: updateVisualNode(updateVisualNode(props.document.root, range.thinking.id, (node) => set(node as Extract<VisualPricingNode, { kind: 'tier' }>)), range.nonThinking.id, (node) => set(node as Extract<VisualPricingNode, { kind: 'tier' }>)),
          })
        }
        const setOutput = (tierId: string, variable: 'c', value: string) => updateTier(tierId, (tier) => ({ ...tier, prices: tier.prices.map((price) => price.variable === variable ? { ...price, value } : price) }))
        const setTierName = (value: string) => {
          const normalized = value.trim() || (range.condition ? t('New pricing tier') : t('Fallback tier'))
          const setLabel = (tier: Extract<VisualPricingNode, { kind: 'tier' }>, variant: 'thinking' | 'non-thinking') => ({
            ...tier,
            label: `${normalized} ${variant} (shared input)`,
          })
          props.onChange({
            ...props.document,
            root: updateVisualNode(
              updateVisualNode(
                props.document.root,
                range.thinking.id,
                (node) => setLabel(node as Extract<VisualPricingNode, { kind: 'tier' }>, 'thinking'),
              ),
              range.nonThinking.id,
              (node) => setLabel(node as Extract<VisualPricingNode, { kind: 'tier' }>, 'non-thinking'),
            ),
          })
        }
        const setRangeLimit = (value: string) => {
          if (!range.condition || range.condition.kind !== 'comparison') return
          const next = { ...range.condition, value }
          props.onChange({
            ...props.document,
            root: updateVisualNode(props.document.root, range.id, (node) =>
              node.kind === 'branch' ? syncDefaultTierNames({ ...node, condition: next }, node.condition, next) : node
            ),
          })
        }
        const issueFor = (id: string) => props.issues.some((issue) => issue.id === `${id}:shared:p` || issue.id === `${id}:c`)
        return (
          <section key={range.id} className='space-y-3 rounded-xl border bg-muted/20 p-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='secondary'>{t('Tier')} {index + 1}</Badge>
              <span className='text-muted-foreground text-sm'>{condition ? formatBillingCondition(condition, t, i18n.language) : t('Fallback tier')}</span>
              {props.ranges.length > 1 && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='ml-auto'
                  aria-label={t('Remove tier')}
                  onClick={() => props.onChange({
                    ...props.document,
                    root: removeSharedThinkingRange(props.document.root, range),
                  })}
                >
                  <Trash2 className='text-destructive h-4 w-4' />
                </Button>
              )}
            </div>
            {range.condition?.kind === 'comparison' && range.condition.probe === 'len' && (
              <label className='block max-w-xs space-y-2 text-sm font-medium'>
                <span>{t('Maximum input length')}</span>
                <div className='flex items-center gap-2'>
                  <Input aria-label={t('Maximum input length')} inputMode='numeric' value={range.condition.value} onChange={(event) => setRangeLimit(event.target.value)} />
                  {tokenLengthLabel(range.condition.value) && (
                    <span className='text-muted-foreground shrink-0 text-sm font-normal'>
                      {tokenLengthLabel(range.condition.value)}
                    </span>
                  )}
                </div>
              </label>
            )}
            <label className='block max-w-md space-y-2 text-sm font-medium'>
                <span>{range.condition ? t('Tier name') : t('Default tier name')}</span>
                <Input
                  aria-label={range.condition ? t('Tier name') : t('Default tier name')}
                  value={sharedThinkingTierName(range.thinking.label)}
                  onChange={(event) => setTierName(event.target.value)}
                />
              </label>
            <div className='grid gap-4 md:grid-cols-3'>
              <label className='space-y-2 text-sm font-medium'>
                <span>{t('Shared input price')}</span>
                <PricingAmountInput aria-label={t('Shared input price')} currency={props.currency} value={shared.value} onChange={setShared} aria-invalid={issueFor(range.thinking.id) || undefined} />
                <span className='text-muted-foreground block text-xs font-normal'>{props.currency.symbol}/{t('1M token')}</span>
              </label>
              <label className='space-y-2 text-sm font-medium'>
                <span>{t('Non-thinking output price')}</span>
                <PricingAmountInput aria-label={t('Non-thinking output price')} currency={props.currency} value={nonThinking.value} onChange={(value) => setOutput(range.nonThinking.id, 'c', value)} aria-invalid={props.issues.some((issue) => issue.id === `${range.nonThinking.id}:c`) || undefined} />
              </label>
              <label className='space-y-2 text-sm font-medium'>
                <span>{t('Thinking output price')}</span>
                <PricingAmountInput aria-label={t('Thinking output price')} currency={props.currency} value={thinking.value} onChange={(value) => setOutput(range.thinking.id, 'c', value)} aria-invalid={props.issues.some((issue) => issue.id === `${range.thinking.id}:c`) || undefined} />
              </label>
            </div>
          </section>
        )
      })}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => {
          const fallback = props.ranges.at(-1)
          if (!fallback) return
          props.onChange({
            ...props.document,
            root: insertSharedThinkingRange(
              props.document.root,
              fallback,
              nextSharedThinkingRangeCondition(props.ranges),
              t('New pricing tier'),
            ),
          })
        }}
      >
        <Plus className='mr-2 size-4' />
        {t('Add pricing tier')}
      </Button>
    </div>
  )
}

export function VisualBillingDocumentEditor(props: {
  document: VisualBillingDocument
  currency: PricingCurrency
  issues: VisualBillingIssue[]
  onChange: (document: VisualBillingDocument) => void
}) {
  const { t } = useTranslation()
  if (supportsPlatformVisualBillingDocumentEditor(props.document)) {
    return <PlatformVisualBillingDocumentEditor {...props} />
  }
  if (isSharedThinkingPrice(props.document)) {
    return <SharedThinkingPriceEditor {...props} />
  }
  const sharedThinkingRanges = collectSharedThinkingRanges(props.document.root)
  if (sharedThinkingRanges) {
    return <SharedInputThinkingRangesEditor {...props} ranges={sharedThinkingRanges} />
  }
  const shared = props.document.shared
  return (
    <div className='space-y-3'>
      {shared && (
        <section className='space-y-3 rounded-xl border bg-muted/20 p-3'>
          <p className='text-sm font-medium'>{t('Shared input pricing')}</p>
          <p className='text-muted-foreground text-xs'>
            {t('These input prices are applied once before the selected output price branch.')}
          </p>
          <TierPriceFields
            currency={props.currency}
            billingUnit='token'
            fixedPrice=''
            onBillingUnitChange={() => undefined}
            onFixedPriceChange={() => undefined}
            prices={Object.fromEntries(shared.prices.map((price) => [price.variable, price.value]))}
            invalidVariables={props.issues
              .filter((issue) => issue.id.startsWith(`${shared.id}:`))
              .map((issue) => issue.id.slice(shared.id.length + 1))}
            scope={t('Shared input pricing')}
            scopeId='shared'
            onChange={(variable, value) =>
              props.onChange({
                ...props.document,
                shared: {
                  ...shared,
                  prices: shared.prices.map((price) =>
                    price.variable === variable ? { ...price, value } : price
                  ),
                },
              })
            }
            onInclude={(variable, included) =>
              props.onChange({
                ...props.document,
                shared: {
                  ...shared,
                  prices: included
                    ? [...shared.prices, { variable, value: '0' }]
                    : shared.prices.filter((price) => price.variable !== variable),
                },
              })
            }
          />
        </section>
      )}
      {props.document.root.kind === 'branch' && (
        <p className='text-muted-foreground text-xs'>
          {t(
            'Rules are checked in order. The first match determines the price.'
          )}
        </p>
      )}
      <PricingRuleList
        node={props.document.root}
        prefix=''
        source={props.document.source}
        currency={props.currency}
        issues={props.issues}
        onChange={(root) => props.onChange({ ...props.document, root })}
      />
    </div>
  )
}
