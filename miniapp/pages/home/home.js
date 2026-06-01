const { request, getCurrentChoir } = require('../../utils/api')
Page({
  data: { choir: null, dashboard: null, events: [], tasks: [] },
  onShow() { this.load() },
  async load() {
    try {
      const choir = await getCurrentChoir()
      if (!choir) return
      const [dashboard, events, tasks] = await Promise.all([
        request(`/api/choirs/${choir.choir_id}/dashboard`),
        request(`/api/choirs/${choir.choir_id}/events`),
        request(`/api/choirs/${choir.choir_id}/practice-tasks`)
      ])
      this.setData({ choir, dashboard, events: events.slice(0, 3), tasks: tasks.slice(0, 3) })
    } catch (err) { wx.showToast({ title: '请先登录或确认已加入合唱团', icon: 'none' }) }
  }
})
