import { useState } from 'react'
import { Category, Filter, Priority, Todo } from './types'
import { buildGroups } from './groups'
import AddTask from './components/AddTask'
import Sidebar from './components/Sidebar'
import TaskItem from './components/TaskItem'
import Footer from './components/Footer'
import { useLang } from './LangContext'

function loadTodos(): Todo[] {
  try {
    const raw: unknown[] = JSON.parse(localStorage.getItem('todos') || '[]')
    return raw.map((t) => {
      const item = t as { id: number; text: string; done: boolean; priority?: Priority; dueDate?: string }
      return { priority: 'medium', dueDate: '', ...item }
    })
  } catch {
    return []
  }
}

export default function App() {
  const { t } = useLang()
  const [todos, setTodos] = useState<Todo[]>(loadTodos)
  const [filter, setFilter] = useState<Filter>('all')

  function save(next: Todo[]) {
    setTodos(next)
    localStorage.setItem('todos', JSON.stringify(next))
  }

  function addTask(text: string, priority: Priority, dueDate: string, category?: Category) {
    save([{ id: Date.now(), text, done: false, priority, dueDate, category }, ...todos])
  }

  function toggle(id: number) {
    save(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  function remove(id: number) {
    save(todos.filter((t) => t.id !== id))
  }

  function clearDone() {
    save(todos.filter((t) => !t.done))
  }

  function updatePriority(id: number, priority: Priority) {
    save(todos.map((t) => (t.id === id ? { ...t, priority } : t)))
  }

  function updateDueDate(id: number, dueDate: string) {
    save(todos.map((t) => (t.id === id ? { ...t, dueDate } : t)))
  }

  function updateCategory(id: number, category: Category) {
    save(todos.map((t) => (t.id === id ? { ...t, category } : t)))
  }

  function updateText(id: number, text: string) {
    save(todos.map((t) => (t.id === id ? { ...t, text } : t)))
  }

  const filtered = todos.filter((t) => {
    if (filter === 'done')   return t.done
    if (filter === 'home')   return t.category === 'home'
    if (filter === 'school') return t.category === 'school'
    if (filter === 'work')   return t.category === 'work'
    return true
  })
  const groups = buildGroups(filtered)
  const totalOpen = todos.filter((t) => !t.done).length
  const visibleRemaining = filtered.filter((t) => !t.done).length
  const completedCount = todos.filter((t) => t.done).length
  const filterCounts: Record<Filter, number> = {
    all:    totalOpen,
    home:   todos.filter((t) => t.category === 'home'   && !t.done).length,
    school: todos.filter((t) => t.category === 'school' && !t.done).length,
    work:   todos.filter((t) => t.category === 'work'   && !t.done).length,
    done:   completedCount,
  }

  const hour = new Date().getHours()
  const greetingKey: 'morning' | 'afternoon' | 'evening' =
    hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

  const listTitle = t.filters[filter]
  const listCount = filter === 'done' ? completedCount : visibleRemaining

  return (
    <div className="app-shell">
      <Sidebar
        filter={filter}
        onFilter={setFilter}
        counts={filterCounts}
        greetingKey={greetingKey}
      />
      <main className="content">
        <header className="content-header">
          <div className="content-titles">
            <h1 className="large-title">{listTitle}</h1>
            <p className="content-subtitle">{t.listSubtitle(listCount)}</p>
          </div>
        </header>

        <div className="content-body">
          <AddTask onAdd={addTask} />

          {groups.length === 0 ? (
            <p className="empty">{t.emptyState}</p>
          ) : (
            groups.map((group) => (
              <section key={group.key} className="group">
                <h2 className={`group-header${group.overdue ? ' group-header--overdue' : ''}`}>
                  {t.groups[group.key]}
                </h2>
                <ul className="list">
                  {group.todos.map((td) => (
                    <TaskItem
                      key={td.id}
                      todo={td}
                      onToggle={toggle}
                      onRemove={remove}
                      onUpdatePriority={updatePriority}
                      onUpdateDueDate={updateDueDate}
                      onUpdateCategory={updateCategory}
                      onUpdateText={updateText}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}

          <Footer remaining={visibleRemaining} completedCount={completedCount} onClearDone={clearDone} />
        </div>
      </main>
    </div>
  )
}
