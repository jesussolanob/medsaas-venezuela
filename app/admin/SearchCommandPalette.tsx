'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, UsersRound,
  MessageSquarePlus, Settings, Sparkles, Search, ArrowRight,
  CreditCard, Tag, Bell, Shield, Package
} from 'lucide-react'

type CommandItem = {
  name: string
  href: string
  icon: any
  description: string
  section: string
}

const commands: CommandItem[] = [
  // Main
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard, description: 'KPIs, gráficas y resumen general', section: 'Principal' },
  { name: 'Médicos', href: '/admin/doctors', icon: Users, description: 'Gestionar especialistas registrados', section: 'Principal' },
  { name: 'Pacientes', href: '/admin/patients', icon: UsersRound, description: 'Estadísticas de pacientes registrados', section: 'Principal' },
  { name: 'Sugerencias', href: '/admin/suggestions', icon: MessageSquarePlus, description: 'Feedback de especialistas', section: 'Principal' },
  // Config
  { name: 'Configuración', href: '/admin/settings', icon: Settings, description: 'Ajustes generales de la plataforma', section: 'Configuración' },
  // Suscripciones eliminado — el plan se gestiona desde la lista de médicos
  { name: 'Planes', href: '/admin/plans', icon: Package, description: 'Activar o desactivar planes', section: 'Configuración' },
  { name: 'Features por Plan', href: '/admin/plan-features', icon: Shield, description: 'Configurar módulos por plan', section: 'Configuración' },
  { name: 'Promociones', href: '/admin/promotions', icon: Tag, description: 'Gestionar ofertas y descuentos', section: 'Configuración' },
  { name: 'Recordatorios', href: '/admin/reminders', icon: Bell, description: 'Configurar recordatorios automáticos', section: 'Configuración' },
  { name: 'Roles', href: '/admin/roles', icon: Shield, description: 'Gestionar roles de usuario', section: 'Configuración' },
]

export default function SearchCommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? commands.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase())
      )
    : commands

  const sections = [...new Set(filtered.map(c => c.section))]

  const handleOpen = useCallback(() => {
    setOpen(true)
    setQuery('')
    setSelectedIndex(0)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  const handleSelect = useCallback((href: string) => {
    handleClose()
    router.push(href)
  }, [router, handleClose])

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Cmd+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        handleOpen()
      }
      // Escape to close
      if (e.key === 'Escape' && open) {
        handleClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, handleOpen, handleClose])

  // Arrow navigation
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault()
        handleSelect(filtered[selectedIndex].href)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, filtered, selectedIndex, handleSelect])

  // Reset selection when query changes
  useEffect(() => { setSelectedIndex(0) }, [query])

  return (
    <>
      {/* Search trigger */}
      <button
        onClick={handleOpen}
        className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full transition-all"
        style={{ background: '#F4F6F8', minWidth: 240, border: '1px solid transparent' }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#E8ECF0')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
      >
        <Sparkles className="w-4 h-4" style={{ color: '#97A3AF' }} />
        <span className="text-sm flex-1 text-left" style={{ color: '#97A3AF' }}>Buscar módulo...</span>
        <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#E8ECF0', color: '#97A3AF' }}>⌘K</kbd>
      </button>

      {/* Command palette overlay */}
      {open && (
        <div className="fixed inset-0 z-[100]" onClick={handleClose}>
          {/* Backdrop */}
          <div className="absolute inset-0" style={{ background: 'rgba(15,26,42,0.4)', backdropFilter: 'blur(4px)' }} />

          {/* Dialog */}
          <div className="relative flex justify-center" style={{ paddingTop: '15vh' }}>
            <div
              ref={dialogRef}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl overflow-hidden"
              style={{
                background: '#FFFFFF',
                border: '1px solid #E8ECF0',
                boxShadow: '0 25px 60px rgba(15,26,42,0.15), 0 10px 20px rgba(15,26,42,0.08)',
                animation: 'cmdFadeIn 0.15s ease',
              }}
            >
              <style>{`
                @keyframes cmdFadeIn { from { opacity: 0; transform: translateY(-8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
              `}</style>

              {/* Search input */}
              <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #E8ECF0' }}>
                <Search className="w-5 h-5 shrink-0" style={{ color: '#97A3AF' }} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar módulo o sección..."
                  className="flex-1 text-sm outline-none"
                  style={{ color: '#0F1A2A', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                />
                <kbd
                  className="text-[10px] font-mono px-2 py-1 rounded cursor-pointer"
                  style={{ background: '#F4F6F8', color: '#97A3AF', border: '1px solid #E8ECF0' }}
                  onClick={handleClose}
                >
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="overflow-y-auto" style={{ maxHeight: '50vh' }}>
                {filtered.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm" style={{ color: '#97A3AF' }}>No se encontraron resultados para &quot;{query}&quot;</p>
                  </div>
                ) : (
                  sections.map(section => (
                    <div key={section}>
                      <div className="px-5 pt-3 pb-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#97A3AF' }}>{section}</p>
                      </div>
                      {filtered
                        .filter(c => c.section === section)
                        .map(cmd => {
                          const globalIdx = filtered.indexOf(cmd)
                          const isSelected = globalIdx === selectedIndex
                          return (
                            <button
                              key={cmd.href}
                              onClick={() => handleSelect(cmd.href)}
                              onMouseEnter={() => setSelectedIndex(globalIdx)}
                              className="w-full flex items-center gap-3 px-5 py-3 text-left transition-all"
                              style={{
                                background: isSelected ? '#ECFEFF' : 'transparent',
                              }}
                            >
                              <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                style={{
                                  background: isSelected ? '#CFFAFE' : '#F4F6F8',
                                  color: isSelected ? '#0891B2' : '#5A6773',
                                }}
                              >
                                <cmd.icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: '#0F1A2A' }}>{cmd.name}</p>
                                <p className="text-xs truncate" style={{ color: '#97A3AF' }}>{cmd.description}</p>
                              </div>
                              {isSelected && <ArrowRight className="w-4 h-4 shrink-0" style={{ color: '#0891B2' }} />}
                            </button>
                          )
                        })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 px-5 py-3" style={{ borderTop: '1px solid #E8ECF0', background: '#FAFBFC' }}>
                <span className="text-[10px]" style={{ color: '#97A3AF' }}>
                  <kbd className="font-mono px-1 py-0.5 rounded" style={{ background: '#E8ECF0' }}>↑↓</kbd> navegar
                </span>
                <span className="text-[10px]" style={{ color: '#97A3AF' }}>
                  <kbd className="font-mono px-1 py-0.5 rounded" style={{ background: '#E8ECF0' }}>↵</kbd> abrir
                </span>
                <span className="text-[10px]" style={{ color: '#97A3AF' }}>
                  <kbd className="font-mono px-1 py-0.5 rounded" style={{ background: '#E8ECF0' }}>esc</kbd> cerrar
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
