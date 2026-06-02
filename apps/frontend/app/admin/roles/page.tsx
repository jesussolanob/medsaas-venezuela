'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, Plus, Trash2, Edit2, Loader2, CheckCircle2 } from 'lucide-react'

type AdminRole = {
  id: string
  full_name: string
  email: string
  role: 'super_admin' | 'vendedor'
  is_active: boolean
  permissions?: string[]
  created_at: string
}

const AVAILABLE_PERMISSIONS = [
  { id: 'dashboard', label: 'Dashboard (vista general)' },
  { id: 'usuarios', label: 'Usuarios (médicos y clínicas)' },
  { id: 'suscripciones', label: 'Suscripciones' },
  { id: 'aprobaciones', label: 'Aprobaciones' },
  { id: 'finanzas', label: 'Finanzas' },
  { id: 'configuracion', label: 'Configuración' },
] as const

export default function RolesPage() {
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const supabase = createClient()

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: 'vendedor' as 'super_admin' | 'vendedor',
    is_active: true,
    permissions: [] as string[],
  })

  useEffect(() => {
    loadRoles()
  }, [])

  async function loadRoles() {
    try {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('admin_roles')
        .select('*')
        .order('created_at', { ascending: false })

      if (err) throw err
      setRoles(data || [])
    } catch (err) {
      console.error('Error loading roles:', err)
      setError('Error al cargar los roles')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!formData.full_name || !formData.email) {
      setError('Por favor completa todos los campos')
      return
    }

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      // For super_admin, grant all permissions automatically
      const permissions = formData.role === 'super_admin'
        ? AVAILABLE_PERMISSIONS.map(p => p.id)
        : formData.permissions

      if (editingId) {
        const { error: err } = await supabase
          .from('admin_roles')
          .update({
            full_name: formData.full_name,
            email: formData.email,
            role: formData.role,
            is_active: formData.is_active,
            permissions: permissions,
          })
          .eq('id', editingId)

        if (err) throw err
        setSuccess('Rol actualizado correctamente')
      } else {
        const { error: err } = await supabase
          .from('admin_roles')
          .insert({
            full_name: formData.full_name,
            email: formData.email,
            role: formData.role,
            is_active: formData.is_active,
            permissions: permissions,
          })

        if (err) throw err
        setSuccess('Rol creado correctamente')
      }

      setFormData({ full_name: '', email: '', role: 'vendedor', is_active: true, permissions: [] })
      setEditingId(null)
      setShowForm(false)
      await loadRoles()
    } catch (err) {
      console.error('Error saving role:', err)
      setError('Error al guardar el rol')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de que deseas eliminar este rol?')) return

    try {
      const { error: err } = await supabase
        .from('admin_roles')
        .delete()
        .eq('id', id)

      if (err) throw err
      setSuccess('Rol eliminado correctamente')
      await loadRoles()
    } catch (err) {
      console.error('Error deleting role:', err)
      setError('Error al eliminar el rol')
    }
  }

  function handleEdit(role: AdminRole) {
    setFormData({
      full_name: role.full_name,
      email: role.email,
      role: role.role,
      is_active: role.is_active,
      permissions: role.permissions || [],
    })
    setEditingId(role.id)
    setShowForm(true)
  }

  function handleCancel() {
    setFormData({ full_name: '', email: '', role: 'vendedor', is_active: true, permissions: [] })
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function togglePermission(permissionId: string) {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId]
    }))
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Roles de Administración</h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">{roles?.length ?? 0} roles creados</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Nuevo rol
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {success}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {editingId ? 'Editar rol' : 'Crear nuevo rol'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Nombre completo</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="Ej. Juan Pérez"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="juan@example.com"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Rol</label>
              <select
                value={formData.role}
                onChange={(e) => {
                  const newRole = e.target.value as 'super_admin' | 'vendedor'
                  setFormData({
                    ...formData,
                    role: newRole,
                    // Reset permissions when changing role
                    permissions: newRole === 'super_admin' ? AVAILABLE_PERMISSIONS.map(p => p.id) : []
                  })
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
              >
                <option value="vendedor">Vendedor</option>
                <option value="super_admin">Super Administrador</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-teal-500 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-slate-700">Activo</span>
              </label>
            </div>
          </div>

          {formData.role === 'vendedor' && (
            <div className="pt-2 border-t border-slate-200">
              <label className="text-xs font-medium text-slate-500 block mb-3">Permisos de acceso a secciones</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {AVAILABLE_PERMISSIONS.map((permission) => (
                  <label key={permission.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes(permission.id)}
                      onChange={() => togglePermission(permission.id)}
                      className="w-4 h-4 rounded border-slate-300 text-teal-500 focus:ring-teal-500"
                    />
                    <span className="text-sm font-medium text-slate-700">{permission.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {formData.role === 'super_admin' && (
            <div className="pt-2 border-t border-slate-200">
              <label className="text-xs font-medium text-slate-500 block mb-3">Permisos de acceso a secciones</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {AVAILABLE_PERMISSIONS.map((permission) => (
                  <label key={permission.id} className="flex items-center gap-2 cursor-pointer opacity-60">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="w-4 h-4 rounded border-slate-300 text-teal-500 focus:ring-teal-500 cursor-not-allowed"
                    />
                    <span className="text-sm font-medium text-slate-700">{permission.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">Los Super Administradores tienen acceso a todas las secciones automáticamente</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Guardar
                </>
              )}
            </button>
            <button
              onClick={handleCancel}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto -mx-4 sm:mx-0 sm:overflow-hidden">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Nombre</th>
              <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">Email</th>
              <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Rol</th>
              <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Permisos</th>
              <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
              <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 sm:px-6 py-8 text-center text-slate-400 text-sm">
                  Cargando roles...
                </td>
              </tr>
            ) : !roles || roles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 sm:px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                      <Shield className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-slate-400 text-sm">No hay roles creados todavía</p>
                  </div>
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr key={role.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium text-xs sm:text-sm flex-shrink-0">
                        {role.full_name?.charAt(0) ?? '?'}
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-slate-900">{role.full_name}</p>
                        <p className="text-xs text-slate-500 sm:hidden">{role.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-xs sm:text-sm text-slate-600 hidden sm:table-cell">{role.email}</td>
                  <td className="px-4 sm:px-6 py-4 hidden lg:table-cell">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                      role.role === 'super_admin'
                        ? 'bg-purple-50 text-purple-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}>
                      {role.role === 'super_admin' ? 'Super Admin' : 'Vendedor'}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4 hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {role.role === 'super_admin' ? (
                        <span className="inline-block px-2 py-1 text-xs rounded-full bg-teal-50 text-teal-700 font-medium">
                          Todas las secciones
                        </span>
                      ) : role.permissions && role.permissions.length > 0 ? (
                        role.permissions.slice(0, 2).map((perm) => {
                          const permission = AVAILABLE_PERMISSIONS.find(p => p.id === perm)
                          return (
                            <span key={perm} className="inline-block px-2 py-1 text-xs rounded-full bg-teal-50 text-teal-700 font-medium whitespace-nowrap">
                              {permission?.label.split('(')[0].trim()}
                            </span>
                          )
                        })
                      ) : (
                        <span className="inline-block px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600 font-medium">
                          Sin permisos
                        </span>
                      )}
                      {role.permissions && role.permissions.length > 2 && (
                        <span className="inline-block px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600 font-medium">
                          +{role.permissions.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                      role.is_active
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${role.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {role.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(role)}
                        className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(role.id)}
                        className="text-xs text-slate-400 hover:text-red-500 font-medium"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
