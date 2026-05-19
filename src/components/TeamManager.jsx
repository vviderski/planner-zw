import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function TeamManager() {
  const [team, setTeam] = useState([])
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('technik')
  const [msg, setMsg] = useState({ type: '', text: '' })

  useEffect(() => { fetchTeam() }, [])

  const fetchTeam = async () => {
    const { data } = await supabase.from('profiles').select('*')
    if (data) setTeam(data)
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    setMsg({ type: '', text: '' })

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    })

    if (authError) {
      setMsg({ type: 'error', text: `Błąd: ${authError.message}` })
      return
    }

    if (authData?.user) {
      const { error: profileError } = await supabase.from('profiles').insert([
        { id: authData.user.id, full_name: fullName, role: role }
      ])

      if (profileError) {
        setMsg({ type: 'error', text: `Błąd profilu: ${profileError.message}` })
      } else {
        setMsg({ type: 'success', text: `Dodano ${fullName}!` })
        setFullName('')
        setEmail('')
        setPassword('')
        fetchTeam()
      }
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 h-fit">
        <h3 className="text-lg font-bold mb-4">Dodaj pracownika</h3>
        {msg.text && <div className={`p-3 mb-4 text-sm rounded border ${msg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{msg.text}</div>}
        <form onSubmit={handleAddUser} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Imię i Nazwisko</label>
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

      <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 lg:col-span-2">
        <h3 className="text-lg font-bold mb-4">Aktualny zespół ({team.length} osób)</h3>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 uppercase text-xs font-bold border-b">
            <tr><th className="p-3">Imię i Nazwisko</th><th className="p-3">Rola</th></tr>
          </thead>
          <tbody className="divide-y">
            {team.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-900">{m.full_name}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${m.role === 'pm' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{m.role}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
