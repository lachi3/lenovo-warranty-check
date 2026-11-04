import path from 'node:path'
import express from 'express'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
const BASE = 'https://pcsupport.lenovo.com/us/en/api/v4'
const PORT = Number(process.env.PORT ?? 3001)

class LookupError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message)
  }
}

async function lookup(serial: string) {
  // Step 1: resolve machine type/name from the serial number
  const typeRes = await fetch(
    `${BASE}/mse/getproducts?productId=${encodeURIComponent(serial)}`,
    { headers: { 'User-Agent': USER_AGENT } },
  )
  const typeJson: any = await typeRes.json().catch(() => null)
  const fullType: string | undefined = (Array.isArray(typeJson) ? typeJson[0] : typeJson)?.Name
  if (!fullType) {
    throw new LookupError(`Could not resolve product info for serial '${serial}'.`, 404)
  }

  // "ThinkPad X1 Carbon Gen 9 - Type 20XW" -> name / number
  const typeName = fullType.split(' - Type ')[0]
  const typeNumber = fullType.includes('Type ') ? fullType.split('Type ').pop()! : ''

  // Step 2: warranty info using serial + machine type
  const warrantyRes = await fetch(`${BASE}/upsell/redport/getIbaseInfo`, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.5',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ serialNumber: serial, machineType: typeNumber, country: 'us', language: 'en' }),
  })
  const w: any = await warrantyRes.json().catch(() => null)
  if (!w?.data) throw new LookupError('Lenovo returned no warranty data for this serial.', 404)

  const d = w.data
  const na = (v: unknown) => (v === undefined || v === null || v === '' ? null : v)
  return {
    serialNumber: serial,
    fullType,
    typeNumber,
    typeName,
    product: na(d.machineInfo?.product),
    model: na(d.machineInfo?.model),
    warrantyStatus: na(d.warrantyStatus),
    baseWarrantyStart: na(d.baseWarranties?.[0]?.startDate),
    baseWarrantyEnd: na(d.baseWarranties?.[0]?.endDate),
    currentWarrantyName: na(d.currentWarranty?.name),
    currentWarrantyEnd: na(d.currentWarranty?.endDate),
    remainingDays: na(d.currentWarranty?.remainingDays),
    // all warranties/upgrades, passed through so the UI can show the full history
    baseWarranties: d.baseWarranties ?? [],
    upgradeWarranties: d.upgradeWarranties ?? [],
    contractWarranties: d.contractWarranties ?? [],
    checkedAt: new Date().toISOString(),
  }
}

const app = express()

app.get('/api/warranty/:serial', async (req, res) => {
  const serial = req.params.serial.trim().toUpperCase()
  if (!/^[A-Z0-9-]{4,30}$/.test(serial)) {
    res.status(400).json({ error: 'Enter a valid serial number (letters and digits only).' })
    return
  }
  try {
    res.json(await lookup(serial))
  } catch (err) {
    const status = err instanceof LookupError ? err.status : 502
    const message = err instanceof Error ? err.message : 'Lookup failed.'
    res.status(status).json({ error: message })
  }
})

// Serve the built frontend in production
const dist = path.resolve(import.meta.dirname, '../dist')
app.use(express.static(dist))
app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')))

app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`))
