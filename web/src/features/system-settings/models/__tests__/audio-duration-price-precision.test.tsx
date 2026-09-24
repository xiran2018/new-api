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
import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { USD_PRICING_CURRENCY } from '@/features/model-pricing/currency'

import { TierPriceFields } from '../tier-price-fields'

test('shows audio-duration prices with six decimals without changing other price fields', () => {
  render(
    <TierPriceFields
      currency={USD_PRICING_CURRENCY}
      prices={{ p: 1, img: 1, aud_s: 0.00022 }}
      onChange={vi.fn()}
    />
  )

  expect(screen.getByRole('textbox', { name: 'Audio duration price' })).toHaveValue(
    '0.000220'
  )
  expect(screen.getByRole('textbox', { name: 'Input price' })).toHaveValue(
    '1.000'
  )
})
