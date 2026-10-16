import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ToastKind = 'info' | 'success' | 'warning' | 'error'
type Toast = { id: number; message: string; kind: ToastKind; leaving: boolean }
type Ctx = { toast: (msg: string, kind?: Toast['kind']) => void }

const ToastCtx = createContext<Ctx>({ toast: () => {} })

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Set<number>())
  useEffect(() => () => {
    timers.current.forEach(window.clearTimeout)
    timers.current.clear()
  }, [])

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId++
    setToasts((t) => [...t, { id, message, kind, leaving: false }])
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setToasts((t) => t.map((item) => item.id === id ? { ...item, leaving: true } : item))
      const exitTimer = window.setTimeout(() => {
        timers.current.delete(exitTimer)
        setToasts((t) => t.filter((item) => item.id !== id))
      }, 180)
      timers.current.add(exitTimer)
    }, 3000)
    timers.current.add(timer)
  }, [])
  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-[420px] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.kind === 'error' || t.kind === 'warning' ? 'alert' : 'status'}
              aria-atomic="true"
              data-kind={t.kind}
              data-leaving={t.leaving || undefined}
              className="toast-item pointer-events-auto grid grid-cols-[18px_minmax(0,1fr)] items-center gap-3 px-4 py-3 font-sans text-[13px] leading-[1.5]"
            >
              <ToastIcon kind={t.kind} />
              <span className="break-words text-foreground">{t.message}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  return (
    <svg className="toast-icon h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'success' && <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>}
      {kind === 'error' && <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>}
      {kind === 'warning' && <><path d="M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 3h.01" /></>}
      {kind === 'info' && <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>}
    </svg>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}
