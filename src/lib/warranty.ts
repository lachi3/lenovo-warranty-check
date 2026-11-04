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

export interface ParsedSerial {
  serial: string
  /** Anything stripped from the front of the raw input (e.g. "1S20XW0035"), if any. */
  prefix: string | null
}

/**
 * Extracts the serial from raw input / barcode contents.
 * Lenovo labels often encode [`1S`] + machine-type-model (10 chars) + 8-char serial,
 * e.g. `1S20XW0035PF1ABCDE` or `21R8S0JD00PW0Q7HTK`. Also handles an `S` prefix and "S/N:" style labels.
 */
export function parseSerial(raw: string): ParsedSerial {
  let v = raw.trim().toUpperCase()
  v = v.replace(/^(?:S\/N|SERIAL(?:\s*NUMBER)?|SN)\s*[:#-]?\s*/, '')
  v = v.replace(/[^A-Z0-9]/g, '')

  // Our devices start with PW or PC: use that as the anchor so any prefix length works.
  // Prefer a standard 8-char serial, then allow 7-10 chars; take the leftmost fit
  // when a longer serial is possible, so the prefix itself containing "PW"/"PC" is safe.
  if (v.length > 8) {
    for (const len of [8, 10, 9, 7]) {
      const start = v.length - len
      if (start > 0 && /^P[WC]/.test(v.slice(start))) return { serial: v.slice(start), prefix: v.slice(0, start) }
    }
  }

  // Machine type/model prefix (10 chars, optionally preceded by "1S") + 8-char serial,
  // e.g. 1S20XW0035PF1ABCDE or 21R8S0JD00PW0Q7HTK -> last 8 chars are the serial.
  if (v.length >= 16) return { serial: v.slice(-8), prefix: v.slice(0, -8) }
  if (v.startsWith('1S') && v.length > 10) return { serial: v.slice(-8), prefix: v.slice(0, -8) }
  if (v.length === 9 && v.startsWith('S')) return { serial: v.slice(1), prefix: 'S' }
  return { serial: v, prefix: null }
}

/** True if the (already parsed) serial looks like a real Lenovo serial. */
export function isValidSerial(serial: string): boolean {
  if (/^P[WC][A-Z0-9]{6}$/.test(serial)) return true
  return /^[A-Z0-9]{8}$/.test(serial) && /[A-Z]/.test(serial) && /[0-9]/.test(serial)
}
