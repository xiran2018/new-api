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
import { useTranslation } from 'react-i18next'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'

import {
  SettingsControlGroup,
  SettingsSwitchField,
} from '../components/settings-form-layout'

export function PriceInput(props: {
  value: string
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
  vendorPriceUSD?: number
}) {
  const { t } = useTranslation()
  const entered = Number(props.value)
  const difference =
    props.vendorPriceUSD != null && Number.isFinite(entered)
      ? entered - props.vendorPriceUSD
      : undefined
  return (
    <div className='flex flex-col gap-1.5 lg:flex-row lg:items-center'>
      <InputGroup className='min-w-0 flex-1'>
        <InputGroupAddon>$</InputGroupAddon>
        <InputGroupInput
          inputMode='decimal'
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <InputGroupAddon align='inline-end'>$/1M</InputGroupAddon>
      </InputGroup>
      {props.vendorPriceUSD != null && (
        <div className='shrink-0 text-xs text-muted-foreground'>
          {t('Vendor price')}: {formatBillingCurrencyFromUSD(props.vendorPriceUSD)}
          {difference != null && (
            <span
              className={cn(
                'ml-2 font-medium',
                difference > 0
                  ? 'text-rose-500'
                  : difference < 0
                    ? 'text-emerald-500'
                    : 'text-muted-foreground'
              )}
            >
              {t('Difference')}: {difference > 0 ? '+' : ''}
              {formatBillingCurrencyFromUSD(difference)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function PriceLane(props: {
  title: string
  description: string
  placeholder: string
  value: string
  enabled: boolean
  disabled?: boolean
  onEnabledChange: (checked: boolean) => void
  onChange: (value: string) => void
  vendorPriceUSD?: number
}) {
  const { t } = useTranslation()
  const effectiveDisabled = props.disabled || !props.enabled

  return (
    <SettingsControlGroup
      className={cn('space-y-3', effectiveDisabled && 'opacity-75')}
      data-disabled={effectiveDisabled || undefined}
    >
      <SettingsSwitchField
        checked={props.enabled}
        disabled={props.disabled}
        onCheckedChange={props.onEnabledChange}
        label={props.title}
        description={props.description}
        aria-label={props.title}
      />
      <PriceInput
        value={props.value}
        placeholder={props.placeholder}
        disabled={effectiveDisabled}
        onChange={props.onChange}
        vendorPriceUSD={props.vendorPriceUSD}
      />
      <p className='text-muted-foreground text-xs'>
        {props.enabled
          ? t('USD price per 1M tokens.')
          : t('Disabled lanes are omitted on save.')}
      </p>
    </SettingsControlGroup>
  )
}
