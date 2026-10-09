import { usd } from '@/shared/pricing'

/** Dollars from micro-dollars, with enough digits to see sub-cent API charges. */
export function money(micros: number) {
  const dollars = usd(micros)
  const digits = Math.abs(dollars) >= 1 ? 2 : Math.abs(dollars) >= 0.01 ? 4 : 6
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** Whole dollars from cents. */
export const cents = (value: number) => (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const compact = (value: number) => value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })

/** Margin as a share of revenue; null when there was no revenue. */
export const marginPercent = (revenueMicros: number, costMicros: number) => (revenueMicros > 0 ? ((revenueMicros - costMicros) / revenueMicros) * 100 : null)

export const percent = (value: number | null) => (value === null ? 'n/a' : `${value.toFixed(0)}%`)
