const { request, getCurrentChoir } = require('../../utils/api')
Page({
  data: { events: [], checkinCodes: {} },
  onShow() { this.load() },
  async load() { try { const choir = await getCurrentChoir(); if (!choir) return; this.setData({ events: await request(`/api/choirs/${choir.choir_id}/events`) }) } catch (err) { wx.showToast({ title: '活动加载失败', icon: 'none' }) } },
  onCodeInput(e) { const id = e.currentTarget.dataset.id; this.setData({ checkinCodes: { ...this.data.checkinCodes, [id]: e.detail.value } }) },
  async onRespond(e) {
    const status = e.currentTarget.dataset.status
    try {
      if (status === 'attend') {
        const ok = await new Promise(resolve => wx.showModal({ title: '确认参加', content: '确认参加，期待一起唱歌。', success: res => resolve(res.confirm) }))
        if (!ok) return
      }
      await request(`/api/choirs/${(await getCurrentChoir()).choir_id}/events/${e.currentTarget.dataset.id}/response`, { method: 'POST', data: { response_status: status } })
      wx.showToast({ title: '已确认' })
    } catch (err) { wx.showToast({ title: '提交失败', icon: 'none' }) }
  },
  async onCheckin(e) { const id = e.currentTarget.dataset.id; const code = this.data.checkinCodes[id] || ''; try { const res = await request(`/api/events/${id}/checkin?checkin_code=${encodeURIComponent(code)}`, { method: 'POST' }); wx.showModal({ title: '签到成功', content: res.message || '签到成功，快快开嗓一起唱吧。', showCancel: false }) } catch (err) { wx.showToast({ title: '签到失败，请确认签到码', icon: 'none' }) } },
  async onLeave(e) {
    const id = e.currentTarget.dataset.id
    const reason = await new Promise(resolve => wx.showModal({ title: '请假原因', editable: true, placeholderText: '请输入请假原因', success: res => resolve(res.confirm ? res.content : '') }))
    if (!reason) return
    try { await request(`/api/events/${id}/leave`, { method: 'POST', data: { reason } }); wx.showToast({ title: '已提交请假' }) } catch (err) { wx.showToast({ title: '请假失败', icon: 'none' }) }
  }
})
