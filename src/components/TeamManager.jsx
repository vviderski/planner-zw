import { useState, useEffect } from 'react'
import { Edit2, Save, Trash2, X } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { buildTechnicianPayload, getTaskMutationErrorMessage, getTaskTechnicianIds } from '../utils/taskUtils'

export default function TeamManager({ currentUser }) {
  const [team, setTeam] = useState([])
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('technik')
  const [editingUserId, setEditingUserId] = useState(null)
  const [editFullName, setEditFullName] = useState('')
  const [editRole, setEditRole] = useState('technik')
  const [msg, setMsg] = useState({ type: '', text: '' })

  useEffect(() => {
    fetchTeam()
  }, [])

  const fetchTeam = async () => {
    const { data } = await supabase.from('profiles').select('*').order('full_name', { ascending: true })
    if (data) setTeam(data)
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    setMsg({ type: '', text: '' })

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })

    if (authError) {
      setMsg({ type: 'error', text: `Błąd: ${authError.message}` })
      return
    }

    if (authData?.user) {
      const { error: profileError } = await supabase.from('profiles').insert([
        { id: authData.user.id, full_name: fullName, role },
      ])

      if (profileError) {
        setMsg({ type: 'error', text: `Błąd profilu: ${profileError.message}` })
      } else {
        setMsg({ type: 'success', text: `Dodano ${fullName}.` })
        setFullName('')
        setEmail('')
        setPassword('')
        setRole('technik')
        fetchTeam()
      }
    }
  }

  const startEditingUser = (user) => {
    setEditingUserId(user.id)
    setEditFullName(user.full_name || '')
    setEditRole(user.role || 'technik')
    setMsg({ type: '', text: '' })
  }

  const cancelEditingUser = () => {
    setEditingUserId(null)
    setEditFullName('')
    setEditRole('technik')
  }

  const handleUpdateUser = async (userId) => {
    if (!editFullName.trim()) {
      setMsg({ type: 'error', text: 'Imię i nazwisko nie może być puste.' })
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: editFullName.trim(), role: editRole })
      .eq('id', userId)

    if (error) {
      setMsg({ type: 'error', text: getTaskMutationErrorMessage(error) })
      return
    }

    setMsg({ type: 'success', text: 'Zapisano zmiany użytkownika.' })
    cancelEditingUser()
    fetchTeam()
  }

  const clearUserAssignments = async (userId) => {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, technik_id, technician_ids')

    if (error) throw error

    const affectedTasks = (data || []).filter(task => (
      task.technik_id === userId || getTaskTechnicianIds(task).includes(userId)
    ))

    for (const task of affectedTasks) {
      const nextIds = getTaskTechnicianIds(task).filter(id => id !== userId)
      const { error: updateError } = await supabase
        .from('tasks')
        .update(buildTechnicianPayload(nextIds))
        .eq('id', task.id)

      if (updateError) throw updateError
    }

    return affectedTasks.length
  }

  const handleDeleteUser = async (user) => {
    if (user.id === currentUser?.id) {
      setMsg({ type: 'error', text: 'Nie możesz usunąć aktualnie zalogowanego użytkownika.' })
      return
    }

    const confirmed = window.confirm(`Usunąć użytkownika ${user.full_name}? Zniknie z aplikacji i zostanie odpięty od przypisanych kafelek.`)
    if (!confirmed) return

    try {
      const affectedTasksCount = await clearUserAssignments(user.id)
      const { error } = await supabase.from('profiles').delete().eq('id', user.id)

      if (error) {
        setMsg({ type: 'error', text: getTaskMutationErrorMessage(error) })
        return
      }

      setMsg({
        type: 'success',
        text: `Usunięto ${user.full_name}. Wyczyszczono przypisania w ${affectedTasksCount} kafelkach.`,
      })
      fetchTeam()
    } catch (error) {
      setMsg({ type: 'error', text: getTaskMutationErrorMessage(error) })
    }
  }

  const roleBadgeClass = (userRole) => (
    userRole === 'pm'
      ? 'bg-purple-100 text-purple-700'
      : 'bg-orange-100 text-orange-700'
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 h-fit">
        <h3 className="text-lg font-bold mb-4">Dodaj pracownika</h3>
        {msg.text && (
          <div className={`p-3 mb-4 text-sm rounded border ${msg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {msg.text}
          </div>
        )}
        <form onSubmit={handleAddUser} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Imię i nazwisko</label>
            <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} className="w-full p-2 border border-slate-300 rounded" placeholder="Jan Kowalski" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">E-mail</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-2 border border-slate-300 rounded" placeholder="j.kowalski@firma.pl" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Hasło</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full p-2 border border-slate-300 rounded" placeholder="Min. 6 znaków" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Rola</label>
            <select value={role} onChange={e => setRole(e.target.value)} className="w-full p-2 border border-slate-300 rounded bg-white">
              <option value="technik">Technik</option>
              <option value="pm">Project Manager</option>
            </select>
          </div>
          <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition">Zapisz</button>
        </form>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 lg:col-span-2 overflow-x-auto">
        <h3 className="text-lg font-bold mb-4">Aktualny zespół ({team.length} osób)</h3>
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-50 uppercase text-xs font-bold border-b">
            <tr>
              <th className="p-3">Imię i nazwisko</th>
              <th className="p-3">Rola</th>
              <th className="p-3 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {team.map((member) => {
              const isEditing = editingUserId === member.id
              const isCurrentUser = member.id === currentUser?.id

              return (
                <tr key={member.id} className="hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-900">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editFullName}
                        onChange={e => setEditFullName(e.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-semibold"
                        autoFocus
                      />
                    ) : (
                      <span>{member.full_name}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <select value={editRole} onChange={e => setEditRole(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                        <option value="technik">Technik</option>
                        <option value="pm">Project Manager</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${roleBadgeClass(member.role)}`}>{member.role}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={() => handleUpdateUser(member.id)} className="p-2 rounded-lg text-green-700 hover:bg-green-50" title="Zapisz">
                            <Save size={16} />
                          </button>
                          <button type="button" onClick={cancelEditingUser} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Anuluj">
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => startEditingUser(member)} className="p-2 rounded-lg text-blue-700 hover:bg-blue-50" title="Edytuj">
                            <Edit2 size={16} />
                          </button>
                          <button type="button" onClick={() => handleDeleteUser(member)} disabled={isCurrentUser} className={`p-2 rounded-lg ${isCurrentUser ? 'text-slate-300 cursor-not-allowed' : 'text-red-600 hover:bg-red-50'}`} title={isCurrentUser ? 'Nie możesz usunąć siebie' : 'Usuń'}>
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
