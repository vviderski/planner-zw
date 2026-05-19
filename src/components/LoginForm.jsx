import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const getLoginErrorMessage = (error) => {
    const message = error?.message || ''
    const lowerMessage = message.toLowerCase()

    if (lowerMessage.includes('email not confirmed')) {
      return 'Konto istnieje, ale e-mail nie został jeszcze potwierdzony w Supabase.'
    }

    if (lowerMessage.includes('invalid login credentials')) {
      return 'Supabase odrzucił dane logowania. Sprawdź e-mail, hasło i projekt Supabase.'
    }

    if (lowerMessage.includes('email') && lowerMessage.includes('invalid')) {
      return 'Adres e-mail ma niepoprawny format.'
    }

    return message ? `Supabase: ${message}` : 'Nie udało się zalogować. Spróbuj ponownie.'
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setLoggingIn(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setErrorMsg(getLoginErrorMessage(error))
      }
    } catch (error) {
      setErrorMsg(getLoginErrorMessage(error))
    } finally {
      setLoggingIn(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-slate-100">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-md border border-slate-200">
        <h2 className="text-2xl font-bold text-center text-slate-950 mb-6">Planer ZW - Logowanie</h2>
        {errorMsg && <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded">{errorMsg}</div>}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Adres E-mail</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="pm@twojafirma.pl" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Hasło</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loggingIn} className="w-full py-2.5 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition disabled:opacity-50">
            {loggingIn ? 'Logowanie...' : 'Zaloguj się'}
          </button>
        </form>
      </div>
    </div>
  )
}
