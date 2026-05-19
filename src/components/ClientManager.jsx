import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Plus, Trash2, Edit2, Check, X, Building2, Tag, ChevronDown, ChevronUp, FolderPlus } from 'lucide-react'

export default function ClientManager() {
  const [clients, setClients] = useState([])
  const [categories, setCategories] = useState([])
  
  // Stan rozwijania wierszy klientów (ID klienta: true/false)
  const [expandedClients, setExpandedClients] = useState({})
  
  // Stany otwartych mini-formularzy dodawania kategorii (ID klienta: true/false)
  const [showAddFormForClient, setShowAddFormForClient] = useState({})

  // Formularze nowych wpisów
  const [newClientName, setNewClientName] = useState('')
  const [newCategoryNames, setNewCategoryNames] = useState({})
  const [newCategoryHours, setNewCategoryHours] = useState({})

  // Stan edycji kategorii inline
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [editCategoryHours, setEditCategoryHours] = useState('')

  useEffect(() => {
    fetchClients()
    fetchCategories()

    const clientsChannel = supabase
      .channel('clients-acc-realtime')
      .on('postgres_changes', { event: '*', scheme: 'public', table: 'clients' }, () => fetchClients())
      .subscribe()

    const categoriesChannel = supabase
      .channel('categories-acc-realtime')
      .on('postgres_changes', { event: '*', scheme: 'public', table: 'client_categories' }, () => fetchCategories())
      .subscribe()

    return () => {
      supabase.removeChannel(clientsChannel)
      supabase.removeChannel(categoriesChannel)
    }
  }, [])

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('*').order('name', { ascending: true })
    if (data) setClients(data)
  }

  const fetchCategories = async () => {
    const { data } = await supabase.from('client_categories').select('*').order('name', { ascending: true })
    if (data) setCategories(data)
  }

  const toggleClientExpand = (clientId) => {
    setExpandedClients(prev => ({ ...prev, [clientId]: !prev[clientId] }))
  }

  const toggleAddForm = (clientId, e) => {
    e.stopPropagation() // Żeby nie triggerować rozwijania całego wiersza
    setShowAddFormForClient(prev => ({ ...prev, [clientId]: !prev[clientId] }))
    // Jeśli otwieramy formularz, upewnijmy się, że wiersz jest też rozwinięty
    if (!showAddFormForClient[clientId]) {
      setExpandedClients(prev => ({ ...prev, [clientId]: true }))
    }
  }

  const handleAddClient = async (e) => {
    e.preventDefault()
    if (!newClientName.trim()) return
    const { error } = await supabase.from('clients').insert([{ name: newClientName.trim() }])
    if (!error) {
      setNewClientName('')
      fetchClients()
    }
  }

  const handleDeleteClient = async (id, name) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć klienta ${name} i wszystkie jego przypisane kategorie?`)) return
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (!error) {
      fetchClients()
      fetchCategories()
    }
  }

  const handleAddCategory = async (e, clientId) => {
    e.preventDefault()
    const catName = newCategoryNames[clientId] || ''
    const catHours = newCategoryHours[clientId] || '8' // Domyślnie podpowiadamy 8

    if (!catName.trim()) return

    const { error } = await supabase.from('client_categories').insert([
      {
        client_id: clientId,
        name: catName.trim(),
        default_hours: Number(catHours) || 1
      }
    ])

    if (!error) {
      setNewCategoryNames({ ...newCategoryNames, [clientId]: '' })
      setNewCategoryHours({ ...newCategoryHours, [clientId]: '' })
      setShowAddFormForClient({ ...showAddFormForClient, [clientId]: false })
      fetchCategories()
    }
  }

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Usunąć tę kategorię rozliczeniową?')) return
    const { error } = await supabase.from('client_categories').delete().eq('id', id)
    if (!error) fetchCategories()
  }

  const startEditingCategory = (cat) => {
    setEditingCategoryId(cat.id)
    setEditCategoryName(cat.name)
    setEditCategoryHours(cat.default_hours.toString())
  }

  const cancelEditingCategory = () => {
    setEditingCategoryId(null)
    setEditCategoryName('')
    setEditCategoryHours('')
  }

  const handleUpdateCategory = async (id) => {
    if (!editCategoryName.trim()) return
    const { error } = await supabase.from('client_categories').update({
      name: editCategoryName.trim(),
      default_hours: Number(editCategoryHours) || 1
    }).eq('id', id)

    if (!error) {
      setEditingCategoryId(null)
      fetchCategories()
    }
  }

  return (
    <div className="space-y-6">
      {/* NAGŁÓWEK */}
      <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-900">Baza Klientów i Kategorii</h2>
        <p className="text-sm text-slate-500">Zarządzaj strukturą sieciową kontrahentów w formie rozwijanej listy</p>
      </div>

      {/* REJESTRACJA NOWEGO KLIENTA */}
      <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200">
        <form onSubmit={handleAddClient} className="flex gap-3 max-w-md">
          <div className="relative flex-1">
            <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Wpisz nazwę nowej sieci..."
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              className="pl-9 pr-3 py-2 w-full border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition outline-none font-semibold"
              required
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg shadow-sm transition flex items-center gap-1.5 shrink-0">
            <Plus size={16} /> Dodaj sieć
          </button>
        </form>
      </div>

      {/* ROZWIJANE MENU AKORDEONOWE (KLIENCI) */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {clients.map((client) => {
          const clientCats = categories.filter((c) => c.client_id === client.id)
          const isExpanded = !!expandedClients[client.id]
          const isFormOpen = !!showAddFormForClient[client.id]

          return (
            <div key={client.id} className="w-full transition">
              {/* 🏢 GŁÓWNY WIERSZ MENU KLIENTA */}
              <div 
                onClick={() => toggleClientExpand(client.id)}
                className={`p-4 flex items-center justify-between cursor-pointer transition select-none ${isExpanded ? 'bg-slate-50/70 font-black' : 'hover:bg-slate-50/40'}`}
              >
                <div className="flex items-center space-x-3 truncate">
                  {isExpanded ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-400" />}
                  <Building2 size={18} className="text-blue-600 shrink-0" />
                  <span className="text-base text-slate-800 font-bold truncate">{client.name}</span>
                  <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-black">
                    {clientCats.length}
                  </span>
                </div>

                {/* Akcje po prawej stronie wiersza */}
                <div className="flex items-center space-x-2">
                  {/* SZYBKI PRZYCISK DODAWANIA NOWEJ KATEGORII */}
                  <button
                    onClick={(e) => toggleAddForm(client.id, e)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 border ${isFormOpen ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'}`}
                  >
                    <FolderPlus size={13} />
                    <span>{isFormOpen ? 'Zamknij' : 'Dodaj kat.'}</span>
                  </button>
                  
                  {/* USUWANIE FIRMY */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteClient(client.id, client.name); }}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                    title="Usuń całą sieć"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* 📂 ROZWIJANE MENU KATEGORII WIERZCHU */}
              {isExpanded && (
                <div className="bg-white px-6 pb-4 pt-2 border-t border-slate-50 space-y-3">
                  
                  {/* MODAL / ROW DODAWANIA NOWEJ KATEGORII (JEŚLI AKTYWNY) */}
                  {isFormOpen && (
                    <form 
                      onSubmit={(e) => handleAddCategory(e, client.id)}
                      className="bg-amber-50/50 p-3 rounded-lg border border-amber-200/60 flex flex-wrap items-center gap-3 animate-fadeIn mb-2"
                    >
                      <div className="flex-1 min-w-[180px]">
                        <input
                          type="text"
                          placeholder="Wpisz nazwę kategorii (np. Remodeling nocny)..."
                          value={newCategoryNames[client.id] || ''}
                          onChange={(e) => setNewCategoryNames({ ...newCategoryNames, [client.id]: e.target.value })}
                          className="px-3 py-1.5 w-full border border-slate-300 rounded-lg text-xs bg-white font-medium outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                          required
                        />
                      </div>
                      <div className="flex items-center space-x-1.5 text-xs text-slate-600">
                        <span>⏱️ Czas domyślny:</span>
                        <input
                          type="number"
                          min="1"
                          placeholder="8"
                          value={newCategoryHours[client.id] || ''}
                          onChange={(e) => setNewCategoryHours({ ...newCategoryHours, [client.id]: e.target.value })}
                          className="w-14 px-2 py-1.5 border border-slate-300 rounded-lg text-center font-bold bg-white"
                        />
                        <span>godz.</span>
                      </div>
                      <button type="submit" className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-sm transition">
                        Zapisz i dodaj
                      </button>
                    </form>
                  )}

                  {/* SUB-LISTA KATEGORII UMOWNYCH */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {clientCats.map((cat) => {
                      const isEditing = editingCategoryId === cat.id

                      return (
                        <div
                          key={cat.id}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition ${
                            isEditing
                              ? 'bg-blue-50 border-blue-400 shadow-sm'
                              : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {isEditing ? (
                            /* 📝 TRYB EDYCJI KATEGORII INLINE */
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-1.5 flex-1 pr-2">
                                <Tag size={12} className="text-blue-600 shrink-0" />
                                <input
                                  type="text"
                                  value={editCategoryName}
                                  onChange={(e) => setEditCategoryName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUpdateCategory(cat.id)
                                    if (e.key === 'Escape') cancelEditingCategory()
                                  }}
                                  className="px-2 py-1 border rounded bg-white font-bold text-xs w-full outline-none focus:ring-1 focus:ring-blue-500"
                                  autoFocus
                                />
                              </div>
                              <div className="flex items-center gap-1 text-slate-500 font-normal mr-2 shrink-0">
                                ⏱️
                                <input
                                  type="number"
                                  min="1"
                                  value={editCategoryHours}
                                  onChange={(e) => setEditCategoryHours(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUpdateCategory(cat.id)
                                    if (e.key === 'Escape') cancelEditingCategory()
                                  }}
                                  className="w-10 text-center border rounded font-bold bg-white p-0.5 text-xs text-slate-800"
                                />
                                h
                              </div>
                              <div className="flex items-center space-x-1 shrink-0">
                                <button onClick={() => handleUpdateCategory(cat.id)} className="p-1 text-green-700 hover:bg-green-100 rounded-lg transition"><Check size={14} /></button>
                                <button onClick={cancelEditingCategory} className="p-1 text-slate-500 hover:bg-slate-200 rounded-lg transition"><X size={14} /></button>
                              </div>
                            </div>
                          ) : (
                            /* 🏷️ STANDARDOWY PODGLĄD KATEGORII */
                            <>
                              <div className="flex items-center space-x-2 truncate">
                                <Tag size={12} className="text-slate-400 shrink-0" />
                                <span className="truncate text-slate-800">{cat.name}</span>
                                <span className="text-[10px] bg-white text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-md font-medium shrink-0">
                                  ⏱️ {cat.default_hours}h
                                </span>
                              </div>
                              
                              <div className="flex items-center space-x-1 ml-2 shrink-0 border-l border-slate-200 pl-1.5">
                                <button
                                  onClick={() => startEditingCategory(cat)}
                                  className="text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-white transition"
                                  title="Edytuj"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={() => handleDeleteCategory(cat.id)}
                                  className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-white transition"
                                  title="Usuń"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}

                    {clientCats.length === 0 && !isFormOpen && (
                      <p className="text-xs text-slate-400 italic py-1 col-span-full">Brak kategorii. Kliknij przycisk „Dodaj kat.” na górze wiersza.</p>
                    )}
                  </div>

                </div>
              )}
            </div>
          )
        })}

        {clients.length === 0 && (
          <div className="text-center p-12 text-slate-400">
            Brak zdefiniowanych sieci w bazie. Dodaj pierwszą powyżej.
          </div>
        )}
      </div>
    </div>
  )
}
