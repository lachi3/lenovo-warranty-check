import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Clock, History, Laptop, Loader2, ScanBarcode, Search, XCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Scanner } from '@/components/Scanner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  elapsedPercent,
  fetchWarranty,
  formatDate,
  getStatus,
  parseSerial,
  type WarrantyEntry,
  type WarrantyResult,
} from '@/lib/warranty'

const HISTORY_KEY = 'lenovo-warranty-history'

interface HistoryItem {
  serial: string
  label: string
  at: string
}

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
  } catch {
    /* storage unavailable */
  }
}

function StatusBadge({ result }: { result: WarrantyResult }) {
  const status = getStatus(result)
  if (status === 'active')
    return (
      <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
        <CheckCircle2 className="size-3" /> {result.warrantyStatus ?? 'In warranty'}
      </Badge>
    )
  if (status === 'expired')
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" /> {result.warrantyStatus ?? 'Expired'}
      </Badge>
    )
  return <Badge variant="secondary">{result.warrantyStatus ?? 'Unknown'}</Badge>
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`break-words ${mono ? 'font-mono text-sm' : 'text-sm'}`}>{value ?? '—'}</dd>
    </div>
  )
}

function WarrantyTable({ title, entries }: { title: string; entries: WarrantyEntry[] }) {
  if (!entries.length) return null
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Table className="text-xs sm:text-sm">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e, i) => (
            <TableRow key={i}>
              <TableCell>{e.name ?? '—'}</TableCell>
              <TableCell>{formatDate(e.startDate)}</TableCell>
              <TableCell>{formatDate(e.endDate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Result({ r }: { r: WarrantyResult }) {
  const pct = elapsedPercent(r)
  const days = Number(r.remainingDays)
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Laptop className="size-5" /> {r.product ?? r.typeName}
            </CardTitle>
            <CardDescription>{r.fullType}</CardDescription>
          </div>
          <StatusBadge result={r} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {pct !== null && (
          <div className="space-y-2">
            <div className="flex flex-wrap justify-between gap-x-3 text-xs sm:text-sm">
              <span className="text-muted-foreground">{formatDate(r.baseWarrantyStart)}</span>
              <span className="order-last w-full text-center font-medium sm:order-none sm:w-auto">
                {Number.isFinite(days) && r.remainingDays !== null
                  ? days > 0
                    ? `${days.toLocaleString()} days remaining`
                    : 'Expired'
                  : `${Math.round(pct)}% elapsed`}
              </span>
              <span className="text-muted-foreground">{formatDate(r.baseWarrantyEnd)}</span>
            </div>
            <Progress value={pct} />
          </div>
        )}

        <Separator />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 sm:gap-x-6">
          <Field label="Serial number" value={r.serialNumber} mono />
          <Field label="Machine type" value={r.typeNumber} mono />
          <Field label="Model" value={r.model} />
          <Field label="Current warranty" value={r.currentWarrantyName} />
          <Field label="Current warranty ends" value={formatDate(r.currentWarrantyEnd)} />
          <Field label="Base warranty ends" value={formatDate(r.baseWarrantyEnd)} />
        </dl>

        <WarrantyTable title="Base warranties" entries={r.baseWarranties} />
        <WarrantyTable title="Upgrades" entries={r.upgradeWarranties} />
        <WarrantyTable title="Contracts" entries={r.contractWarranties} />
      </CardContent>
    </Card>
  )
}

function LoadingCard() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-3 w-full" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function App() {
  const [serial, setSerial] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WarrantyResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [prefix, setPrefix] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory)

  useEffect(() => saveHistory(history), [history])

  // Deep link: /?serial=PF1ABCDE (also accepts ?sn= and ?s=) runs a lookup on load
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current) return
    autoRan.current = true
    const p = new URLSearchParams(window.location.search)
    const fromUrl = p.get('serial') ?? p.get('sn') ?? p.get('s')
    if (fromUrl) search(fromUrl)
    else if (p.get('scan')) setScanning(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function search(value: string) {
    const { serial: s, prefix } = parseSerial(value)
    if (!s) return
    setPrefix(prefix)
    setSerial(s)
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('serial', s)
    window.history.replaceState(null, '', url)
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const r = await fetchWarranty(s)
      setResult(r)
      setHistory((h) =>
        [{ serial: s, label: r.product ?? r.typeName, at: r.checkedAt }, ...h.filter((x) => x.serial !== s)].slice(0, 15),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed.')
    } finally {
      setLoading(false)
    }
  }

  const onScanned = useCallback((value: string) => {
    setScanning(false)
    search(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    search(serial)
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-3xl space-y-4 px-3 pb-28 pt-6 sm:space-y-6 sm:px-4 sm:pb-10 sm:pt-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Lenovo Warranty Lookup</h1>
          <p className="text-sm text-muted-foreground">
            Search the Lenovo warranty register by serial number.
          </p>
        </header>

        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="Serial number, e.g. PF1ABCDE"
            className="bg-background font-mono"
            autoFocus
            spellCheck={false}
            autoCapitalize="characters"
          />
          <Button type="button" variant="outline" size="icon" className="hidden sm:inline-flex" aria-label="Scan barcode" onClick={() => setScanning(true)}>
            <ScanBarcode />
          </Button>
          <Button type="submit" disabled={loading || !serial.trim()}>
            {loading ? <Loader2 className="animate-spin" /> : <Search />}
            <span className="hidden sm:inline">Search</span>
          </Button>
        </form>

        {prefix && (
          <p className="text-xs text-muted-foreground">
            Stripped prefix <span className="font-mono">{prefix}</span> from the scanned code.
          </p>
        )}

        <Button
          type="button"
          size="lg"
          className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-40 h-12 w-[min(20rem,calc(100%-2rem))] -translate-x-1/2 gap-2 rounded-full px-6 text-base shadow-lg sm:hidden"
          onClick={() => setScanning(true)}
        >
          <ScanBarcode /> Scan
        </Button>

        <Dialog open={scanning} onOpenChange={setScanning}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Scan barcode</DialogTitle>
              <DialogDescription>Point the camera at the serial number barcode.</DialogDescription>
            </DialogHeader>
            {scanning && <Scanner onResult={onScanned} />}
          </DialogContent>
        </Dialog>

        {loading && <LoadingCard />}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Lookup failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {result && <Result r={result} />}

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" /> Recent searches
              </CardTitle>
              <CardAction>
                <Button variant="ghost" size="sm" onClick={() => setHistory([])}>
                  Clear
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.serial} className="cursor-pointer" onClick={() => search(h.serial)}>
                      <TableCell className="font-mono">{h.serial}</TableCell>
                      <TableCell>{h.label}</TableCell>
                      <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" /> {formatDate(h.at)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
