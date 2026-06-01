import { useEffect, useMemo, useState } from 'react'
import { API_BASE, api, clearToken, loginMobile, sendLoginCode, setToken, uploadFile } from './api'

type Choir = { choir_id: string; choir_name: string; invite_code?: string; city?: string; rehearsal_location?: string }
type Dashboard = { member_count: number; active_member_count: number; event_count: number; task_count: number; practice_record_count: number; section_counts: Record<string, number> }
type EventRow = { event_id: string; title: string; event_type: string; start_time: string; end_time: string; location?: string; description?: string; checkin_code?: string }
type TaskRow = { task_id: string; title: string; description?: string; deadline: string; required_checkin_count: number; work_id?: string }
type WorkRow = { work_id: string; title: string; composer?: string; language?: string; status: string }
type ResourceRow = { resource_id: string; resource_name: string; resource_type: string; file_url: string; file_format?: string; visibility: string }
type MemberProfile = { member_id:string; section_id?:string; section_name?:string; role:string; member_status:string; user?: { name?:string; nickname?:string; mobile?:string; email?:string; avatar_url?:string } }
type RecordRow = { practice_record_id: string; task_id: string; note?: string; audio_url?: string; practice_count?: number; pitch_self_rating?: string; rhythm_self_rating?: string; breath_self_rating?: string; need_help?: boolean; created_at?: string; comments?: { comment_id: string; content: string; rating?: number }[] }
type NotificationRow = { notification_id: string; title: string; content: string; is_read: boolean; created_at: string }
type Tab = 'home'|'events'|'tasks'|'works'|'me'
type Notice = { type: 'ok'|'error'|'info'; text: string }

const formatTime = (v?: string) => v ? new Date(v).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '-'
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

function errorText(err: unknown) { return err instanceof Error ? err.message : String(err) }

export default function App() {
  const [mobile, setMobile] = useState('13900000001')
  const [name, setName] = useState('合唱团成员')
  const [smsCode, setSmsCode] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [choirs, setChoirs] = useState<Choir[]>([])
  const [selected, setSelected] = useState<Choir | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [works, setWorks] = useState<WorkRow[]>([])
  const [records, setRecords] = useState<RecordRow[]>([])
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [resources, setResources] = useState<ResourceRow[]>([])
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [profileAvatar, setProfileAvatar] = useState<File | null>(null)
  const [nickname, setNickname] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [selectedWork, setSelectedWork] = useState<WorkRow | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [recordNote, setRecordNote] = useState('今天练习了两遍，副歌气息还需要更稳定。')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [practiceFile, setPracticeFile] = useState<File | null>(null)

  const pendingTasks = useMemo(() => tasks.slice(0, 3), [tasks])
  const nextEvent = events[0]
  const notify = (type: Notice['type'], text: string) => setNotice({ type, text })

  async function loadChoirs() {
    const rows = await api<Choir[]>('/api/choirs/my')
    setChoirs(rows)
    const keep = rows.find(x => x.choir_id === selected?.choir_id) || rows[0] || null
    setSelected(keep)
    if (keep) localStorage.setItem('member_choir_id', keep.choir_id)
  }

  async function loadAll(choir = selected) {
    if (!choir) return
    const [dash, evs, ts, ws, rs, ns, me] = await Promise.all([
      api<Dashboard>(`/api/choirs/${choir.choir_id}/dashboard`),
      api<EventRow[]>(`/api/choirs/${choir.choir_id}/events`),
      api<TaskRow[]>(`/api/choirs/${choir.choir_id}/practice-tasks`),
      api<WorkRow[]>(`/api/choirs/${choir.choir_id}/works`),
      api<RecordRow[]>(`/api/choirs/${choir.choir_id}/practice-records`),
      api<NotificationRow[]>('/api/notifications'),
      api<MemberProfile>(`/api/choirs/${choir.choir_id}/me`).catch(() => null),
    ])
    setDashboard(dash); setEvents(evs); setTasks(ts); setWorks(ws); setRecords(rs); setNotifications(ns)
    setProfile(me); setNickname(me?.user?.nickname || '')
    if (!selectedTaskId && ts[0]) setSelectedTaskId(ts[0].task_id)
  }

  useEffect(() => { loadChoirs().catch(() => {}) }, [])
  useEffect(() => { if (selected) loadAll(selected).catch(e => notify('error', errorText(e))) }, [selected?.choir_id])

  async function sendCode() {
    setBusy(true)
    try {
      const res = await sendLoginCode(mobile)
      notify('ok', res.debug_code ? `验证码已发送：${res.debug_code}` : '验证码已发送')
    } catch (e) { notify('error', errorText(e)) } finally { setBusy(false) }
  }

  async function doLogin() {
    if (!smsCode.trim()) return notify('error', '请先输入短信验证码')
    setBusy(true)
    try {
      const res = await loginMobile(mobile, smsCode.trim(), name)
      setToken(res.access_token)
      notify('ok', '登录成功')
      await loadChoirs()
    } catch (e) { notify('error', errorText(e)) } finally { setBusy(false) }
  }

  async function doJoin() {
    if (!inviteCode.trim()) return notify('error', '请先输入邀请码')
    setBusy(true)
    try {
      await api(`/api/choirs/join?invite_code=${encodeURIComponent(inviteCode.trim())}`, { method: 'POST' })
      notify('ok', '加入申请已提交，请管理员在后台审批。')
      await loadChoirs()
    } catch (e) { notify('error', errorText(e)) } finally { setBusy(false) }
  }

  async function respondEvent(event: EventRow, status: 'attend'|'leave'|'tentative') {
    if (!selected) return
    if (status === 'attend' && !window.confirm('确认参加，期待一起唱歌。')) return
    setBusy(true)
    try {
      await api(`/api/choirs/${selected.choir_id}/events/${event.event_id}/response`, { method:'POST', body: JSON.stringify({ response_status: status }) })
      notify('ok', status === 'attend' ? '确认参加，期待一起唱歌。' : status === 'leave' ? '已提交请假意向' : '已标记待定')
    } catch (e) { notify('error', errorText(e)) } finally { setBusy(false) }
  }

  async function checkin(event: EventRow) {
    setBusy(true)
    try {
      const code = event.checkin_code ? `?checkin_code=${encodeURIComponent(event.checkin_code)}` : ''
      await api(`/api/events/${event.event_id}/checkin${code}`, { method:'POST' })
      notify('ok', '签到成功，快快开嗓一起唱吧。')
      await loadAll()
    } catch (e) { notify('error', '签到失败：请确认管理员已生成签到码。' + errorText(e)) } finally { setBusy(false) }
  }

  async function submitLeave(event: EventRow) {
    const reason = prompt('请输入请假原因', '当天有家庭安排，申请请假。')
    if (!reason) return
    setBusy(true)
    try {
      await api(`/api/events/${event.event_id}/leave`, { method:'POST', body: JSON.stringify({ reason }) })
      notify('ok', '请假申请已提交，等待管理员审批')
    } catch (e) { notify('error', errorText(e)) } finally { setBusy(false) }
  }

  async function saveProfile() {
    if (!selected) return
    setBusy(true)
    try {
      let avatar_url = profile?.user?.avatar_url
      if (profileAvatar) {
        const uploaded = await uploadFile(profileAvatar, { choir_id: selected.choir_id, purpose: 'avatar' })
        avatar_url = uploaded.file_url
      }
      await api(`/api/choirs/${selected.choir_id}/me`, { method:'PUT', body: JSON.stringify({ nickname, avatar_url }) })
      notify('ok', '资料已更新')
      await loadAll()
    } catch(e) { notify('error', errorText(e)) } finally { setBusy(false) }
  }

  async function submitPracticeRecord() {
    if (!selectedTaskId) return notify('error', '请先选择练习任务')
    setBusy(true)
    try {
      let audioUrl = ''
      if (practiceFile) {
        const uploaded = await uploadFile(practiceFile, { purpose: 'practice_record' })
        audioUrl = uploaded.file_url
      }
      await api(`/api/practice-tasks/${selectedTaskId}/records`, { method:'POST', body: JSON.stringify({
        audio_url: audioUrl || undefined,
        audio_duration: practiceFile ? 60 : undefined,
        practice_count: 2,
        pitch_self_rating: '一般',
        rhythm_self_rating: '稳定',
        breath_self_rating: '有点紧',
        need_help: true,
        note: recordNote,
      }) })
      notify('ok', '打卡已提交，等待声部长或指挥点评')
      setPracticeFile(null)
      await loadAll()
    } catch (e) { notify('error', errorText(e)) } finally { setBusy(false) }
  }

  async function openWork(work: WorkRow) {
    setSelectedWork(work)
    setTab('works')
    try {
      const detail = await api<any>(`/api/works/${work.work_id}`)
      setResources(detail.resources || [])
    } catch (e) { notify('error', errorText(e)) }
  }

  return <div className="app-shell">
    <header className="topbar">
      <div>
        <div className="member-brand"><img className="brand-logo" src="/dmajor-logo.png" alt="D Major Choir"/><div><div className="eyebrow">D Major Choir · Member Portal</div><h1>合唱团成员端</h1><p>查看排练、完成练习打卡、接收点评，让每一次练习被看见。</p></div></div>
      </div>
      <div className="login-card">
        <input value={mobile} onChange={e=>setMobile(e.target.value)} placeholder="手机号" />
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="姓名/昵称" />
        <input value={smsCode} onChange={e=>setSmsCode(e.target.value)} placeholder="短信验证码" />
        <button className="ghost" disabled={busy} onClick={sendCode}>发送验证码</button>
        <button disabled={busy} onClick={doLogin}>成员登录</button>
        <button className="ghost" onClick={() => { clearToken(); setChoirs([]); setSelected(null); notify('info','已退出') }}>退出</button>
      </div>
    </header>

    {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}

    <section className="choir-switch card">
      <div>
        <strong>我的合唱团</strong>
        <p>如果成员还没有加入合唱团，可输入后台生成的邀请码申请加入。</p>
      </div>
      <select value={selected?.choir_id || ''} onChange={e => setSelected(choirs.find(c=>c.choir_id===e.target.value) || null)}>
        <option value="">请选择合唱团</option>
        {choirs.map(c => <option key={c.choir_id} value={c.choir_id}>{c.choir_name}</option>)}
      </select>
      <input value={inviteCode} onChange={e=>setInviteCode(e.target.value)} placeholder="输入邀请码" />
      <button disabled={busy} onClick={doJoin}>申请加入</button>
    </section>

    <nav className="tabs">
      {[
        ['home','首页'], ['events','活动'], ['tasks','练习'], ['works','谱库'], ['me','我的']
      ].map(([key, label]) => <button key={key} className={tab===key?'active':''} onClick={()=>setTab(key as Tab)}>{label}</button>)}
    </nav>

    {!selected && <main className="empty card"><h2>请先登录并选择合唱团</h2><p>可以用后台管理员生成的邀请码申请加入；管理员审批后，成员就能看到活动、任务和谱库。</p></main>}

    {selected && tab==='home' && <main className="grid">
      <section className="card hero-card">
        <div className="eyebrow">本周待办</div>
        <h2>{selected.choir_name}</h2>
        <p>{selected.city || '合唱团'} · {selected.rehearsal_location || '排练地点待更新'}</p>
        <div className="metrics">
          <div><strong>{dashboard?.event_count ?? '-'}</strong><span>活动</span></div>
          <div><strong>{dashboard?.task_count ?? '-'}</strong><span>练习任务</span></div>
          <div><strong>{dashboard?.practice_record_count ?? '-'}</strong><span>打卡</span></div>
        </div>
      </section>
      <section className="card">
        <h3>下一次活动</h3>
        {nextEvent ? <div className="highlight">
          <strong>{nextEvent.title}</strong>
          <span>{formatTime(nextEvent.start_time)} · {nextEvent.location || '地点待定'}</span>
          <div><button onClick={()=>respondEvent(nextEvent,'attend')}>确认参加</button><button className="ghost" onClick={()=>submitLeave(nextEvent)}>请假</button></div>
        </div> : <p>暂无活动</p>}
      </section>
      <section className="card wide">
        <h3>待完成练习</h3>
        <div className="task-list">{pendingTasks.length ? pendingTasks.map(t => <article key={t.task_id} onClick={()=>{setTab('tasks');setSelectedTaskId(t.task_id)}}><strong>{t.title}</strong><p>{t.description || '请按要求完成本周练习。'}</p><span>截止：{formatTime(t.deadline)}</span></article>) : <p>暂无练习任务</p>}</div>
      </section>
      <section className="card">
        <h3>最新通知</h3>
        {notifications.slice(0,4).map(n => <div className="mini" key={n.notification_id}><strong>{n.title}</strong><p>{n.content}</p></div>)}
        {!notifications.length && <p>暂无通知</p>}
      </section>
    </main>}

    {selected && tab==='events' && <main className="card">
      <h2>活动与签到</h2>
      <div className="list">{events.map(e => <article className="list-item" key={e.event_id}>
        <div><strong>{e.title}</strong><p>{formatTime(e.start_time)} - {formatTime(e.end_time)} · {e.location || '地点待定'}</p><p>{e.description}</p></div>
        <div className="actions"><button onClick={()=>respondEvent(e,'attend')}>参加</button><button className="ghost" onClick={()=>respondEvent(e,'tentative')}>待定</button><button className="ghost" onClick={()=>submitLeave(e)}>请假</button><button onClick={()=>checkin(e)}>签到</button></div>
      </article>)}</div>
      {!events.length && <p>暂无活动。可在管理后台创建排练活动。</p>}
    </main>}

    {selected && tab==='tasks' && <main className="grid">
      <section className="card">
        <h2>练习任务</h2>
        <div className="task-list">{tasks.map(t => <article className={selectedTaskId===t.task_id?'selected':''} key={t.task_id} onClick={()=>setSelectedTaskId(t.task_id)}><strong>{t.title}</strong><p>{t.description || '暂无说明'}</p><span>截止：{formatTime(t.deadline)}</span></article>)}</div>
      </section>
      <section className="card">
        <h2>提交练习打卡</h2>
        <label>选择任务</label>
        <select value={selectedTaskId} onChange={e=>setSelectedTaskId(e.target.value)}>{tasks.map(t => <option key={t.task_id} value={t.task_id}>{t.title}</option>)}</select>
        <label>上传录音，可选</label>
        <input type="file" accept="audio/*,.m4a,.mp3,.wav" onChange={e=>setPracticeFile(e.target.files?.[0] || null)} />
        <label>练习感受</label>
        <textarea value={recordNote} onChange={e=>setRecordNote(e.target.value)} />
        <button disabled={busy || !selectedTaskId} onClick={submitPracticeRecord}>提交打卡</button>
      </section>
      <section className="card wide">
        <h2>我的打卡与点评</h2>
        {records.map(r => <article className="record" key={r.practice_record_id}>
          <div><strong>{tasks.find(t=>t.task_id===r.task_id)?.title || '练习任务'}</strong><p>{r.note}</p><span>{formatTime(r.created_at)}</span></div>
          {r.audio_url && <button className="ghost" onClick={()=>openProtectedFile(r.audio_url)}>打开录音</button>}
          <div className="comments">{r.comments?.length ? r.comments.map(c => <p key={c.comment_id}>💬 {c.content}{c.rating ? `（${c.rating}星）` : ''}</p>) : <p>等待点评</p>}</div>
        </article>)}
        {!records.length && <p>暂无打卡记录</p>}
      </section>
    </main>}

    {selected && tab==='works' && <main className="grid">
      <section className="card">
        <h2>谱库</h2>
        {works.map(w => <article className={selectedWork?.work_id===w.work_id?'selected':''} key={w.work_id} onClick={()=>openWork(w)}><strong>{w.title}</strong><p>{w.composer || '作曲信息待补充'} · {w.language || '语言待补充'}</p></article>)}
        {!works.length && <p>暂无作品。可在管理后台创建谱库作品。</p>}
      </section>
      <section className="card">
        <h2>{selectedWork?.title || '作品资料'}</h2>
        {resources.map(r => <article className="resource" key={r.resource_id}><div><strong>{r.resource_name}</strong><p>{r.resource_type} · {r.file_format || 'file'}</p></div><button onClick={async()=>{ const f=(r.file_format||'').toLowerCase(); if (['mp4','mov','m4v'].includes(f) || r.resource_type.includes('video')) { const assetId=fileAssetIdFromUrl(r.file_url); if(assetId){ const res=await api<{signed_url:string}>(`/api/files/${assetId}/signed-url`); setVideoUrl(`${API_BASE}${res.signed_url}`) } else setVideoUrl(r.file_url) } else openProtectedFile(r.file_url) }}>打开</button></article>)}
        {videoUrl && <div className="video-player"><video src={videoUrl} controls /><div className="actions">{[0.75,1,1.25,1.5].map(rate=><button className="ghost" key={rate} onClick={()=>{ const v=document.querySelector('.video-player video') as HTMLVideoElement | null; if(v) v.playbackRate=rate }}>{rate}x</button>)}</div></div>}
        {!resources.length && <p>请选择一个作品查看资料。</p>}
      </section>
    </main>}

    {selected && tab==='me' && <main className="grid">
      <section className="card"><h2>我的资料</h2>{profile?.user?.avatar_url && <img className="profile-avatar" src={profile.user.avatar_url.startsWith('/api') ? `${API_BASE}${profile.user.avatar_url}` : profile.user.avatar_url}/>}<p>{profile?.user?.name || '-'} · {profile?.user?.mobile || '-'}</p><p>{profile?.section_name || '未分配声部'} · {profile?.role || '-'}</p><label>昵称</label><input value={nickname} onChange={e=>setNickname(e.target.value)} /><label>头像</label><input type="file" accept="image/*" onChange={e=>setProfileAvatar(e.target.files?.[0] || null)} /><button disabled={busy} onClick={saveProfile}>保存资料</button><p className="muted">声部变更请联系管理员提交审核。</p></section>
      <section className="card"><h2>我的练习数据</h2><div className="metrics"><div><strong>{records.length}</strong><span>打卡次数</span></div><div><strong>{notifications.length}</strong><span>通知</span></div><div><strong>{tasks.length}</strong><span>可见任务</span></div></div></section>
      <section className="card"><h2>声部分布</h2>{dashboard && Object.entries(dashboard.section_counts).map(([k,v])=><p key={k}>{k}：{v} 人</p>)}</section>
    </main>}
  </div>
}
