import { useEffect, useRef, useState } from 'react'
import { BarcodeDetector, type DetectedBarcode } from 'barcode-detector/ponyfill'
import { Crop, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

// Frame size as a fraction of the preview (wide and short suits 1D serial barcodes)
const FRAME = { w: 0.8, h: 0.28 }
const SCAN_INTERVAL_MS = 200
const FORMATS = ['code_128', 'code_39', 'qr_code', 'data_matrix', 'ean_13', 'itf'] as const

export function cleanSerial(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

interface Props {
  onResult: (serial: string) => void
}

export function Scanner({ onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const framedRef = useRef(true)
  const [framed, setFramed] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choices, setChoices] = useState<string[]>([])

  useEffect(() => {
    framedRef.current = framed
    setChoices([])
  }, [framed])

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: number | undefined
    let busy = false
    let done = false
    const canvas = document.createElement('canvas')
    const detector = new BarcodeDetector({ formats: [...FORMATS] })

    async function tick() {
      const video = videoRef.current
      const box = boxRef.current
      if (busy || done || !video || !box || video.videoWidth === 0) return
      busy = true
      try {
        const vw = video.videoWidth
        const vh = video.videoHeight
        const cw = box.clientWidth
        const ch = box.clientHeight
        // video is shown with object-cover: map container pixels to video pixels
        const scale = Math.max(cw / vw, ch / vh)
        const offX = (cw - vw * scale) / 2
        const offY = (ch - vh * scale) / 2

        let sx = 0, sy = 0, sw = vw, sh = vh
        if (framedRef.current) {
          const fw = cw * FRAME.w
          const fh = ch * FRAME.h
          sx = Math.max(0, ((cw - fw) / 2 - offX) / scale)
          sy = Math.max(0, ((ch - fh) / 2 - offY) / scale)
          sw = Math.min(vw - sx, fw / scale)
          sh = Math.min(vh - sy, fh / scale)
        }
        canvas.width = Math.round(sw)
        canvas.height = Math.round(sh)
        canvas.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

        const found = (await detector.detect(canvas)).filter((b) => cleanSerial(b.rawValue))
        if (!found.length || done) return

        if (framedRef.current) {
          // several barcodes inside the frame: take the one nearest its centre
          const cx = canvas.width / 2
          const cy = canvas.height / 2
          const dist = (b: DetectedBarcode) => {
            const r = b.boundingBox
            return Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy)
          }
          const best = found.reduce((a, b) => (dist(b) < dist(a) ? b : a))
          done = true
          navigator.vibrate?.(60)
          onResult(cleanSerial(best.rawValue))
        } else {
          const values = [...new Set(found.map((b) => cleanSerial(b.rawValue)))]
          if (values.length === 1) {
            done = true
            navigator.vibrate?.(60)
            onResult(values[0])
          } else {
            setChoices(values)
          }
        }
      } catch {
        /* skip frame */
      } finally {
        busy = false
      }
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (done) return s.getTracks().forEach((t) => t.stop())
        stream = s
        const video = videoRef.current!
        video.srcObject = s
        return video.play().then(() => {
          setReady(true)
          timer = window.setInterval(tick, SCAN_INTERVAL_MS)
        })
      })
      .catch((e: Error) =>
        setError(
          e.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow it in your browser settings and try again.'
            : e.name === 'NotFoundError'
              ? 'No camera found on this device.'
              : `Could not start the camera: ${e.message}`,
        ),
      )

    if (!navigator.mediaDevices) {
      setError('Camera access needs a secure connection (HTTPS or localhost).')
    }

    return () => {
      done = true
      window.clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onResult])

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div ref={boxRef} className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black sm:aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
          {!ready && (
            <div className="absolute inset-0 grid place-items-center text-white/80">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
          {framed && ready && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
              style={{ width: `${FRAME.w * 100}%`, height: `${FRAME.h * 100}%` }}
            >
              <div className="absolute inset-x-2 top-1/2 h-px bg-emerald-400/70" />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <Label htmlFor="framed" className="flex-1 cursor-pointer items-start gap-3">
          <Crop className="mt-0.5 size-4 shrink-0" />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">Framed mode</span>
            <span className="block text-xs font-normal text-muted-foreground">
              Only reads the barcode inside the box. Use when several labels are close together.
            </span>
          </span>
        </Label>
        <Switch id="framed" checked={framed} onCheckedChange={setFramed} />
      </div>

      {!framed && choices.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Multiple barcodes found. Pick one:</p>
          <div className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <Button key={c} variant="outline" className="font-mono" onClick={() => onResult(c)}>
                {c}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
