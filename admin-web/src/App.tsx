import { useEffect, useMemo, useState } from 'react'
import { API_BASE, api, apiBlob, downloadBlob, loginMobile, sendLoginCode, setToken, uploadFile } from './api'

type Choir = { choir_id: string; choir_name: string; invite_code?: string; city?: string }
type Section = { section_id: string; section_name: string; sort_order: number }
type Dashboard = { choir_id: string; member_count: number; active_member_count: number; event_count: number; task_count: number; practice_record_count: number; attendance_count: number; section_counts: Record<string, number> }
type SectionDashboard = { section_id?: string; section_name: string; member_count: number; active_member_count: number; task_count: number; record_count: number; submitted_member_count?: number; pending_review_count: number; attendance_rate: number }
type EventRow = { event_id: string; title: string; event_type: string; start_time: string; end_time: string; location?: string; checkin_code?: string }
type EventStats = { event_id: string; active_member_count: number; response_counts: Record<string, number>; attendance_counts: Record<string, number> }
type WorkRow = { work_id: string; title: string; composer?: string; language?: string; status: string }
type ResourceRow = { resource_id: string; resource_name: string; resource_type: string; file_url: string; file_format?: string; visibility: string }
type TaskRow = { task_id: string; title: string; deadline: string; status: string; target_sections?: string[] }
type MemberRow = { member_id: string; user_id: string; section_id?: string; role: string; member_status: string; user?: { name?: string; mobile?: string } }
type RolePermission = { role: string; label: string; permissions: string[]; scope: string }
type LeaveRow = { leave_id: string; event_id: string; user_id: string; reason: string; status: string; reject_reason?: string }
type PracticeRecord = { practice_record_id: string; task_id: string; user_id: string; section_id?: string; audio_url?: string; audio_duration?: number; practice_count?: number; pitch_self_rating?: string; rhythm_self_rating?: string; breath_self_rating?: string; note?: string; comments?: { comment_id: string; content: string; rating?: number }[] }

type Tab = 'overview'|'section'|'members'|'permissions'|'events'|'leaves'|'works'|'tasks'|'records'
type Notice = { type: 'ok' | 'error' | 'info'; text: string }

const nowLocal = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16)
const twoHoursLater = () => new Date(Date.now() + 10 * 3600 * 1000).toISOString().slice(0, 16)
const toIso = (v: string) => new Date(v).toISOString()
const fileAssetIdFromUrl = (url?: string) => url?.match(/\/api\/files\/([^/]+)\/download/)?.[1]

async function openProtectedFile(fileUrl?: string) {
  if (!fileUrl) return
  const assetId = fileAssetIdFromUrl(fileUrl)
  if (!assetId) {
    window.open(fileUrl.startsWith('http') ? fileUrl : `${API_BASE}${fileUrl}`, '_blank')
    return
  }
  const res = await api<{ signed_url: string }>(`/api/files/${assetId}/signed-url`)
  window.open(`${API_BASE}${res.signed_url}`, '_blank')
}

function errorText(err: unknown) {
  if (err instanceof Error) return err.message
  return String(err)
}

export default function App() {
  const [mobile, setMobile] = useState('')
  const [name, setName] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [choirs, setChoirs] = useState<Choir[]>([])
  const [selected, setSelected] = useState<Choir | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [sectionDashboard, setSectionDashboard] = useState<SectionDashboard | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [works, setWorks] = useState<WorkRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [leaves, setLeaves] = useState<LeaveRow[]>([])
  const [records, setRecords] = useState<PracticeRecord[]>([])
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)

  const firstSection = useMemo(() => sections[0]?.section_id || '', [sections])
  const notify = (type: Notice['type'], text: string) => setNotice({ type, text })

  async function handleSendCode() {
    if (!mobile.trim()) return notify('error', '请填写手机号。')
    setBusy(true)
    try {
      const res = await sendLoginCode(mobile.trim())
      notify('ok', res.debug_code ? `验证码已发送：${res.debug_code}` : res.message || '验证码已发送。')
    } catch (err) { notify('error', errorText(err)) }
    finally { setBusy(false) }
  }

  async function handleLogin() {
    if (!mobile.trim()) return notify('error', '请填写手机号。')
    if (!smsCode.trim()) return notify('error', '请填写短信验证码。')
    setBusy(true)
    try {
      const res = await loginMobile(mobile.trim(), smsCode.trim(), name.trim() || mobile.trim())
      setToken(res.access_token)
      notify('ok', `已登录：${res.user.name || res.user.mobile}`)
      await loadChoirs()
    } catch (err) { notify('error', errorText(err)) }
    finally { setBusy(false) }
  }

  async function loadChoirs() {
    const rows = await api<Choir[]>('/api/choirs/my')
    setChoirs(rows)
    if (!selected && rows[0]) setSelected(rows[0])
  }

  async function createDemoChoir() {
    try {
      const row = await api<Choir>('/api/choirs', { method: 'POST', body: JSON.stringify({ choir_name: 'D Major Choir', city: '广州南沙', description: 'MVP测试合唱团' }) })
      notify('ok', `已创建：${row.choir_name}`)
      setSelected(row)
      await loadChoirs()
    } catch (err) { notify('error', errorText(err)) }
  }

  async function seedDemoData() {
    try {
      const row = await api<any>('/api/admin/demo-seed', { method: 'POST' })
      notify('ok', `已生成示例数据：${row.message}`)
      await loadChoirs()
    } catch (err) { notify('error', errorText(err)) }
  }

  async function reloadAll(choir = selected) {
    if (!choir) return
    const [d, sd, s, m, e, w, t, l, r, rp] = await Promise.all([
      api<Dashboard>(`/api/choirs/${choir.choir_id}/dashboard`),
      api<SectionDashboard>(`/api/choirs/${choir.choir_id}/section-dashboard`).catch(() => null),
      api<Section[]>(`/api/choirs/${choir.choir_id}/sections`),
      api<MemberRow[]>(`/api/choirs/${choir.choir_id}/members`),
      api<EventRow[]>(`/api/choirs/${choir.choir_id}/events`),
      api<WorkRow[]>(`/api/choirs/${choir.choir_id}/works`),
      api<TaskRow[]>(`/api/choirs/${choir.choir_id}/practice-tasks`),
      api<LeaveRow[]>(`/api/choirs/${choir.choir_id}/leave-requests`).catch(() => []),
      api<PracticeRecord[]>(`/api/choirs/${choir.choir_id}/practice-records`).catch(() => []),
      api<RolePermission[]>(`/api/choirs/${choir.choir_id}/role-permissions`).catch(() => []),
    ])
    setDashboard(d); setSectionDashboard(sd); setSections(s); setMembers(m); setEvents(e); setWorks(w); setTasks(t); setLeaves(l); setRecords(r)
    setRolePermissions(rp)
  }

  useEffect(() => { if (localStorage.getItem('choir_token')) loadChoirs().catch(() => {}) }, [])
  useEffect(() => { if (selected) reloadAll(selected).catch(err => notify('error', errorText(err))) }, [selected?.choir_id])

  return <main className="page">
    <header className="hero">
      <div className="brand-block"><img className="brand-logo" src="/dmajor-logo.png" alt="D Major Choir"/><div><p className="eyebrow">D Major Choir · Admin Console</p><h1>合唱团管理后台</h1><p>D大调品牌版：金色、银灰与深色舞台质感，支持活动地点、编辑删除、签到二维码、谱库与练习打卡管理。</p></div></div>
    </header>

    <section className="card grid">
      <div>
        <h2>1. 管理员登录</h2>
        <label>手机号</label><input value={mobile} onChange={e=>setMobile(e.target.value)} placeholder="请输入管理员手机号" />
        <label>姓名</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="请输入姓名" />
        <label>短信验证码</label><input value={smsCode} onChange={e=>setSmsCode(e.target.value)} placeholder="6位验证码" />
        <button className="secondary" disabled={busy} onClick={handleSendCode}>发送验证码</button>
        <button disabled={busy} onClick={handleLogin}>{busy ? '处理中...' : '登录'}</button>
      </div>
      <div>
        <h2>2. 合唱团</h2>
        <button onClick={createDemoChoir}>创建空合唱团</button>
        <button className="secondary" onClick={seedDemoData}>一键生成演示数据</button>
        <div className="list">{choirs.map(c=><button key={c.choir_id} className={selected?.choir_id===c.choir_id?'item active':'item'} onClick={()=>setSelected(c)}>{c.choir_name}<br/><small>邀请码：{c.invite_code}</small></button>)}</div>
      </div>
    </section>

    {notice && <p className={`message ${notice.type}`}>{notice.text}</p>}

    {selected && <section className="card">
      <div className="toolbar"><h2>{selected.choir_name}</h2><button className="secondary" onClick={()=>reloadAll().then(()=>notify('ok','数据已刷新')).catch(err=>notify('error', errorText(err)))}>刷新数据</button></div>
      <nav className="tabs">
        {(['overview','section','members','permissions','events','leaves','works','tasks','records'] as const).map(x=><button key={x} className={tab===x?'tab active':'tab'} onClick={()=>setTab(x)}>{labelOf(x)}</button>)}
      </nav>
      {tab === 'overview' && <Overview dashboard={dashboard}/>} 
      {tab === 'section' && <SectionPanel choirId={selected.choir_id} dashboard={sectionDashboard} sections={sections} onLoad={setSectionDashboard}/>} 
      {tab === 'members' && <Members choirId={selected.choir_id} members={members} sections={sections} onDone={reloadAll} onError={e=>notify('error',e)} onInfo={e=>notify('ok',e)}/>} 
      {tab === 'permissions' && <Permissions choirId={selected.choir_id} rows={rolePermissions} onDone={reloadAll}/>} 
      {tab === 'events' && <Events choirId={selected.choir_id} rows={events} onDone={reloadAll} onError={e=>notify('error',e)} onInfo={e=>notify('ok',e)}/>} 
      {tab === 'leaves' && <Leaves leaves={leaves} members={members} events={events} onDone={reloadAll}/>} 
      {tab === 'works' && <Works choirId={selected.choir_id} rows={works} onDone={reloadAll}/>} 
      {tab === 'tasks' && <Tasks choirId={selected.choir_id} rows={tasks} works={works} sections={sections} firstSection={firstSection} onDone={reloadAll}/>} 
      {tab === 'records' && <Records rows={records} members={members} tasks={tasks} onDone={reloadAll}/>} 
    </section>}
  </main>
}

function labelOf(tab: string) {
  return ({ overview: '看板', section: '声部长看板', members: '团员管理', permissions: '角色权限', events: '活动考勤', leaves: '请假审批', works: '谱库文件', tasks: '练习任务', records: '打卡点评' } as Record<string,string>)[tab]
}
function Metric({label,value}:{label:string,value:number|string}) { return <div className="metric"><strong>{value}</strong><span>{label}</span></div> }
function nameOf(members: MemberRow[], userId: string) { return members.find(m => m.user_id === userId)?.user?.name || userId.slice(0, 8) }
function eventTitle(events: EventRow[], eventId: string) { return events.find(e => e.event_id === eventId)?.title || eventId.slice(0, 8) }
function taskTitle(tasks: TaskRow[], taskId: string) { return tasks.find(t => t.task_id === taskId)?.title || taskId.slice(0, 8) }

function Overview({dashboard}:{dashboard: Dashboard | null}) {
  if (!dashboard) return <p>暂无数据。</p>
  return <div>
    <div className="metrics"><Metric label="成员" value={dashboard.member_count}/><Metric label="活跃" value={dashboard.active_member_count}/><Metric label="活动" value={dashboard.event_count}/><Metric label="任务" value={dashboard.task_count}/><Metric label="打卡" value={dashboard.practice_record_count}/><Metric label="签到" value={dashboard.attendance_count}/></div>
    <h3>声部分布</h3><pre>{JSON.stringify(dashboard.section_counts, null, 2)}</pre>
  </div>
}

function SectionPanel({choirId, dashboard, sections, onLoad}:{choirId:string; dashboard:SectionDashboard|null; sections:Section[]; onLoad:(d:SectionDashboard)=>void}) {
  const [sectionId,setSectionId]=useState('')
  async function load(id = sectionId){ const qs = id ? `?section_id=${id}` : ''; onLoad(await api<SectionDashboard>(`/api/choirs/${choirId}/section-dashboard${qs}`)) }
  return <div>
    <div className="inline-form compact"><select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">自动选择声部</option>{sections.map(s=><option key={s.section_id} value={s.section_id}>{s.section_name}</option>)}</select><button onClick={()=>load()}>查看声部数据</button></div>
    {dashboard ? <div className="metrics"><Metric label="声部" value={dashboard.section_name}/><Metric label="活跃成员" value={dashboard.active_member_count}/><Metric label="相关任务" value={dashboard.task_count}/><Metric label="打卡记录" value={dashboard.record_count}/><Metric label="待点评" value={dashboard.pending_review_count}/><Metric label="出勤率" value={`${Math.round(dashboard.attendance_rate*100)}%`}/></div> : <p>暂无声部数据。</p>}
  </div>
}

function Members({choirId, members, sections, onDone, onError, onInfo}:{choirId:string; members: MemberRow[]; sections: Section[]; onDone:()=>void; onError:(s:string)=>void; onInfo:(s:string)=>void}) {
  const [file,setFile]=useState<File|null>(null)
  const [keyword,setKeyword]=useState('')
  const [sectionFilter,setSectionFilter]=useState('')
  const [roleFilter,setRoleFilter]=useState('')
  const [statusFilter,setStatusFilter]=useState('')
  const [name,setName]=useState('')
  const [mobile,setMobile]=useState('')
  const [email,setEmail]=useState('')
  const [joinDate,setJoinDate]=useState(new Date().toISOString().slice(0,10))
  const visible = members.filter(m => (!keyword || `${m.user?.name || ''}${m.user?.mobile || ''}`.includes(keyword)) && (!sectionFilter || m.section_id === sectionFilter) && (!roleFilter || m.role === roleFilter) && (!statusFilter || m.member_status === statusFilter))
  async function update(m: MemberRow, patch: Partial<MemberRow>) { await api(`/api/choirs/${choirId}/members/${m.member_id}`, { method:'PUT', body: JSON.stringify(patch) }); await onDone() }
  async function create(){ if(!name.trim()) return onError('姓名不能为空'); await api(`/api/choirs/${choirId}/members`, { method:'POST', body: JSON.stringify({ name, mobile, email, section_id: sectionFilter || sections[0]?.section_id, role: roleFilter || 'member', member_status: statusFilter || 'active', join_date: joinDate }) }); setName(''); setMobile(''); setEmail(''); await onDone(); onInfo('团员已新增') }
  async function remove(m:MemberRow){ if(!window.confirm(`确认删除团员「${m.user?.name || m.user_id}」吗？`)) return; await api(`/api/choirs/${choirId}/members/${m.member_id}`, { method:'DELETE' }); await onDone(); onInfo('团员已删除') }
  async function downloadTemplate(){ try { downloadBlob(await apiBlob(`/api/choirs/${choirId}/members/import-template.csv`), 'member_import_template.csv') } catch(err){ onError(errorText(err)) } }
  async function importMembers(){ if(!file) return onError('请先选择CSV文件'); try { const uploaded = new FormData(); uploaded.append('file', file); await api(`/api/choirs/${choirId}/members/import-csv`, { method:'POST', body: uploaded }); await onDone(); onInfo('成员导入完成') } catch(err){ onError(errorText(err)) } }
  return <div>
    <div className="inline-form compact"><input value={name} onChange={e=>setName(e.target.value)} placeholder="姓名"/><input value={mobile} onChange={e=>setMobile(e.target.value)} placeholder="手机号"/><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="邮箱"/><input type="date" value={joinDate} onChange={e=>setJoinDate(e.target.value)}/><button onClick={create}>新增团员</button></div>
    <div className="inline-form compact"><input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="搜索姓名/手机号"/><select value={sectionFilter} onChange={e=>setSectionFilter(e.target.value)}><option value="">全部声部</option>{sections.map(s=><option key={s.section_id} value={s.section_id}>{s.section_name}</option>)}</select><select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="">全部角色</option><option value="leader">团长</option><option value="conductor">指挥</option><option value="accompanist">钢琴伴奏</option><option value="soprano">女高</option><option value="alto">女中</option><option value="tenor">男高</option><option value="bass">男低</option><option value="section_leader">声部长</option><option value="principal">声部首席</option><option value="member">普通成员</option><option value="admin">管理员</option><option value="super_admin">超级管理员</option></select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">全部状态</option><option value="pending">待审核</option><option value="active">正式</option><option value="paused">暂停</option><option value="left">退出</option></select></div>
    <div className="inline-form compact"><button onClick={downloadTemplate}>下载导入模板</button><input type="file" accept=".csv" onChange={e=>setFile(e.target.files?.[0] || null)}/><button onClick={importMembers}>导入成员CSV</button></div>
    <div className="table members-table"><div className="row head"><span>姓名</span><span>手机号</span><span>声部</span><span>角色</span><span>状态</span><span>操作</span></div>{visible.map(m=><div className="row" key={m.member_id}>
      <span>{m.user?.name || '-'}</span><span>{m.user?.mobile || '-'}</span>
      <span><select value={m.section_id || ''} onChange={e=>update(m,{section_id:e.target.value})}><option value="">未分配</option>{sections.map(s=><option key={s.section_id} value={s.section_id}>{s.section_name}</option>)}</select></span>
      <span><select value={m.role} onChange={e=>update(m,{role:e.target.value})}><option value="leader">团长</option><option value="conductor">指挥</option><option value="accompanist">钢琴伴奏</option><option value="soprano">女高</option><option value="alto">女中</option><option value="tenor">男高</option><option value="bass">男低</option><option value="section_leader">声部长</option><option value="principal">声部首席</option><option value="member">普通成员</option><option value="admin">管理员</option><option value="super_admin">超级管理员</option></select></span>
      <span><select value={m.member_status} onChange={e=>update(m,{member_status:e.target.value})}><option value="pending">待审核</option><option value="active">正式</option><option value="paused">暂停</option><option value="left">退出</option></select></span>
      <span>{m.member_status !== 'active' && <button className="tiny" onClick={()=>update(m,{member_status:'active'})}>通过</button>}<button className="tiny danger" onClick={()=>remove(m)}>删除</button></span>
    </div>)}</div>
  </div>
}

function Permissions({choirId, rows, onDone}:{choirId:string; rows:RolePermission[]; onDone:()=>void}) {
  const labels: Record<string,string> = { member_manage:'成员管理', event_manage:'活动管理', leave_approve:'请假审批', attendance_manage:'签到管理', practice_task_publish:'练习任务发布', practice_comment:'打卡点评', library_manage:'谱库管理', dashboard_view:'数据看板查看' }
  async function toggle(row:RolePermission, permission:string) {
    const exists = row.permissions.includes(permission)
    const next = exists ? row.permissions.filter(x=>x!==permission) : [...row.permissions, permission]
    await api(`/api/choirs/${choirId}/role-permissions/${row.role}`, { method:'PUT', body: JSON.stringify({ role: row.role, permissions: next, scope: row.scope }) })
    await onDone()
  }
  async function scope(row:RolePermission, value:string) {
    await api(`/api/choirs/${choirId}/role-permissions/${row.role}`, { method:'PUT', body: JSON.stringify({ role: row.role, permissions: row.permissions, scope: value }) })
    await onDone()
  }
  return <div className="table"><div className="row head"><span>角色</span><span>范围</span><span>权限</span></div>{rows.map(r=><div className="row" key={r.role}><span>{r.label}</span><span><select value={r.scope} onChange={e=>scope(r,e.target.value)}><option value="all">全团</option><option value="section">本声部</option><option value="own">本人</option></select></span><span>{Object.entries(labels).map(([key,label])=><label className="check" key={key}><input type="checkbox" checked={r.permissions.includes(key)} onChange={()=>toggle(r,key)}/>{label}</label>)}</span></div>)}</div>
}

function Events({choirId, rows, onDone, onError, onInfo}:{choirId:string; rows: EventRow[]; onDone:()=>void; onError:(s:string)=>void; onInfo:(s:string)=>void}) {
  const [title,setTitle]=useState('周五晚常规排练')
  const [start,setStart]=useState(nowLocal())
  const [end,setEnd]=useState(twoHoursLater())
  const [location,setLocation]=useState('')
  const [editing,setEditing]=useState<EventRow|null>(null)
  const [savedLocations,setSavedLocations]=useState<string[]>(()=>{ try { return JSON.parse(localStorage.getItem('dmj_locations') || '[\"南沙排练室\",\"学校音乐厅\",\"广州大剧院\",\"社区文化中心\",\"线上 Zoom\"]') } catch { return ['南沙排练室','学校音乐厅','广州大剧院','社区文化中心','线上 Zoom'] } })
  const [qrUrl,setQrUrl]=useState('')
  const [stats,setStats]=useState<Record<string, EventStats>>({})
  const commonLocations = savedLocations
  function rememberLocation(value:string){ const v=value.trim(); if(!v) return; const next=[v, ...savedLocations.filter(x=>x!==v)].slice(0,8); setSavedLocations(next); localStorage.setItem('dmj_locations', JSON.stringify(next)) }
  function beginEdit(row: EventRow) {
    setEditing(row)
    setTitle(row.title)
    setStart(new Date(row.start_time).toISOString().slice(0,16))
    setEnd(new Date(row.end_time).toISOString().slice(0,16))
    setLocation(row.location || '')
  }
  function resetForm() { setEditing(null); setTitle('周五晚常规排练'); setStart(nowLocal()); setEnd(twoHoursLater()); setLocation('') }
  async function save(){
    if(!title.trim()) return onError('活动标题不能为空')
    if(new Date(end) <= new Date(start)) return onError('结束时间必须晚于开始时间')
    const payload = {title,event_type:'rehearsal',start_time:toIso(start),end_time:toIso(end),location,need_attendance:true,checkin_method:'qr',status:'published'}
    rememberLocation(location)
    if (editing) { await api(`/api/events/${editing.event_id}`,{method:'PUT',body:JSON.stringify(payload)}); onInfo('活动已更新') }
    else { await api(`/api/choirs/${choirId}/events`,{method:'POST',body:JSON.stringify(payload)}); onInfo('活动已创建') }
    resetForm(); await onDone()
  }
  async function createFourWeeks(){
    if(!title.trim()) return onError('活动标题不能为空')
    if(new Date(end) <= new Date(start)) return onError('结束时间必须晚于开始时间')
    rememberLocation(location)
    for(let i=0;i<4;i++){
      const st=new Date(start); st.setDate(st.getDate()+i*7)
      const et=new Date(end); et.setDate(et.getDate()+i*7)
      await api(`/api/choirs/${choirId}/events`,{method:'POST',body:JSON.stringify({title: i===0 ? title : `${title} · 第${i+1}周`, event_type:'rehearsal', start_time:st.toISOString(), end_time:et.toISOString(), location, need_attendance:true, checkin_method:'qr', status:'published'})})
    }
    onInfo('已生成未来4周排练')
    await onDone()
  }
  async function showQr(id:string){ try { await api<any>(`/api/events/${id}/checkin-code`,{method:'POST'}); const blob = await apiBlob(`/api/events/${id}/checkin-qr.png`); setQrUrl(URL.createObjectURL(blob)); await onDone() } catch(err){ onError(errorText(err)) } }
  async function loadStats(id:string){ try { setStats({...stats, [id]: await api<EventStats>(`/api/events/${id}/response-statistics`)}) } catch(err){ onError(errorText(err)) } }
  async function removeEvent(row: EventRow){
    if(!window.confirm(`确认删除活动「${row.title}」吗？相关签到、反馈、请假记录也会一并删除。`)) return
    try { await api(`/api/events/${row.event_id}`, { method:"DELETE" }); onInfo("活动已删除"); await onDone() } catch(err){ onError(errorText(err)) }
  }
  return <div>
    <div className="inline-form">
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="活动标题"/>
      <input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/>
      <input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/>
      <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="地点可自由输入，例如：南沙排练室"/>
      <select value={location} onChange={e=>setLocation(e.target.value)}><option value="">选择常用地点</option>{commonLocations.map(x=><option key={x} value={x}>{x}</option>)}</select>
      <button onClick={save}>{editing ? '保存修改' : '创建活动'}</button>
      {!editing && <button className="secondary" onClick={createFourWeeks}>生成4周排练</button>}
      {editing && <button className="secondary" onClick={resetForm}>取消编辑</button>}
    </div>
    {qrUrl && <div className="qr-panel"><h3>排练签到二维码</h3><img src={qrUrl}/><button className="secondary" onClick={()=>setQrUrl('')}>关闭</button></div>}
    <div className="table events-table"><div className="row head"><span>标题</span><span>时间</span><span>地点</span><span>统计</span><span>操作</span></div>{rows.map(r=><div className="row" key={r.event_id}><span>{r.title}</span><span>{new Date(r.start_time).toLocaleString()}</span><span>{r.location || '-'}</span><span>{stats[r.event_id] ? `参加${stats[r.event_id].response_counts.attend || stats[r.event_id].response_counts.attending || 0} / 签到${stats[r.event_id].attendance_counts.present || 0} / 请假${stats[r.event_id].attendance_counts.leave || 0}` : '-'}</span><span><button className="tiny" onClick={()=>beginEdit(r)}>编辑</button><button className="tiny" onClick={()=>showQr(r.event_id)}>签到码</button><button className="tiny secondary" onClick={()=>loadStats(r.event_id)}>反馈统计</button><button className="tiny danger" onClick={()=>removeEvent(r)}>删除</button></span></div>)}</div>
  </div>
}

function Leaves({leaves, members, events, onDone}:{leaves:LeaveRow[]; members:MemberRow[]; events:EventRow[]; onDone:()=>void}) {
  async function approve(id:string){ await api(`/api/leave-requests/${id}/approve`, { method:'POST' }); await onDone() }
  async function reject(id:string){ const reason = prompt('驳回原因', '请联系团务确认') || ''; await api(`/api/leave-requests/${id}/reject`, { method:'POST', body: JSON.stringify({reject_reason: reason}) }); await onDone() }
  return <div className="table"><div className="row head"><span>成员</span><span>活动</span><span>原因</span><span>状态</span><span>操作</span></div>{leaves.map(l=><div className="row" key={l.leave_id}><span>{nameOf(members,l.user_id)}</span><span>{eventTitle(events,l.event_id)}</span><span>{l.reason}</span><span>{l.status}</span><span>{l.status==='pending' ? <><button className="tiny" onClick={()=>approve(l.leave_id)}>通过</button><button className="tiny secondary" onClick={()=>reject(l.leave_id)}>驳回</button></> : (l.reject_reason || '-')}</span></div>)}</div>
}

function Works({choirId, rows, onDone}:{choirId:string; rows: WorkRow[]; onDone:()=>void}) {
  const [title,setTitle]=useState('雪绒花')
  const [composer,setComposer]=useState('Richard Rodgers')
  const [selectedWork,setSelectedWork]=useState('')
  const [resourceName,setResourceName]=useState('总谱PDF')
  const [resources,setResources]=useState<ResourceRow[]>([])
  const [file,setFile]=useState<File|null>(null)
  async function create(){ if(!title.trim()) return alert('作品名称不能为空'); await api(`/api/choirs/${choirId}/works`,{method:'POST',body:JSON.stringify({title,composer,language:'English',status:'practicing'})}); await onDone() }
  async function loadResources(workId:string){ setSelectedWork(workId); if(workId){ setResources(await api<ResourceRow[]>(`/api/works/${workId}/resources`)) } }
  async function bindResource(){ if(!selectedWork || !file) return alert('请先选择作品和文件'); const uploaded = await uploadFile(file, { choir_id: choirId, purpose: 'resource' }); const resourceType = file.type.startsWith('video') ? 'video_score' : file.type.startsWith('audio') ? 'section_audio' : 'score_full'; await api(`/api/works/${selectedWork}/resources`,{method:'POST',body:JSON.stringify({resource_name:resourceName,resource_type:resourceType,file_url:uploaded.file_url,file_format:file.name.split('.').pop(),visibility:'all'})}); await loadResources(selectedWork); await onDone() }
  return <div><div className="inline-form"><input value={title} onChange={e=>setTitle(e.target.value)}/><input value={composer} onChange={e=>setComposer(e.target.value)}/><button onClick={create}>创建作品</button></div><div className="inline-form"><select value={selectedWork} onChange={e=>loadResources(e.target.value)}><option value="">选择作品绑定文件</option>{rows.map(w=><option key={w.work_id} value={w.work_id}>{w.title}</option>)}</select><input value={resourceName} onChange={e=>setResourceName(e.target.value)}/><input type="file" onChange={e=>setFile(e.target.files?.[0] || null)}/><button onClick={bindResource}>上传并绑定</button></div><div className="table"><div className="row head"><span>作品</span><span>作曲</span><span>语言</span><span>状态</span></div>{rows.map(w=><div className="row" key={w.work_id}><span>{w.title}</span><span>{w.composer || '-'}</span><span>{w.language || '-'}</span><span>{w.status}</span></div>)}</div>{selectedWork && <><h3>已绑定文件</h3><div className="table"><div className="row head"><span>名称</span><span>类型</span><span>格式</span><span>预览</span></div>{resources.map(r=><div className="row" key={r.resource_id}><span>{r.resource_name}</span><span>{r.resource_type}</span><span>{r.file_format}</span><span><button className="tiny" onClick={()=>openProtectedFile(r.file_url)}>打开</button></span></div>)}</div></>}</div>
}

function Tasks({choirId, rows, works, sections, firstSection, onDone}:{choirId:string; rows: TaskRow[]; works: WorkRow[]; sections: Section[]; firstSection:string; onDone:()=>void}) {
  const [title,setTitle]=useState('本周练习：第一段')
  const [deadline,setDeadline]=useState(twoHoursLater())
  const [workId,setWorkId]=useState('')
  const [sectionId,setSectionId]=useState(firstSection)
  async function create(){ if(!title.trim()) return alert('任务标题不能为空'); await api(`/api/choirs/${choirId}/practice-tasks`,{method:'POST',body:JSON.stringify({title,work_id:workId || null,target_sections:sectionId?[sectionId]:null,deadline:toIso(deadline),description:'请录制一遍自己的声部。'})}); await onDone() }
  return <div><div className="inline-form"><input value={title} onChange={e=>setTitle(e.target.value)}/><select value={workId} onChange={e=>setWorkId(e.target.value)}><option value="">不关联作品</option>{works.map(w=><option key={w.work_id} value={w.work_id}>{w.title}</option>)}</select><select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">全团</option>{sections.map(s=><option key={s.section_id} value={s.section_id}>{s.section_name}</option>)}</select><input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)}/><button onClick={create}>发布任务</button></div><div className="table"><div className="row head"><span>任务</span><span>截止</span><span>状态</span><span>目标声部数</span></div>{rows.map(t=><div className="row" key={t.task_id}><span>{t.title}</span><span>{new Date(t.deadline).toLocaleString()}</span><span>{t.status}</span><span>{t.target_sections?.length || '全团'}</span></div>)}</div></div>
}

function Records({rows, members, tasks, onDone}:{rows:PracticeRecord[]; members:MemberRow[]; tasks:TaskRow[]; onDone:()=>void}) {
  async function comment(recordId:string) { const content = prompt('点评内容', '音准整体不错，注意尾音不要掉。'); if(!content) return; await api(`/api/practice-records/${recordId}/comments`, { method:'POST', body: JSON.stringify({content, rating:4}) }); await onDone() }
  return <div className="table records-table"><div className="row head"><span>成员</span><span>任务</span><span>录音</span><span>自评/备注</span><span>已有点评</span><span>操作</span></div>{rows.map(r=><div className="row" key={r.practice_record_id}><span>{nameOf(members,r.user_id)}</span><span>{taskTitle(tasks,r.task_id)}</span><span>{r.audio_url ? <button className="tiny" onClick={()=>openProtectedFile(r.audio_url)}>播放/下载</button> : '-'}</span><span>{r.practice_count || 0}遍<br/>{r.pitch_self_rating || '-'} / {r.rhythm_self_rating || '-'} / {r.breath_self_rating || '-'}<br/>{r.note || '-'}</span><span>{r.comments?.map(c=>c.content).join('；') || '-'}</span><span><button className="tiny" onClick={()=>comment(r.practice_record_id)}>点评</button></span></div>)}</div>
}
