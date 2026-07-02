import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { supabase } from '@/integrations/supabase/client'
import { Search, UserPlus, CheckCircle2, X } from 'lucide-react'
import type { Customer } from '@/types/database'

interface Props {
  value: Customer | null
  onChange: (c: Customer | null) => void
  onCreateNew?: (name: string) => void
  placeholder?: string
}

export function ClienteCombobox({ value, onChange, onCreateNew, placeholder = 'Buscar cliente...' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('customers')
        .select('*')
        .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
        .order('name')
        .limit(8)
      setResults(data ?? [])
      setLoading(false)
      setOpen(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  function select(c: Customer) {
    onChange(c)
    setQuery('')
    setOpen(false)
  }

  function clear() {
    onChange(null)
    setQuery('')
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 p-2.5 rounded-md border bg-green-50 border-green-200">
        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{value.name}</p>
          {value.phone && <p className="text-xs text-muted-foreground">{value.phone_ddi} {value.phone}</p>}
        </div>
        <button onClick={clear} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setOpen(false) }}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-md overflow-hidden">
          {loading && (
            <p className="text-xs text-muted-foreground px-3 py-2">Buscando...</p>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <div className="px-3 py-2">
              <p className="text-xs text-muted-foreground mb-2">Nenhum cliente encontrado</p>
              {onCreateNew && (
                <button
                  onClick={() => { onCreateNew(query.trim()); setOpen(false); setQuery('') }}
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <UserPlus className="w-4 h-4" />
                  Cadastrar "{query.trim()}"
                </button>
              )}
            </div>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => select(c)}
              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-accent text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.phone_ddi} {c.phone}
                  {c.birthday ? ` · ${new Date(c.birthday + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}
                </p>
              </div>
              {c.phone_verified && (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
              )}
            </button>
          ))}
          {onCreateNew && results.length > 0 && (
            <button
              onClick={() => { onCreateNew(query.trim()); setOpen(false); setQuery('') }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-accent border-t"
            >
              <UserPlus className="w-4 h-4" />
              Cadastrar novo cliente
            </button>
          )}
        </div>
      )}
    </div>
  )
}
