'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Upload, FileText, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { parseAttendeeCsv, type ParseResult } from '@/lib/csv'

export function CsvImportDialog({ onImported }: { onImported?: () => void }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ inserted: number; duplicates: number; total: number } | null>(null)

  const reset = () => {
    setParsed(null)
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onFile = async (file: File) => {
    const text = await file.text()
    const p = parseAttendeeCsv(text)
    setParsed(p)
    setResult(null)
    if (p.error) toast.error(p.error)
  }

  const submit = async () => {
    if (!parsed || parsed.rows.length === 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/import-attendees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsed.rows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')
      setResult({ inserted: json.inserted, duplicates: json.duplicates, total: json.totalRows })
      toast.success(`Imported ${json.inserted} attendee${json.inserted === 1 ? '' : 's'}`)
      onImported?.()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" shape="pill">
          <Upload className="size-4" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import attendees from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV with <code className="font-code text-xs">name,email</code> columns.
            Existing emails are skipped automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!parsed && !result && (
            <label
              htmlFor="csv-input"
              className="flex flex-col items-center justify-center gap-2 py-10 rounded-[12px] border border-dashed border-border bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer text-center"
            >
              <FileText className="size-6 text-muted-foreground" />
              <span className="text-sm font-medium">Click to choose a .csv file</span>
              <span className="text-xs text-muted-foreground">
                Up to 5,000 rows · headers optional
              </span>
              <input
                ref={inputRef}
                id="csv-input"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </label>
          )}

          {parsed && !result && !parsed.error && (
            <div className="rounded-[10px] border border-border p-4 text-sm">
              <p>
                <span className="font-medium">{parsed.rows.length}</span> valid rows found
                {parsed.skipped > 0 ? (
                  <> · <span className="text-muted-foreground">{parsed.skipped} skipped</span></>
                ) : null}
              </p>
              <div className="mt-3 max-h-40 overflow-auto rounded-md bg-muted/40 p-2 font-code text-xs">
                {parsed.rows.slice(0, 8).map((r, i) => (
                  <div key={i} className="truncate">
                    {r.name} · {r.email}
                  </div>
                ))}
                {parsed.rows.length > 8 && (
                  <div className="text-muted-foreground">…and {parsed.rows.length - 8} more</div>
                )}
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-[10px] border border-[color:var(--brand-green)]/30 bg-[color:var(--brand-green-soft)] p-4 text-sm flex items-start gap-3">
              <CheckCircle2 className="size-5 text-[color:var(--brand-green)] shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Import complete</p>
                <p className="text-muted-foreground mt-0.5">
                  {result.inserted} added · {result.duplicates} already existed · {result.total} total.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {parsed && !result && (
            <>
              <Button variant="ghost" onClick={reset}>Choose different file</Button>
              <Button onClick={submit} disabled={loading || parsed.rows.length === 0}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Importing…
                  </>
                ) : (
                  <>Import {parsed.rows.length}</>
                )}
              </Button>
            </>
          )}
          {result && (
            <Button onClick={() => setOpen(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
