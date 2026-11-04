export interface WarrantyEntry {
  name?: string
  startDate?: string | number
  endDate?: string | number
  [key: string]: unknown
}

export interface WarrantyResult {
  serialNumber: string
  fullType: string
  typeNumber: string
  typeName: string
  product: string | null
  model: string | null
  warrantyStatus: string | null
  baseWarrantyStart: string | null
  baseWarrantyEnd: string | null
  currentWarrantyName: string | null
  currentWarrantyEnd: string | null
  remainingDays: number | string | null
  baseWarranties: WarrantyEntry[]
  upgradeWarranties: WarrantyEntry[]
  contractWarranties: WarrantyEntry[]
  checkedAt: string
}

export async function fetchWarranty(serial: string): Promise<WarrantyResult> {
  const res = await fetch(`/api/warranty/${encodeURIComponent(serial)}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

export function parseDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(value: string | number | null | undefined): string {
  const d = parseDate(value)
  return d
    ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
}

export type Status = 'active' | 'expired' | 'unknown'

export function getStatus(r: WarrantyResult): Status {
  const s = r.warrantyStatus?.toLowerCase() ?? ''
  if (s.includes('in warranty') || s.includes('active')) return 'active'
  if (s.includes('expired') || s.includes('out of')) return 'expired'
  const end = parseDate(r.currentWarrantyEnd ?? r.baseWarrantyEnd)
  if (end) return end.getTime() > Date.now() ? 'active' : 'expired'
  return 'unknown'
}

/** Percentage of the base warranty period already elapsed. */
export function elapsedPercent(r: WarrantyResult): number | null {
  const start = parseDate(r.baseWarrantyStart)
  const end = parseDate(r.baseWarrantyEnd)
  if (!start || !end || end <= start) return null
  return Math.min(100, Math.max(0, ((Date.now() - start.getTime()) / (end.getTime() - start.getTime())) * 100))
}
