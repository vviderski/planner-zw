import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// Importy komponentów
import LoginForm from './components/LoginForm'
import SchedulerView from './components/SchedulerView'
import TeamManager from './components/TeamManager'
import MonthView from './components/MonthView'
import ClientManager from './components/ClientManager'

function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [activeTab, setActiveTab] = useState('workload') 
  const userRole = profile?.role || 'technik'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user?.id) {
      setProfile(null)
      return
    }

    supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setProfile(data || null))
  }, [user?.id])

  useEffect(() => {
    if (userRole !== 'pm' && (activeTab === 'clients' || activeTab === 'team')) {
      setActiveTab('workload')
    }
  }, [activeTab, userRole])

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans">
      {user ? (
        <>
          {/* PASEK GÓRNY / NAWIGACJA */}
          <header className="bg-slate-900 text-white px-3 py-3 sm:px-6 sm:py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between shadow-md">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:space-x-6">
              <span className="text-xl font-black tracking-wider text-blue-400">PLANNER ZW</span>
              <nav className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                <button
                  onClick={() => setActiveTab('workload')}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition whitespace-nowrap ${activeTab === 'workload' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  Workload (Tydzień)
                </button>
                <button
                  onClick={() => setActiveTab('month')}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition whitespace-nowrap ${activeTab === 'month' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  Kalendarz (Miesiąc)
                </button>
                {userRole === 'pm' && (
                  <>
                    <button
                      onClick={() => setActiveTab('clients')}
                      className={`px-4 py-1.5 rounded text-sm font-medium transition whitespace-nowrap ${activeTab === 'clients' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                    >
                      Baza Klientów
                    </button>
                    <button
                      onClick={() => setActiveTab('team')}
                      className={`px-4 py-1.5 rounded text-sm font-medium transition whitespace-nowrap ${activeTab === 'team' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                    >
                      Zespół (PM/Technicy)
                    </button>
                  </>
                )}
              </nav>
            </div>
            <div className="flex items-center justify-between gap-3 lg:justify-end">
              <div className="leading-tight lg:text-right">
                <div className="text-sm font-bold text-white">{profile?.full_name || user.email}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{userRole}</div>
              </div>
              <button onClick={() => supabase.auth.signOut()} className="px-3 py-1.5 bg-slate-800 text-sm hover:bg-red-700 text-slate-200 rounded transition">
                Wyloguj
              </button>
            </div>
          </header>

          {/* GŁÓWNA ZAWARTOŚĆ STRONY */}
          <main className="flex-1 p-3 sm:p-6 min-w-0">
            {activeTab === 'workload' && <SchedulerView currentUser={user} currentUserRole={userRole} />}
            {activeTab === 'month' && <MonthView currentUser={user} currentUserRole={userRole} />}
            {activeTab === 'clients' && userRole === 'pm' && <ClientManager />}
            {activeTab === 'team' && userRole === 'pm' && <TeamManager />}
          </main>
        </>
      ) : (
        <LoginForm />
      )}
    </div>
  )
}

export default App
