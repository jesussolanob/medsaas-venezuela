'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, Calendar, Users, ClipboardList, Building2, FileEdit,
  TrendingUp, Receipt, Package, Bell, MessageSquarePlus, Settings,
  Sparkles, Search, ArrowRight
} from 'lucide-react'

type CommandItem = {
  name: string
  href: string
  icon: any
  description: string
  section: string
}

const commands: CommandItem[] = [
  { name: 'Inicio', href: '/doctor', icon: LayoutDashboard, description: 'Dashboard principal', section: 'Principal' },
  { name: 'Agenda', href: '/doctor/agenda', icon: Calendar, description: 'Calendario y citas del día', section: 'Principal' },
  // Consultorio
  { name: 'Pacientes', href: '/doctor/patients', icon: Users, description: 'Lista de pacientes', section: 'Consultorio' },
  { name: 'Consultas', href: '/doctor/consultations', icon: ClipboardList, description: 'Historial de consultas', section: 'Consultorio' },
  { name: 'Consultorios', href: '/doctor/offices', icon: Building2, description: 'Gestionar consultorios', section: 'Consultorio' },
  { name: 'Plantillas', href: '/doctor/templates', icon: FileEdit, description: 'Plantillas de notas clínicas', section: 'Consultorio' },
  // Finanzas
  { name: 'Finanzas', href: '/doctor/finances', icon: TrendingUp, description: 'Ingresos y reportes', section: 'Finanzas' },
  { name: 'Cobros', href: '/doctor/cobros', icon: Receipt, description: 'Gestionar cobros', section: 'Finanzas' },
  { name: 'Servicios', href: '/doctor/services', icon: Package, description: 'Planes y paquetes', section: 'Finanzas' },
  // Marketing
  { name: 'Recordatorios', href: '/doctor/reminders', icon: Bell, description: 'Recordatorios automáticos', section: 'Marketing' },
  // Otros
  { name: 'Sugerencias', href: '/doctor/suggestions', icon: MessageSquarePlus, description: 'Enviar feedback', section: 'Otros' },
  { name: 'Configuración', href: '/doctor/settings', icon: Settings, description: 'Perfil y ajustes', section: 'Otros' },
]

export default function SearchCommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query.trim()
    ? commands.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase())
      )
    : commands

  const sections = [...new Set(filtered.map(c => c.section))]

  const handleOpen = useCallback(() => {
    setOpen(true); setQuery(''); setSelectedIndex(0)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])
  const handleClose = useCallback(() => { setOpen(false); setQuery('') }, [])
  const handleSelect = useCallback((href: string) => { handleClose(); router.push(href) }, [router, handleClose])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); handleOpen() }
      if (e.key === 'Escape' && open) handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, handleOpen, handleClose])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter' && filtered[selectedIndex]) { e.preventDefault(); handleSelect(filtered[selectedIndex].href) }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, filtered, selectedIndex, handleSelect])

  useEffect(() => { setSelectedIndex(0) }, [query])

  return (
    <>
      <button onClick={handleOpen} className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full transition-all" style={{ background: '#F4F6F8', minWidth: 220, border: '1px solid transparent' }}>
        <Sparkles className="w-4 h-4" style={{ color: '#97A3AF' }} />
        <span className="text-sm flex-1 text-left" style={{ color: '#97A3AF' }}>Buscar...</span>
        <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#E8ECF0', color: '#97A3AF' }}>⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100]" onClick={handleClose}>
          <div className="absolute inset-0" style={{ background: 'rgba(15,26,42,0.4)', backdropFilter: 'blur(4px)' }} />
          <div className="relative flex justify-center" style={{ paddingTop: '15vh' }}>
            <div onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #E8ECF0', boxShadow: '0 25px 60px rgba(15,26,42,0.15)', animation: 'cmdIn .15s ease' }}>
              <style>{`@keyframes cmdIn{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
              <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #E8ECF0' }}>
                <Search className="w-5 h-5 shrink-0" style={{ color: '#97A3AF' }} />
                <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar módulo..." className="flex-1 text-sm outline-none" style={{ color: '#0F1A2A', fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
                <kbd className="text-[10px] font-mono px-2 py-1 rounded cursor-pointer" style={{ background: '#F4F6F8', color: '#97A3AF', border: '1px solid #E8ECF0' }} onClick={handleClose}>ESC</kbd>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '50vh' }}>
                {filtered.length === 0 ? (
                  <div className="px-5 py-8 text-center"><p className="text-sm" style={{ color: '#97A3AF' }}>Sin resultados</p></div>
                ) : sections.map(section => (
                  <div key={section}>
                    <div className="px-5 pt-3 pb-1"><p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#97A3AF' }}>{section}</p></div>
                    {filtered.filter(c => c.section === section).map(cmd => {
                      const idx = filtered.indexOf(cmd)
                      const sel = idx === selectedIndex
                      return (
                        <button key={cmd.href} onClick={() => handleSelect(cmd.href)} onMouseEnter={() => setSelectedIndex(idx)} className="w-full flex items-center gap-3 px-5 py-3 text-left transition-all" style={{ background: sel ? '#ECFEFF' : 'transparent' }}>
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: sel ? '#CFFAFE' : '#F4F6F8', color: sel ? '#0891B2' : '#5A6773' }}>
                            <cmd.icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: '#0F1A2A' }}>{cmd.name}</p>
                            <p className="text-xs truncate" style={{ color: '#97A3AF' }}>{cmd.description}</p>
                          </div>
                          {sel && <ArrowRight className="w-4 h-4 shrink-0" style={{ color: '#0891B2' }} />}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 px-5 py-3" style={{ borderTop: '1px solid #E8ECF0', background: '#FAFBFC' }}>
                <span className="text-[10px]" style={{ color: '#97A3AF' }}><kbd className="font-mono px-1 py-0.5 rounded" style={{ background: '#E8ECF0' }}>↑↓</kbd> navegar</span>
                <span className="text-[10px]" style={{ color: '#97A3AF' }}><kbd className="font-mono px-1 py-0.5 rounded" style={{ background: '#E8ECF0' }}>↵</kbd> abrir</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
