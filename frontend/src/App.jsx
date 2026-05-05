import React, { useState, useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════
   PRIORITY CONFIG
═══════════════════════════════════════════════════════ */
const PRIORITIES = {
  high:   { label: 'High',   color: '#ef4444', bg: 'rgba(239,68,68,0.18)',  border: 'rgba(239,68,68,0.4)'  },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.4)' },
  low:    { label: 'Low',    color: '#10b981', bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.4)' },
};

const LS_KEY    = 'startupvantage_todos';
const loadTodos = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const saveTodos = (t) => localStorage.setItem(LS_KEY, JSON.stringify(t));

/* ═══════════════════════════════════════════════════════
   EXPENSE TRACKER CONFIG
═══════════════════════════════════════════════════════ */
const EXP_CATEGORIES = [
  { key: 'Marketing',  color: '#a855f7', bg: 'rgba(168,85,247,0.15)',  border: 'rgba(168,85,247,0.4)',  icon: '📣' },
  { key: 'Salaries',   color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.4)',  icon: '👥' },
  { key: 'Infra',      color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.4)',  icon: '🖥️' },
  { key: 'Operations', color: '#10b981', bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.4)',  icon: '⚙️' },
  { key: 'Legal',      color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.4)',   icon: '⚖️' },
  { key: 'R&D',        color: '#06b6d4', bg: 'rgba(6,182,212,0.15)',   border: 'rgba(6,182,212,0.4)',   icon: '🔬' },
  { key: 'Other',      color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.4)', icon: '📦' },
];
const CAT_MAP = Object.fromEntries(EXP_CATEGORIES.map(c => [c.key, c]));
const EXP_LS_KEY    = 'startupvantage_expenses';
const loadExpenses  = () => { try { return JSON.parse(localStorage.getItem(EXP_LS_KEY)) || []; } catch { return []; } };
const saveExpenses  = (e) => localStorage.setItem(EXP_LS_KEY, JSON.stringify(e));
const fmtM = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const monthLabel = (ym) => { const [y, m] = ym.split('-'); return new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' }); };

/* ═══════════════════════════════════════════════════════
   MAIN APP — DASHBOARD
═══════════════════════════════════════════════════════ */
export default function App() {

  /* ── Prediction state ─────────────────────────────── */
  const [file,       setFile]       = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading,  setIsLoading]  = useState(false);
  const [results,    setResults]    = useState(null);
  const [error,      setError]      = useState(null);
  const fileInputRef = useRef(null);

  /* ── Tab state ────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState('dashboard');

  /* ── TODO state ───────────────────────────────────── */
  const [todos,     setTodos]     = useState(loadTodos);
  const [todoInput, setTodoInput] = useState('');
  const [priority,  setPriority]  = useState('medium');
  const [filter,    setFilter]    = useState('all');
  const [editId,    setEditId]    = useState(null);
  const [editText,  setEditText]  = useState('');
  const todoInputRef = useRef(null);

  useEffect(() => { saveTodos(todos); }, [todos]);

  /* ── Expense state ────────────────────────────────── */
  const [expenses,    setExpenses]    = useState(loadExpenses);
  const [expAmount,   setExpAmount]   = useState('');
  const [expDesc,     setExpDesc]     = useState('');
  const [expCategory, setExpCategory] = useState('Marketing');
  const [expDate,     setExpDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [expMonthFlt, setExpMonthFlt] = useState(() => new Date().toISOString().slice(0, 7));
  const [expFormErr,  setExpFormErr]  = useState('');

  useEffect(() => { saveExpenses(expenses); }, [expenses]);

  /* ── Expense handlers ─────────────────────────────── */
  const addExpense = () => {
    const amt = parseFloat(expAmount);
    if (!expDesc.trim()) { setExpFormErr('Please enter a description.'); return; }
    if (isNaN(amt) || amt <= 0) { setExpFormErr('Please enter a valid positive amount.'); return; }
    setExpFormErr('');
    setExpenses(prev => [{
      id:       Date.now(),
      amount:   amt,
      desc:     expDesc.trim(),
      category: expCategory,
      date:     expDate,
      month:    expDate.slice(0, 7),
    }, ...prev]);
    setExpAmount(''); setExpDesc('');
  };
  const deleteExpense = (id) => setExpenses(prev => prev.filter(e => e.id !== id));

  /* ── Expense derived data ─────────────────────────── */
  const monthlyExpenses  = expenses.filter(e => e.month === expMonthFlt);
  const monthTotal       = monthlyExpenses.reduce((s, e) => s + e.amount, 0);
  const allMonths        = [...new Set(expenses.map(e => e.month))].sort().reverse();
  const catTotals        = EXP_CATEGORIES.map(cat => ({
    ...cat,
    total: monthlyExpenses.filter(e => e.category === cat.key).reduce((s, e) => s + e.amount, 0),
    count: monthlyExpenses.filter(e => e.category === cat.key).length,
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const maxCatTotal      = catTotals.length ? catTotals[0].total : 1;
  const prevMonthTotal   = (() => {
    if (allMonths.length < 2) return null;
    const prev = allMonths.find(m => m < expMonthFlt);
    if (!prev) return null;
    return expenses.filter(e => e.month === prev).reduce((s, e) => s + e.amount, 0);
  })();

  /* ── Calendar state ────────────────────────────────── */
  const CAL_TYPES = [
    { key: 'Meeting',  color: '#3b82f6', bg: 'rgba(59,130,246,0.18)',  icon: '🤝' },
    { key: 'Deadline', color: '#ef4444', bg: 'rgba(239,68,68,0.18)',   icon: '⏰' },
    { key: 'Demo',     color: '#a855f7', bg: 'rgba(168,85,247,0.18)',  icon: '🎬' },
    { key: 'Review',   color: '#f59e0b', bg: 'rgba(245,158,11,0.18)',  icon: '📝' },
    { key: 'Launch',   color: '#10b981', bg: 'rgba(16,185,129,0.18)',  icon: '🚀' },
    { key: 'Personal', color: '#ec4899', bg: 'rgba(236,72,153,0.18)',  icon: '👤' },
  ];
  const CAL_TYPE_MAP = Object.fromEntries(CAL_TYPES.map(t => [t.key, t]));
  const CAL_LS_KEY   = 'startupvantage_calendar';
  const loadCalEvents  = () => { try { return JSON.parse(localStorage.getItem(CAL_LS_KEY)) || []; } catch { return []; } };

  const [calEvents,      setCalEvents]      = useState(loadCalEvents);
  const [calMonth,       setCalMonth]       = useState(() => new Date().toISOString().slice(0, 7));
  const [calSelected,    setCalSelected]    = useState(() => new Date().toISOString().slice(0, 10));
  const [calFormTitle,   setCalFormTitle]   = useState('');
  const [calFormType,    setCalFormType]    = useState('Meeting');
  const [calFormTime,    setCalFormTime]    = useState('09:00');
  const [calFormNotes,   setCalFormNotes]   = useState('');
  const [calShowForm,    setCalShowForm]    = useState(false);

  useEffect(() => { localStorage.setItem(CAL_LS_KEY, JSON.stringify(calEvents)); }, [calEvents]);

  /* ── Calendar helpers ────────────────────────────── */
  const calGrid = (() => {
    const [y, m] = calMonth.split('-').map(Number);
    const firstDow   = new Date(y, m - 1, 1).getDay();
    const daysInMon  = new Date(y, m, 0).getDate();
    const prevDays   = new Date(y, m - 1, 0).getDate();
    const cells = [];
    for (let i = firstDow - 1; i >= 0; i--) cells.push({ date: null, dim: true, day: prevDays - i });
    for (let d = 1; d <= daysInMon; d++) cells.push({ date: `${calMonth}-${String(d).padStart(2,'0')}`, dim: false, day: d });
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) cells.push({ date: null, dim: true, day: d });
    return cells;
  })();

  const calNavigate = (dir) => {
    const [y, m] = calMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  };

  const calAddEvent = () => {
    if (!calFormTitle.trim()) return;
    setCalEvents(prev => [...prev, {
      id:    Date.now(),
      date:  calSelected,
      title: calFormTitle.trim(),
      type:  calFormType,
      time:  calFormTime,
      notes: calFormNotes.trim(),
    }]);
    setCalFormTitle(''); setCalFormNotes(''); setCalShowForm(false);
  };
  const calDeleteEvent = (id) => setCalEvents(prev => prev.filter(e => e.id !== id));

  const eventsOnDate   = (date) => calEvents.filter(e => e.date === date);
  const selectedEvents = eventsOnDate(calSelected).sort((a,b) => a.time.localeCompare(b.time));
  const todayStr       = new Date().toISOString().slice(0, 10);
  const calMonthName   = (() => {
    const [y, m] = calMonth.split('-');
    return new Date(+y, +m-1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  })();
  const totalCalEvents = calEvents.filter(e => e.date.startsWith(calMonth)).length;

  /* ── Team Task Board state ──────────────────────────── */
  const DEPARTMENTS = [
    { key: 'Engineering', color: '#3b82f6', icon: '🔧' },
    { key: 'Marketing',   color: '#a855f7', icon: '📣' },
    { key: 'Sales',       color: '#10b981', icon: '💼' },
    { key: 'Design',      color: '#ec4899', icon: '🎨' },
    { key: 'Legal',       color: '#ef4444', icon: '⚖️' },
    { key: 'Finance',     color: '#f59e0b', icon: '💰' },
    { key: 'Operations',  color: '#06b6d4', icon: '⚙️' },
  ];
  const DEPT_MAP   = Object.fromEntries(DEPARTMENTS.map(d => [d.key, d]));
  const TM_STATUSES = ['Todo', 'In Progress', 'Review', 'Done'];
  const TM_PRIORITIES = [
    { key: 'Critical', color: '#ef4444' },
    { key: 'High',     color: '#f59e0b' },
    { key: 'Medium',   color: '#3b82f6' },
    { key: 'Low',      color: '#10b981' },
  ];
  const TM_PRIORITY_MAP = Object.fromEntries(TM_PRIORITIES.map(p => [p.key, p]));
  const TM_STATUS_CFG = {
    'Todo':        { color: '#94a3b8', icon: '○' },
    'In Progress': { color: '#3b82f6', icon: '◔' },
    'Review':      { color: '#f59e0b', icon: '👁️' },
    'Done':        { color: '#10b981', icon: '✓' },
  };
  const TM_LS_KEY    = 'startupvantage_teamtasks';
  const loadTmTasks  = () => { try { return JSON.parse(localStorage.getItem(TM_LS_KEY)) || []; } catch { return []; } };

  const [tmTasks,      setTmTasks]      = useState(loadTmTasks);
  const [tmShowForm,   setTmShowForm]   = useState(false);
  const [tmFTitle,     setTmFTitle]     = useState('');
  const [tmFDesc,      setTmFDesc]      = useState('');
  const [tmFDept,      setTmFDept]      = useState('Engineering');
  const [tmFEmployee,  setTmFEmployee]  = useState('');
  const [tmFPriority,  setTmFPriority]  = useState('Medium');
  const [tmFDueDate,   setTmFDueDate]   = useState(() => new Date(Date.now() + 7*86400000).toISOString().slice(0,10));
  const [tmFStatus,    setTmFStatus]    = useState('Todo');
  const [tmFilterDept, setTmFilterDept] = useState('All');
  const [tmFilterPrio, setTmFilterPrio] = useState('All');
  const [tmSearch,     setTmSearch]     = useState('');

  useEffect(() => { localStorage.setItem(TM_LS_KEY, JSON.stringify(tmTasks)); }, [tmTasks]);

  const tmAddTask = () => {
    if (!tmFTitle.trim()) return;
    setTmTasks(prev => [...prev, {
      id:         Date.now(),
      title:      tmFTitle.trim(),
      desc:       tmFDesc.trim(),
      department: tmFDept,
      employee:   tmFEmployee.trim() || 'Unassigned',
      priority:   tmFPriority,
      status:     tmFStatus,
      dueDate:    tmFDueDate,
      createdAt:  new Date().toISOString(),
    }]);
    setTmFTitle(''); setTmFDesc(''); setTmFEmployee(''); setTmShowForm(false);
  };
  const tmDeleteTask  = (id) => setTmTasks(prev => prev.filter(t => t.id !== id));
  const tmChangeStatus = (id, status) => setTmTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));

  const tmFiltered = tmTasks.filter(t => {
    if (tmFilterDept !== 'All' && t.department !== tmFilterDept) return false;
    if (tmFilterPrio !== 'All' && t.priority   !== tmFilterPrio) return false;
    if (tmSearch && !t.title.toLowerCase().includes(tmSearch.toLowerCase()) &&
        !t.employee.toLowerCase().includes(tmSearch.toLowerCase())) return false;
    return true;
  });
  const tmByStatus = (s) => tmFiltered.filter(t => t.status === s);
  const tmOverdue  = (t) => t.dueDate && t.status !== 'Done' && new Date(t.dueDate) < new Date();
  const totalTmTasks = tmTasks.length;

  /* ── Prediction handlers ──────────────────────────── */
  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver  = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDrop      = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFileSelection(e.dataTransfer.files[0]);
  };
  const handleFileInput = (e) => { if (e.target.files?.length) handleFileSelection(e.target.files[0]); };
  const handleFileSelection = (f) => {
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv','xlsx','xls'].includes(ext)) { setError('Please upload a .csv, .xlsx, or .xls file.'); setFile(null); return; }
    setError(null); setFile(f); setResults(null);
  };
  const handlePredict = async () => {
    if (!file) return;
    setIsLoading(true); setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('http://127.0.0.1:8000/predict', { method: 'POST', body: formData });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Prediction failed.'); }
      const data = await res.json();
      setResults(data.predictions);
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const formatCurrency = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

  /* ── TODO handlers ────────────────────────────────── */
  const addTodo = () => {
    const text = todoInput.trim();
    if (!text) return;
    setTodos(prev => [{ id: Date.now(), text, priority, done: false, createdAt: new Date().toISOString() }, ...prev]);
    setTodoInput('');
  };
  const toggleDone  = (id) => setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const deleteTodo  = (id) => setTodos(prev => prev.filter(t => t.id !== id));
  const clearDone   = ()   => setTodos(prev => prev.filter(t => !t.done));
  const startEdit   = (todo) => { setEditId(todo.id); setEditText(todo.text); };
  const saveEdit    = (id) => {
    const text = editText.trim();
    if (text) setTodos(prev => prev.map(t => t.id === id ? { ...t, text } : t));
    setEditId(null);
  };

  const visibleTodos = todos.filter(t =>
    filter === 'all' ? true : filter === 'active' ? !t.done : t.done
  );
  const doneCount   = todos.filter(t => t.done).length;
  const activeCount = todos.filter(t => !t.done).length;
  const progressPct = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;

  /* ── Stats derived from results ───────────────────── */
  const statsData = results ? {
    total:    results.length,
    success:  results.filter(r => r.predicted_status_code === 1).length,
    failed:   results.filter(r => r.predicted_status_code === 0).length,
    avgFund:  results.reduce((s, r) => s + r.forecasted_total_funding, 0) / results.length,
    critical: results.filter(r => r.risk_tier === 'Critical').length,
  } : null;

  /* ── Render ───────────────────────────────────────── */
  return (
    <div className="dashboard">

      {/* ━━━━━━━━━━━━━━━━  TOP NAV  ━━━━━━━━━━━━━━━━━━━━ */}
      <header className="dash-nav">
        <div className="dash-nav-brand">
          <span className="dash-nav-logo">🚀</span>
          <div>
            <span className="dash-nav-title">StartupVantage AI</span>
            <span className="dash-nav-subtitle">Prediction Dashboard</span>
          </div>
        </div>
        <div className="dash-nav-pills">
          {results && (
            <span className="dash-results-pill">{results.length} Startups Analyzed</span>
          )}
        </div>
      </header>

      {/* ━━━━━━━━━━━━━━━━  BODY  ━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="dash-body">

        {/* ════════ MAIN CONTENT ════════ */}
        <main className="dash-main">

          {/* ── Tab switcher ── */}
          <div className="main-tabs">
            <button
              id="tab-dashboard"
              className={`main-tab ${activeTab === 'dashboard' ? 'main-tab--active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              🏠 Dashboard
            </button>
            <button
              id="tab-prediction"
              className={`main-tab ${activeTab === 'prediction' ? 'main-tab--active' : ''}`}
              onClick={() => setActiveTab('prediction')}
            >
              🤖 Prediction Engine
            </button>
            <button
              id="tab-expenses"
              className={`main-tab ${activeTab === 'expenses' ? 'main-tab--active' : ''}`}
              onClick={() => setActiveTab('expenses')}
            >
              💰 Expense Tracker
              {expenses.length > 0 && <span className="main-tab-badge">{expenses.length}</span>}
            </button>
            <button
              id="tab-calendar"
              className={`main-tab ${activeTab === 'calendar' ? 'main-tab--active' : ''}`}
              onClick={() => setActiveTab('calendar')}
            >
              📅 Calendar
              {totalCalEvents > 0 && <span className="main-tab-badge" style={{background:'rgba(16,185,129,0.35)',color:'#6ee7b7',borderColor:'rgba(16,185,129,0.4)'}}>{totalCalEvents}</span>}
            </button>
            <button
              id="tab-team"
              className={`main-tab ${activeTab === 'team' ? 'main-tab--active' : ''}`}
              onClick={() => setActiveTab('team')}
            >
              🏢 Team Board
              {totalTmTasks > 0 && <span className="main-tab-badge" style={{background:'rgba(236,72,153,0.25)',color:'#f9a8d4',borderColor:'rgba(236,72,153,0.4)'}}>{totalTmTasks}</span>}
            </button>
            <button
              id="tab-tasks"
              className={`main-tab ${activeTab === 'tasks' ? 'main-tab--active' : ''}`}
              onClick={() => setActiveTab('tasks')}
            >
              📋 My Tasks
              {todos.length > 0 && <span className="main-tab-badge" style={{background:'rgba(99,102,241,0.25)',color:'#a5b4fc',borderColor:'rgba(99,102,241,0.4)'}}>{activeCount}</span>}
            </button>
          </div>

          {/* ══════════════ HOME DASHBOARD TAB ══════════════ */}
          {activeTab === 'dashboard' && (() => {
            const now         = new Date();
            const thisMonth   = now.toISOString().slice(0, 7);
            const monthExp    = expenses.filter(e => e.month === thisMonth);
            const monthTotal  = monthExp.reduce((s, e) => s + e.amount, 0);
            const allExpTotal = expenses.reduce((s, e) => s + e.amount, 0);
            const activeTodos = todos.filter(t => !t.done);
            const doneTodos   = todos.filter(t => t.done);
            const todoPct     = todos.length ? Math.round((doneTodos.length / todos.length) * 100) : 0;
            const tmByStatus  = {
              todo:       tmTasks.filter(t => t.status === 'todo').length,
              inprogress: tmTasks.filter(t => t.status === 'inprogress').length,
              review:     tmTasks.filter(t => t.status === 'review').length,
              done:       tmTasks.filter(t => t.status === 'done').length,
            };
            const upcomingEvts = Object.entries(calEvents)
              .flatMap(([date, evts]) => evts.map(e => ({ ...e, date })))
              .filter(e => e.date >= now.toISOString().slice(0, 10))
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 4);
            const catBreakdown = EXP_CATEGORIES.map(cat => ({
              ...cat,
              total: monthExp.filter(e => e.category === cat.key).reduce((s, e) => s + e.amount, 0),
            })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
            const maxCat = catBreakdown.length ? catBreakdown[0].total : 1;
            const highPrio  = todos.filter(t => !t.done && t.priority === 'high').length;
            return (
              <div className="db-layout">

                {/* ── Welcome Banner ── */}
                <div className="db-banner">
                  <div className="db-banner-left">
                    <h1 className="db-welcome">Welcome back 👋</h1>
                    <p className="db-welcome-sub">Here's what's happening across your startup today — {now.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
                  </div>
                  <div className="db-banner-actions">
                    <button className="db-quick-btn" onClick={() => setActiveTab('prediction')}>🤖 Run Prediction</button>
                    <button className="db-quick-btn db-quick-btn--primary" onClick={() => setActiveTab('tasks')}>+ Add Task</button>
                  </div>
                </div>

                {/* ── KPI Row ── */}
                <div className="db-kpi-row">
                  <div className="db-kpi-card glass-card" onClick={() => setActiveTab('tasks')}>
                    <div className="db-kpi-icon" style={{background:'rgba(37,99,235,0.1)',color:'#2563eb'}}>📋</div>
                    <div className="db-kpi-body">
                      <span className="db-kpi-value">{todos.length}</span>
                      <span className="db-kpi-label">Total Tasks</span>
                    </div>
                    <div className="db-kpi-sub">
                      <span className="db-kpi-badge" style={{background:'rgba(37,99,235,0.1)',color:'#2563eb'}}>{activeTodos.length} active</span>
                      <span className="db-kpi-badge" style={{background:'rgba(5,150,105,0.1)',color:'#059669'}}>{doneTodos.length} done</span>
                    </div>
                    <div className="db-kpi-bar-wrap"><div className="db-kpi-bar" style={{width:`${todoPct}%`,background:'#2563eb'}} /></div>
                  </div>

                  <div className="db-kpi-card glass-card" onClick={() => setActiveTab('expenses')}>
                    <div className="db-kpi-icon" style={{background:'rgba(168,85,247,0.1)',color:'#7c3aed'}}>💰</div>
                    <div className="db-kpi-body">
                      <span className="db-kpi-value">₹{monthTotal.toLocaleString('en-IN')}</span>
                      <span className="db-kpi-label">This Month's Spend</span>
                    </div>
                    <div className="db-kpi-sub">
                      <span className="db-kpi-badge" style={{background:'rgba(168,85,247,0.1)',color:'#7c3aed'}}>{expenses.length} entries</span>
                      <span className="db-kpi-badge" style={{background:'rgba(15,23,42,0.07)',color:'#475569'}}>₹{allExpTotal.toLocaleString('en-IN')} all-time</span>
                    </div>
                    <div className="db-kpi-bar-wrap"><div className="db-kpi-bar" style={{width:`${Math.min(100,(monthTotal/50000)*100)}%`,background:'#7c3aed'}} /></div>
                  </div>

                  <div className="db-kpi-card glass-card" onClick={() => setActiveTab('calendar')}>
                    <div className="db-kpi-icon" style={{background:'rgba(5,150,105,0.1)',color:'#059669'}}>📅</div>
                    <div className="db-kpi-body">
                      <span className="db-kpi-value">{Object.values(calEvents).flat().length}</span>
                      <span className="db-kpi-label">Calendar Events</span>
                    </div>
                    <div className="db-kpi-sub">
                      <span className="db-kpi-badge" style={{background:'rgba(5,150,105,0.1)',color:'#059669'}}>{upcomingEvts.length} upcoming</span>
                    </div>
                    <div className="db-kpi-bar-wrap"><div className="db-kpi-bar" style={{width:`${Math.min(100,Object.values(calEvents).flat().length*10)}%`,background:'#059669'}} /></div>
                  </div>

                  <div className="db-kpi-card glass-card" onClick={() => setActiveTab('team')}>
                    <div className="db-kpi-icon" style={{background:'rgba(220,38,38,0.1)',color:'#dc2626'}}>🏢</div>
                    <div className="db-kpi-body">
                      <span className="db-kpi-value">{tmTasks.length}</span>
                      <span className="db-kpi-label">Team Tasks</span>
                    </div>
                    <div className="db-kpi-sub">
                      <span className="db-kpi-badge" style={{background:'rgba(245,158,11,0.1)',color:'#d97706'}}>{tmByStatus.inprogress} in progress</span>
                      <span className="db-kpi-badge" style={{background:'rgba(5,150,105,0.1)',color:'#059669'}}>{tmByStatus.done} done</span>
                    </div>
                    <div className="db-kpi-bar-wrap"><div className="db-kpi-bar" style={{width:tmTasks.length?`${Math.round((tmByStatus.done/tmTasks.length)*100)}%`:'0%',background:'#dc2626'}} /></div>
                  </div>
                </div>

                {/* ── Main grid ── */}
                <div className="db-grid">

                  {/* Left column */}
                  <div className="db-col-left">

                    {/* Task Priorities */}
                    <div className="db-panel glass-card">
                      <div className="db-panel-header">
                        <span className="db-panel-title">📋 Task Overview</span>
                        <button className="db-panel-link" onClick={() => setActiveTab('tasks')}>View all →</button>
                      </div>
                      <div className="db-task-progress">
                        <div className="db-progress-row">
                          <span className="db-progress-label">Completion</span>
                          <span className="db-progress-pct">{todoPct}%</span>
                        </div>
                        <div className="db-progress-track"><div className="db-progress-fill" style={{width:`${todoPct}%`,background:'linear-gradient(90deg,#2563eb,#4f46e5)'}} /></div>
                      </div>
                      {['high','medium','low'].map(pkey => {
                        const pcfg = PRIORITIES[pkey];
                        const cnt  = todos.filter(t => t.priority === pkey).length;
                        return (
                          <div key={pkey} className="db-prio-row">
                            <span className="db-prio-dot" style={{background:pcfg.color}} />
                            <span className="db-prio-name">{pcfg.label}</span>
                            <div className="db-prio-track"><div className="db-prio-fill" style={{width:todos.length?`${(cnt/todos.length)*100}%`:'0%',background:pcfg.color}} /></div>
                            <span className="db-prio-cnt">{cnt}</span>
                          </div>
                        );
                      })}
                      {todos.length === 0 && <p className="db-empty-hint">No tasks yet — <button className="db-inline-link" onClick={() => setActiveTab('tasks')}>add one</button></p>}
                    </div>

                    {/* Team Status */}
                    <div className="db-panel glass-card">
                      <div className="db-panel-header">
                        <span className="db-panel-title">🏢 Team Board Status</span>
                        <button className="db-panel-link" onClick={() => setActiveTab('team')}>View all →</button>
                      </div>
                      <div className="db-team-status-grid">
                        {[['todo','○ Todo','#64748b'],['inprogress','◔ In Progress','#d97706'],['review','👁 Review','#7c3aed'],['done','✓ Done','#059669']].map(([k,label,color]) => (
                          <div key={k} className="db-status-card">
                            <span className="db-status-count" style={{color}}>{tmByStatus[k]}</span>
                            <span className="db-status-label">{label}</span>
                          </div>
                        ))}
                      </div>
                      {tmTasks.length === 0 && <p className="db-empty-hint">No team tasks yet — <button className="db-inline-link" onClick={() => setActiveTab('team')}>add one</button></p>}
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="db-col-right">

                    {/* Expense breakdown */}
                    <div className="db-panel glass-card">
                      <div className="db-panel-header">
                        <span className="db-panel-title">💰 Expense Breakdown</span>
                        <button className="db-panel-link" onClick={() => setActiveTab('expenses')}>View all →</button>
                      </div>
                      <div className="db-exp-month">Month: <strong>{thisMonth}</strong> · Total: <strong>₹{monthTotal.toLocaleString('en-IN')}</strong></div>
                      {catBreakdown.length > 0 ? catBreakdown.map(cat => (
                        <div key={cat.key} className="db-cat-row">
                          <span className="db-cat-icon">{cat.icon}</span>
                          <span className="db-cat-name">{cat.key}</span>
                          <div className="db-cat-track"><div className="db-cat-fill" style={{width:`${(cat.total/maxCat)*100}%`,background:cat.color}} /></div>
                          <span className="db-cat-amt">₹{cat.total.toLocaleString('en-IN')}</span>
                        </div>
                      )) : <p className="db-empty-hint">No expenses this month — <button className="db-inline-link" onClick={() => setActiveTab('expenses')}>add one</button></p>}
                    </div>

                    {/* Upcoming Events */}
                    <div className="db-panel glass-card">
                      <div className="db-panel-header">
                        <span className="db-panel-title">📅 Upcoming Events</span>
                        <button className="db-panel-link" onClick={() => setActiveTab('calendar')}>View all →</button>
                      </div>
                      {upcomingEvts.length > 0 ? upcomingEvts.map((evt, i) => (
                        <div key={i} className="db-evt-row">
                          <div className="db-evt-date-block">
                            <span className="db-evt-day">{new Date(evt.date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit'})}</span>
                            <span className="db-evt-mon">{new Date(evt.date+'T00:00:00').toLocaleDateString('en-IN',{month:'short'})}</span>
                          </div>
                          <div className="db-evt-info">
                            <span className="db-evt-title">{evt.title}</span>
                            {evt.notes && <span className="db-evt-notes">{evt.notes}</span>}
                          </div>
                          <span className="db-evt-type">{evt.type}</span>
                        </div>
                      )) : <p className="db-empty-hint">No upcoming events — <button className="db-inline-link" onClick={() => setActiveTab('calendar')}>add one</button></p>}
                    </div>
                  </div>
                </div>

                {/* ── Quick Access Row ── */}
                <div className="db-quick-row">
                  {[
                    { icon:'🤖', label:'Prediction Engine', sub:'Upload & analyze startups',  tab:'prediction', color:'#2563eb' },
                    { icon:'💰', label:'Expense Tracker',   sub:'Track monthly budgets',       tab:'expenses',   color:'#7c3aed' },
                    { icon:'📅', label:'Calendar',          sub:'Meetings & deadlines',         tab:'calendar',   color:'#059669' },
                    { icon:'🏢', label:'Team Board',        sub:'Kanban task management',       tab:'team',       color:'#d97706' },
                    { icon:'📋', label:'My Tasks',          sub:'Personal task tracker',        tab:'tasks',      color:'#4f46e5' },
                  ].map(m => (
                    <div key={m.tab} className="db-module-card glass-card" onClick={() => setActiveTab(m.tab)}>
                      <span className="db-module-icon" style={{color:m.color}}>{m.icon}</span>
                      <div>
                        <div className="db-module-label">{m.label}</div>
                        <div className="db-module-sub">{m.sub}</div>
                      </div>
                      <span className="db-module-arrow" style={{color:m.color}}>→</span>
                    </div>
                  ))}
                </div>

              </div>
            );
          })()}

          {/* ══════════════ PREDICTION ENGINE TAB ══════════════ */}
          {activeTab === 'prediction' && (<>

          {/* ── Section header ── */}
          <div className="dash-main-header">
            <div>
              <h2 className="dash-main-title">
                <span className="dash-main-title-icon">🤖</span>
                Prediction Engine
              </h2>
              <p className="dash-main-subtitle">
                Upload a CSV or Excel startup dataset to batch-predict success, risk tiers and funding forecasts.
              </p>
            </div>
            <a
              href="/startup_dataset_template.xlsx"
              download="startup_dataset_template.xlsx"
              className="dash-template-link"
            >
              📥 Download Template
            </a>
          </div>


          {/* ── Upload zone ── */}
          <div
            id="upload-dropzone"
            className={`upload-zone glass-card ${isDragging ? 'upload-zone--active' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="file-input-hidden"
              onChange={handleFileInput}
              accept=".csv,.xlsx,.xls"
            />
            <div className="upload-zone-icon">{file ? '📊' : '☁️'}</div>
            {file ? (
              <>
                <p className="upload-zone-filename">{file.name}</p>
                <p className="upload-zone-hint">Click or drop to change file</p>
              </>
            ) : (
              <>
                <p className="upload-zone-primary">Drag & Drop your dataset here</p>
                <p className="upload-zone-hint">Supports .csv, .xlsx — click to browse</p>
              </>
            )}
          </div>

          {/* ── Analyze button ── */}
          {file && (
            <button
              id="analyze-btn"
              className={`analyze-btn ${isLoading ? 'analyze-btn--loading' : ''}`}
              onClick={handlePredict}
              disabled={isLoading}
            >
              {isLoading
                ? <><span className="btn-spinner" /> Analyzing…</>
                : '✨ Analyze Startups'}
            </button>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="dash-error-box">
              <span className="dash-error-icon">⚠️</span>
              {error}
            </div>
          )}

          {/* ── Stats bar (visible once results loaded) ── */}
          {statsData && (
            <div className="stats-bar">
              {[
                { label: 'Total',    value: statsData.total,                            icon: '🏢', accent: '#60a5fa' },
                { label: 'Success',  value: statsData.success,                          icon: '✅', accent: '#10b981' },
                { label: 'At Risk',  value: statsData.failed,                           icon: '⚠️', accent: '#f59e0b' },
                { label: 'Critical', value: statsData.critical,                         icon: '🔴', accent: '#ef4444' },
                { label: 'Avg Fund', value: formatCurrency(statsData.avgFund),          icon: '💰', accent: '#a78bfa' },
              ].map(s => (
                <div key={s.label} className="stat-card glass-card" style={{ '--stat-accent': s.accent }}>
                  <span className="stat-icon">{s.icon}</span>
                  <span className="stat-value" style={{ color: s.accent }}>{s.value}</span>
                  <span className="stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Results grid ── */}
          {results && (
            <div className="results-section">
              <div className="results-section-header">
                <h3 className="results-section-title">Analysis Results</h3>
                <span className="results-count-badge">{results.length} startups</span>
              </div>
              <div className="results-grid">
                {results.map((item) => {
                  const isClosed  = item.predicted_status_code === 0;
                  const riskColor = { Critical: '#ef4444', High: '#f59e0b', Moderate: '#60a5fa', Low: '#10b981' }[item.risk_tier] || '#60a5fa';
                  return (
                    <div key={item.row} className={`result-card glass-card ${isClosed ? 'result-card--risk' : ''}`}>
                      {/* Card top accent bar */}
                      <div className="result-card-accent" style={{ background: riskColor }} />

                      <div className="result-card-top">
                        <span className="result-row-label">Row #{item.row + 1}</span>
                        <span
                          className="risk-badge"
                          style={{ background: `${riskColor}22`, color: riskColor, borderColor: `${riskColor}55` }}
                        >
                          <span className="risk-dot" style={{ background: riskColor }} />
                          {item.risk_tier}
                        </span>
                      </div>

                      <div className="result-status">
                        <span className="result-status-label">Forecast</span>
                        <span className={`result-status-value ${isClosed ? 'result-status-value--closed' : 'result-status-value--open'}`}>
                          {isClosed ? '⛔ Closed' : '✅ ' + item.predicted_status_label}
                        </span>
                      </div>

                      <div className="result-rows">
                        <div className="result-row">
                          <span className="result-row-key">Success Prob.</span>
                          <span className="result-row-val">
                            <span className="prob-bar-wrap">
                              <span className="prob-bar" style={{ width: `${item.success_probability * 100}%`, background: isClosed ? '#ef444488' : '#10b98188' }} />
                            </span>
                            {(item.success_probability * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="result-row">
                          <span className="result-row-key">Est. Funding</span>
                          <span className="result-row-val result-funding">{formatCurrency(item.forecasted_total_funding)}</span>
                        </div>
                        <div className="result-row">
                          <span className="result-row-key">Market</span>
                          <span className="result-row-val">{item.input.market || item.input.category_list || '—'}</span>
                        </div>
                        <div className="result-row">
                          <span className="result-row-key">Country</span>
                          <span className="result-row-val">{item.input.country_code || '—'}</span>
                        </div>
                        <div className="result-row">
                          <span className="result-row-key">Rounds</span>
                          <span className="result-row-val">{item.input.funding_rounds ?? '—'}</span>
                        </div>
                      </div>

                      {/* Risk score bar */}
                      <div className="result-risk-row">
                        <span className="result-row-key">Risk Score</span>
                        <div className="risk-score-wrap">
                          <div className="risk-score-track">
                            <div className="risk-score-fill" style={{ width: `${item.risk_score}%`, background: riskColor }} />
                          </div>
                          <span className="risk-score-num" style={{ color: riskColor }}>{item.risk_score}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Welcome empty state */}
          {!results && !isLoading && (
            <div className="empty-state">
              <div className="empty-state-graphic">
                <div className="empty-orbit empty-orbit-1" />
                <div className="empty-orbit empty-orbit-2" />
                <span className="empty-state-icon">🚀</span>
              </div>
              <h3 className="empty-state-title">Ready to Predict</h3>
              <p className="empty-state-body">
                Upload your startup dataset above to get AI-powered success predictions, risk tiers, and funding forecasts instantly.
              </p>
            </div>
          )}

          </>)}

          {/* ══════════════ EXPENSE TRACKER TAB ══════════════ */}
          {activeTab === 'expenses' && (
          <div className="exp-layout">

            {/* ── Left: Add form + breakdown ── */}
            <div className="exp-left">

              {/* Header */}
              <div className="exp-section-head">
                <h2 className="exp-section-title">💰 Expense Tracker</h2>
                <p className="exp-section-sub">Track startup operational costs by category and month.</p>
              </div>

              {/* Summary cards */}
              <div className="exp-summary-row">
                <div className="exp-summary-card glass-card">
                  <span className="exp-summary-icon">📅</span>
                  <span className="exp-summary-label">This Month</span>
                  <span className="exp-summary-value" style={{color:'#60a5fa'}}>{fmtM(monthTotal)}</span>
                </div>
                <div className="exp-summary-card glass-card">
                  <span className="exp-summary-icon">📋</span>
                  <span className="exp-summary-label">Entries</span>
                  <span className="exp-summary-value" style={{color:'#a78bfa'}}>{monthlyExpenses.length}</span>
                </div>
                {prevMonthTotal !== null && (
                  <div className="exp-summary-card glass-card">
                    <span className="exp-summary-icon">{monthTotal > prevMonthTotal ? '📈' : '📉'}</span>
                    <span className="exp-summary-label">vs Last Month</span>
                    <span className="exp-summary-value" style={{color: monthTotal > prevMonthTotal ? '#ef4444':'#10b981'}}>
                      {monthTotal > prevMonthTotal ? '+' : '-'}{fmtM(Math.abs(monthTotal - prevMonthTotal))}
                    </span>
                  </div>
                )}
              </div>

              {/* Add form */}
              <div className="exp-form glass-card">
                <h3 className="exp-form-title">➕ Add Expense</h3>
                <div className="exp-form-grid">
                  <div className="exp-field">
                    <label className="exp-label" htmlFor="exp-desc">Description</label>
                    <input
                      id="exp-desc"
                      className="exp-input"
                      type="text"
                      placeholder="e.g. AWS server cost"
                      value={expDesc}
                      onChange={e => setExpDesc(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addExpense()}
                      maxLength={120}
                    />
                  </div>
                  <div className="exp-field">
                    <label className="exp-label" htmlFor="exp-amount">Amount (USD)</label>
                    <input
                      id="exp-amount"
                      className="exp-input"
                      type="number"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      value={expAmount}
                      onChange={e => setExpAmount(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addExpense()}
                    />
                  </div>
                  <div className="exp-field">
                    <label className="exp-label" htmlFor="exp-cat">Category</label>
                    <select
                      id="exp-cat"
                      className="exp-input exp-select"
                      value={expCategory}
                      onChange={e => setExpCategory(e.target.value)}
                    >
                      {EXP_CATEGORIES.map(c => (
                        <option key={c.key} value={c.key}>{c.icon} {c.key}</option>
                      ))}
                    </select>
                  </div>
                  <div className="exp-field">
                    <label className="exp-label" htmlFor="exp-date">Date</label>
                    <input
                      id="exp-date"
                      className="exp-input"
                      type="date"
                      value={expDate}
                      onChange={e => setExpDate(e.target.value)}
                    />
                  </div>
                </div>
                {expFormErr && <p className="exp-form-err">⚠️ {expFormErr}</p>}
                <button id="exp-add-btn" className="exp-add-btn" onClick={addExpense}>
                  + Add Expense
                </button>
              </div>

              {/* Category breakdown */}
              {catTotals.length > 0 && (
                <div className="exp-breakdown glass-card">
                  <h3 className="exp-breakdown-title">📊 Category Breakdown — {monthLabel(expMonthFlt)}</h3>
                  <div className="exp-cat-list">
                    {catTotals.map(cat => (
                      <div key={cat.key} className="exp-cat-row">
                        <span className="exp-cat-icon">{cat.icon}</span>
                        <div className="exp-cat-info">
                          <div className="exp-cat-top">
                            <span className="exp-cat-name" style={{color: cat.color}}>{cat.key}</span>
                            <span className="exp-cat-count">{cat.count} item{cat.count !== 1 ? 's' : ''}</span>
                            <span className="exp-cat-total">{fmtM(cat.total)}</span>
                          </div>
                          <div className="exp-cat-bar-wrap">
                            <div
                              className="exp-cat-bar-fill"
                              style={{ width: `${(cat.total / maxCatTotal) * 100}%`, background: cat.color }}
                            />
                          </div>
                        </div>
                        <span className="exp-cat-pct" style={{color: cat.color}}>
                          {monthTotal > 0 ? Math.round((cat.total / monthTotal) * 100) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right: Month filter + Expense list ── */}
            <div className="exp-right">

              {/* Month selector */}
              <div className="exp-month-bar">
                <span className="exp-month-label">📅 Viewing:</span>
                <select
                  id="exp-month-select"
                  className="exp-month-select"
                  value={expMonthFlt}
                  onChange={e => setExpMonthFlt(e.target.value)}
                >
                  {allMonths.length === 0 && (
                    <option value={expMonthFlt}>{monthLabel(expMonthFlt)}</option>
                  )}
                  {allMonths.map(m => (
                    <option key={m} value={m}>{monthLabel(m)}</option>
                  ))}
                </select>
                <span className="exp-month-total">{fmtM(monthTotal)} total</span>
              </div>

              {/* Expense list */}
              <div className="exp-list-wrap">
                {monthlyExpenses.length === 0 ? (
                  <div className="exp-empty">
                    <span className="exp-empty-icon">💸</span>
                    <p>No expenses recorded for {monthLabel(expMonthFlt)}.</p>
                    <p className="exp-empty-hint">Use the form to add your first entry.</p>
                  </div>
                ) : (
                  <ul className="exp-list">
                    {monthlyExpenses.map(exp => {
                      const cat = CAT_MAP[exp.category] || CAT_MAP['Other'];
                      return (
                        <li key={exp.id} className="exp-item glass-card">
                          <div className="exp-item-accent" style={{background: cat.color}} />
                          <div className="exp-item-cat" title={exp.category}>
                            <span className="exp-item-cat-icon">{cat.icon}</span>
                          </div>
                          <div className="exp-item-body">
                            <span className="exp-item-desc">{exp.desc}</span>
                            <div className="exp-item-meta">
                              <span
                                className="exp-item-tag"
                                style={{ background: cat.bg, color: cat.color, borderColor: cat.border }}
                              >
                                {exp.category}
                              </span>
                              <span className="exp-item-date">{new Date(exp.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </div>
                          </div>
                          <span className="exp-item-amount">{fmtM(exp.amount)}</span>
                          <button
                            id={`exp-delete-${exp.id}`}
                            className="exp-delete-btn"
                            onClick={() => deleteExpense(exp.id)}
                            title="Delete expense"
                          >🗑️</button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
          )}

          {/* ══════════════ CALENDAR TAB ══════════════ */}
          {activeTab === 'calendar' && (
          <div className="cal-layout">

            {/* ── Left: Calendar grid ── */}
            <div className="cal-grid-panel">

              {/* Month navigation */}
              <div className="cal-nav">
                <button id="cal-prev-btn" className="cal-nav-btn" onClick={() => calNavigate(-1)}>&#8592;</button>
                <h2 className="cal-month-title">{calMonthName}</h2>
                <button id="cal-next-btn" className="cal-nav-btn" onClick={() => calNavigate(1)}>&#8594;</button>
                <button id="cal-today-btn" className="cal-today-btn" onClick={() => {
                  setCalMonth(todayStr.slice(0,7));
                  setCalSelected(todayStr);
                }}>Today</button>
              </div>

              {/* Day-of-week headers */}
              <div className="cal-dow-row">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} className="cal-dow">{d}</div>
                ))}
              </div>

              {/* Days grid */}
              <div className="cal-grid">
                {calGrid.map((cell, i) => {
                  const dots = cell.date ? eventsOnDate(cell.date) : [];
                  const isToday    = cell.date === todayStr;
                  const isSelected = cell.date === calSelected;
                  return (
                    <div
                      key={i}
                      className={[
                        'cal-cell',
                        cell.dim        ? 'cal-cell--dim'      : '',
                        isToday         ? 'cal-cell--today'    : '',
                        isSelected      ? 'cal-cell--selected' : '',
                        cell.date && !cell.dim ? 'cal-cell--active' : '',
                      ].join(' ')}
                      onClick={() => {
                        if (!cell.date || cell.dim) return;
                        setCalSelected(cell.date);
                        setCalShowForm(false);
                      }}
                    >
                      <span className="cal-day-num">{cell.day}</span>
                      {dots.length > 0 && (
                        <div className="cal-dots">
                          {dots.slice(0, 3).map(ev => (
                            <span
                              key={ev.id}
                              className="cal-dot"
                              style={{ background: CAL_TYPE_MAP[ev.type]?.color || '#60a5fa' }}
                              title={ev.title}
                            />
                          ))}
                          {dots.length > 3 && <span className="cal-dot-more">+{dots.length-3}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Event type legend */}
              <div className="cal-legend">
                {CAL_TYPES.map(t => (
                  <span key={t.key} className="cal-legend-item">
                    <span className="cal-legend-dot" style={{background: t.color}} />
                    {t.key}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Right: Selected day panel ── */}
            <div className="cal-day-panel">

              {/* Selected date header */}
              <div className="cal-day-header">
                <div>
                  <h3 className="cal-day-title">
                    {new Date(calSelected + 'T00:00:00').toLocaleDateString('en-US',
                      { weekday:'long', month:'long', day:'numeric' })}
                  </h3>
                  <p className="cal-day-sub">
                    {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  id="cal-add-event-btn"
                  className="cal-add-btn"
                  onClick={() => setCalShowForm(f => !f)}
                >
                  {calShowForm ? '✕ Cancel' : '+ Add Event'}
                </button>
              </div>

              {/* Add event form */}
              {calShowForm && (
                <div className="cal-form glass-card">
                  <div className="cal-form-row">
                    <input
                      id="cal-event-title"
                      className="cal-input"
                      type="text"
                      placeholder="Event title…"
                      value={calFormTitle}
                      onChange={e => setCalFormTitle(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && calAddEvent()}
                      autoFocus
                      maxLength={80}
                    />
                    <input
                      id="cal-event-time"
                      className="cal-input cal-input--time"
                      type="time"
                      value={calFormTime}
                      onChange={e => setCalFormTime(e.target.value)}
                    />
                  </div>
                  <div className="cal-type-picker">
                    {CAL_TYPES.map(t => (
                      <button
                        key={t.key}
                        id={`cal-type-${t.key}`}
                        className={`cal-type-btn ${calFormType === t.key ? 'cal-type-btn--active' : ''}`}
                        style={calFormType === t.key ? { background: t.bg, borderColor: t.color, color: t.color } : {}}
                        onClick={() => setCalFormType(t.key)}
                      >
                        {t.icon} {t.key}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="cal-event-notes"
                    className="cal-input cal-textarea"
                    placeholder="Notes (optional)…"
                    value={calFormNotes}
                    onChange={e => setCalFormNotes(e.target.value)}
                    rows={2}
                    maxLength={300}
                  />
                  <button id="cal-save-event-btn" className="cal-save-btn" onClick={calAddEvent}>
                    Save Event
                  </button>
                </div>
              )}

              {/* Events list for selected day */}
              {selectedEvents.length === 0 && !calShowForm && (
                <div className="cal-empty">
                  <span className="cal-empty-icon">🗓️</span>
                  <p>No events on this day.</p>
                  <p className="cal-empty-hint">Click "+ Add Event" to schedule something.</p>
                </div>
              )}

              <div className="cal-event-list">
                {selectedEvents.map(ev => {
                  const t = CAL_TYPE_MAP[ev.type] || CAL_TYPES[0];
                  return (
                    <div key={ev.id} className="cal-event-card glass-card">
                      <div className="cal-event-accent" style={{background: t.color}} />
                      <div className="cal-event-body">
                        <div className="cal-event-top">
                          <span className="cal-event-type-icon">{t.icon}</span>
                          <span className="cal-event-title">{ev.title}</span>
                          <span className="cal-event-time">{ev.time}</span>
                        </div>
                        <div className="cal-event-meta">
                          <span
                            className="cal-event-tag"
                            style={{ background: t.bg, color: t.color, borderColor: t.color+'66' }}
                          >
                            {ev.type}
                          </span>
                          {ev.notes && <span className="cal-event-notes">{ev.notes}</span>}
                        </div>
                      </div>
                      <button
                        id={`cal-delete-${ev.id}`}
                        className="cal-delete-btn"
                        onClick={() => calDeleteEvent(ev.id)}
                        title="Delete event"
                      >🗑️</button>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
          )}

          {/* ══════════════ TEAM TASK BOARD TAB ══════════════ */}
          {activeTab === 'team' && (
          <div className="team-layout">

            {/* ── Board Header ── */}
            <div className="team-header">
              <div className="team-header-left">
                <h2 className="team-title">🏢 Team Task Board</h2>
                <p className="team-subtitle">{tmFiltered.length} tasks across {DEPARTMENTS.length} departments</p>
              </div>
              {/* Filters */}
              <div className="team-filters">
                <input
                  id="tm-search"
                  className="team-search-input"
                  type="text"
                  placeholder="Search tasks or assignee…"
                  value={tmSearch}
                  onChange={e => setTmSearch(e.target.value)}
                />
                <select id="tm-dept-filter" className="team-filter-select" value={tmFilterDept} onChange={e => setTmFilterDept(e.target.value)}>
                  <option value="All">All Departments</option>
                  {DEPARTMENTS.map(d => <option key={d.key}>{d.icon} {d.key}</option>)}
                </select>
                <select id="tm-prio-filter" className="team-filter-select" value={tmFilterPrio} onChange={e => setTmFilterPrio(e.target.value)}>
                  <option value="All">All Priorities</option>
                  {TM_PRIORITIES.map(p => <option key={p.key}>{p.key}</option>)}
                </select>
                <button id="tm-add-btn" className="team-add-task-btn" onClick={() => setTmShowForm(f => !f)}>
                  {tmShowForm ? '✕ Cancel' : '+ New Task'}
                </button>
              </div>
            </div>

            {/* ── Add Task Form ── */}
            {tmShowForm && (
            <div className="team-form glass-card">
              <div className="team-form-grid">
                <div className="team-field" style={{gridColumn: '1 / 3'}}>
                  <label className="team-label">Task Title *</label>
                  <input id="tm-title" className="team-input" type="text" placeholder="What needs to be done?" value={tmFTitle}
                    onChange={e => setTmFTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && tmAddTask()} maxLength={120} autoFocus />
                </div>
                <div className="team-field" style={{gridColumn: '1 / 3'}}>
                  <label className="team-label">Description</label>
                  <input id="tm-desc" className="team-input" type="text" placeholder="Brief description (optional)" value={tmFDesc}
                    onChange={e => setTmFDesc(e.target.value)} maxLength={200} />
                </div>
                <div className="team-field">
                  <label className="team-label">Department</label>
                  <select id="tm-dept" className="team-input team-select" value={tmFDept} onChange={e => setTmFDept(e.target.value)}>
                    {DEPARTMENTS.map(d => <option key={d.key} value={d.key}>{d.icon} {d.key}</option>)}
                  </select>
                </div>
                <div className="team-field">
                  <label className="team-label">Assignee</label>
                  <input id="tm-employee" className="team-input" type="text" placeholder="Employee name" value={tmFEmployee}
                    onChange={e => setTmFEmployee(e.target.value)} maxLength={60} />
                </div>
                <div className="team-field">
                  <label className="team-label">Priority</label>
                  <select id="tm-priority" className="team-input team-select" value={tmFPriority} onChange={e => setTmFPriority(e.target.value)}>
                    {TM_PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.key}</option>)}
                  </select>
                </div>
                <div className="team-field">
                  <label className="team-label">Due Date</label>
                  <input id="tm-due" className="team-input" type="date" value={tmFDueDate} onChange={e => setTmFDueDate(e.target.value)} />
                </div>
                <div className="team-field">
                  <label className="team-label">Initial Status</label>
                  <select id="tm-status" className="team-input team-select" value={tmFStatus} onChange={e => setTmFStatus(e.target.value)}>
                    {TM_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <button id="tm-save-btn" className="team-save-btn" onClick={tmAddTask}>+ Create Task</button>
            </div>
            )}

            {/* ── Dept legend ── */}
            <div className="team-dept-legend">
              {DEPARTMENTS.map(d => (
                <button
                  key={d.key}
                  className={`team-dept-pill ${tmFilterDept === d.key ? 'team-dept-pill--active' : ''}`}
                  style={tmFilterDept === d.key ? {background: d.color+'22', borderColor: d.color, color: d.color} : {}}
                  onClick={() => setTmFilterDept(f => f === d.key ? 'All' : d.key)}
                >
                  {d.icon} {d.key}
                  <span className="team-dept-count">{tmTasks.filter(t => t.department === d.key).length}</span>
                </button>
              ))}
            </div>

            {/* ── Kanban Board ── */}
            <div className="team-board">
              {TM_STATUSES.map(status => {
                const cfg   = TM_STATUS_CFG[status];
                const cards = tmByStatus(status);
                return (
                  <div key={status} className="team-column">
                    {/* Column header */}
                    <div className="team-col-header" style={{borderTopColor: cfg.color}}>
                      <span className="team-col-icon" style={{color: cfg.color}}>{cfg.icon}</span>
                      <span className="team-col-title" style={{color: cfg.color}}>{status}</span>
                      <span className="team-col-count">{cards.length}</span>
                    </div>

                    {/* Task cards */}
                    <div className="team-col-cards">
                      {cards.length === 0 && (
                        <div className="team-col-empty">No tasks</div>
                      )}
                      {cards.map(task => {
                        const dept  = DEPT_MAP[task.department]    || DEPARTMENTS[0];
                        const prio  = TM_PRIORITY_MAP[task.priority] || TM_PRIORITIES[2];
                        const overdue = tmOverdue(task);
                        return (
                          <div key={task.id} className={`team-card glass-card ${overdue ? 'team-card--overdue' : ''}`}>
                            {/* Priority accent */}
                            <div className="team-card-accent" style={{background: prio.color}} />

                            {/* Title + delete */}
                            <div className="team-card-top">
                              <span className="team-card-title">{task.title}</span>
                              <button
                                id={`tm-delete-${task.id}`}
                                className="team-card-delete"
                                onClick={() => tmDeleteTask(task.id)}
                                title="Delete"
                              >🗑️</button>
                            </div>

                            {/* Description */}
                            {task.desc && <p className="team-card-desc">{task.desc}</p>}

                            {/* Meta row */}
                            <div className="team-card-meta">
                              <span className="team-card-dept" style={{background: dept.color+'22', color: dept.color, borderColor: dept.color+'55'}}>
                                {dept.icon} {dept.key}
                              </span>
                              <span className="team-card-prio" style={{color: prio.color, borderColor: prio.color+'55', background: prio.color+'18'}}>
                                {task.priority}
                              </span>
                            </div>

                            {/* Assignee + due date */}
                            <div className="team-card-footer">
                              <span className="team-card-assignee">👤 {task.employee}</span>
                              {task.dueDate && (
                                <span className={`team-card-due ${overdue ? 'team-card-due--overdue' : ''}`}>
                                  {overdue ? '⚠️ ' : '📅 '}
                                  {new Date(task.dueDate+'T00:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric'})}
                                </span>
                              )}
                            </div>

                            {/* Status mover */}
                            <div className="team-card-status-row">
                              {TM_STATUSES.filter(s => s !== status).map(s => (
                                <button
                                  key={s}
                                  id={`tm-move-${task.id}-${s}`}
                                  className="team-status-pill"
                                  style={{borderColor: TM_STATUS_CFG[s].color, color: TM_STATUS_CFG[s].color}}
                                  onClick={() => tmChangeStatus(task.id, s)}
                                  title={`Move to ${s}`}
                                >
                                  → {s}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
          )}

          {/* ══════════════ MY TASKS TAB ══════════════ */}
          {activeTab === 'tasks' && (
          <div className="tasks-layout">

            {/* ── Header ── */}
            <div className="tasks-header">
              <div>
                <h2 className="tasks-title">📋 My Tasks</h2>
                <p className="tasks-subtitle">Track your personal tasks with priorities and progress.</p>
              </div>
            </div>

            {/* ── Stats row ── */}
            <div className="tasks-stats-row">
              <div className="tasks-stat-card glass-card">
                <span className="tasks-stat-icon">📝</span>
                <span className="tasks-stat-value">{todos.length}</span>
                <span className="tasks-stat-label">Total</span>
              </div>
              <div className="tasks-stat-card glass-card">
                <span className="tasks-stat-icon">⚡</span>
                <span className="tasks-stat-value" style={{color:'#60a5fa'}}>{activeCount}</span>
                <span className="tasks-stat-label">Active</span>
              </div>
              <div className="tasks-stat-card glass-card">
                <span className="tasks-stat-icon">✅</span>
                <span className="tasks-stat-value" style={{color:'#34d399'}}>{doneCount}</span>
                <span className="tasks-stat-label">Done</span>
              </div>
              <div className="tasks-stat-card glass-card" style={{flex:2}}>
                <span className="tasks-stat-icon">📊</span>
                <div className="tasks-stat-progress-wrap">
                  <div className="tasks-stat-progress-bar">
                    <div className="tasks-stat-progress-fill" style={{width:`${progressPct}%`}} />
                  </div>
                  <span className="tasks-stat-progress-label">{progressPct}% complete</span>
                </div>
                <span className="tasks-stat-label">Progress</span>
              </div>
            </div>

            {/* ── Two columns ── */}
            <div className="tasks-body">

              {/* Left: Add form + priority breakdown */}
              <div className="tasks-left">

                {/* Add form */}
                <div className="tasks-add-form glass-card">
                  <h3 className="tasks-form-title">＋ Add New Task</h3>
                  <input
                    ref={todoInputRef}
                    id="todo-text-input"
                    className="tasks-input"
                    type="text"
                    placeholder="What needs to be done?"
                    value={todoInput}
                    onChange={e => setTodoInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTodo()}
                    maxLength={200}
                  />
                  <div className="tasks-priority-row">
                    {Object.entries(PRIORITIES).map(([key, cfg]) => (
                      <button
                        key={key}
                        id={`priority-${key}`}
                        className={`tasks-priority-btn ${priority === key ? 'tasks-priority-btn--active' : ''}`}
                        style={priority === key ? {background:cfg.bg, borderColor:cfg.border, color:cfg.color} : {}}
                        onClick={() => setPriority(key)}
                      >
                        {cfg.label}
                      </button>
                    ))}
                  </div>
                  <button id="todo-add-btn" className="tasks-add-submit" onClick={addTodo}>
                    + Add Task
                  </button>
                </div>

                {/* Priority breakdown */}
                {todos.length > 0 && (
                <div className="tasks-breakdown glass-card">
                  <h3 className="tasks-breakdown-title">📊 Priority Breakdown</h3>
                  {Object.entries(PRIORITIES).map(([key, cfg]) => {
                    const cnt = todos.filter(t => t.priority === key).length;
                    if (cnt === 0) return null;
                    return (
                      <div key={key} className="tasks-breakdown-row">
                        <span className="tasks-breakdown-label" style={{color:cfg.color}}>{cfg.label}</span>
                        <div className="tasks-breakdown-track">
                          <div className="tasks-breakdown-fill" style={{width:`${(cnt/todos.length)*100}%`, background:cfg.color}} />
                        </div>
                        <span className="tasks-breakdown-count">{cnt}</span>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>

              {/* Right: Filter + Task list */}
              <div className="tasks-right">
                <div className="tasks-filter-bar">
                  {['all','active','done'].map(f => (
                    <button
                      key={f}
                      id={`filter-${f}`}
                      className={`tasks-filter-btn ${filter === f ? 'tasks-filter-btn--active' : ''}`}
                      onClick={() => setFilter(f)}
                    >
                      {f === 'all' ? 'All Tasks' : f === 'active' ? '⚡ Active' : '✅ Done'}
                    </button>
                  ))}
                  {doneCount > 0 && (
                    <button id="todo-clear-done-btn" className="tasks-clear-btn" onClick={clearDone}>
                      Clear Done
                    </button>
                  )}
                </div>

                <div className="tasks-list-wrap">
                  {visibleTodos.length === 0 ? (
                    <div className="tasks-empty">
                      <span className="tasks-empty-icon">{filter==='done' ? '🎉' : '✅'}</span>
                      <p>{filter==='done' ? 'No completed tasks yet.' : 'No tasks — add one to get started!'}</p>
                    </div>
                  ) : (
                    <ul className="tasks-list">
                      {visibleTodos.map(todo => {
                        const pcfg = PRIORITIES[todo.priority] || PRIORITIES.medium;
                        return (
                          <li key={todo.id} className={`tasks-item glass-card ${todo.done ? 'tasks-item--done' : ''}`}>
                            <div className="tasks-item-accent" style={{background: pcfg.color}} />
                            <button
                              id={`todo-check-${todo.id}`}
                              className={`tasks-check ${todo.done ? 'tasks-check--done' : ''}`}
                              onClick={() => toggleDone(todo.id)}
                            >
                              {todo.done && '✓'}
                            </button>
                            <div className="tasks-item-body">
                              {editId === todo.id ? (
                                <input
                                  id={`todo-edit-input-${todo.id}`}
                                  className="tasks-inline-edit"
                                  value={editText}
                                  autoFocus
                                  onChange={e => setEditText(e.target.value)}
                                  onKeyDown={e => { if (e.key==='Enter') saveEdit(todo.id); if (e.key==='Escape') setEditId(null); }}
                                  onBlur={() => saveEdit(todo.id)}
                                  maxLength={200}
                                />
                              ) : (
                                <span
                                  className="tasks-item-text"
                                  onDoubleClick={() => !todo.done && startEdit(todo)}
                                  title={todo.done ? '' : 'Double-click to edit'}
                                >
                                  {todo.text}
                                </span>
                              )}
                              <span
                                className="tasks-prio-tag"
                                style={{background:pcfg.bg, color:pcfg.color, borderColor:pcfg.border}}
                              >
                                {pcfg.label}
                              </span>
                            </div>
                            <div className="tasks-item-actions">
                              {!todo.done && editId !== todo.id && (
                                <button id={`todo-edit-btn-${todo.id}`} className="tasks-action-btn" onClick={() => startEdit(todo)} title="Edit">✏️</button>
                              )}
                              <button id={`todo-delete-btn-${todo.id}`} className="tasks-action-btn" onClick={() => deleteTodo(todo.id)} title="Delete">🗑️</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}

        </main>

      </div>
    </div>
  );
}
