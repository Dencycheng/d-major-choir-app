const { request, getCurrentChoir, openDocument, playAudio, openVideo } = require('../../utils/api')
Page({
  data: { works: [], selectedWork: null, resources: [], loading: false, videoUrl: '', playbackRate: 1, rates: [0.75, 1, 1.25, 1.5] },
  onLoad(options) { if (options.video) this.setData({ videoUrl: wx.getStorageSync('choir_current_video_url') || '' }) },
  onShow() { this.load() },
  async load() {
    try {
      const choir = await getCurrentChoir()
      if (!choir) return
      this.setData({ works: await request(`/api/choirs/${choir.choir_id}/works`) })
    } catch (err) { wx.showToast({ title: '谱库加载失败', icon: 'none' }) }
  },
  async onSelectWork(e) {
    const id = e.currentTarget.dataset.id
    const work = this.data.works.find(x => x.work_id === id)
    this.setData({ loading: true, selectedWork: work, resources: [] })
    try {
      this.setData({ resources: await request(`/api/works/${id}/resources`) })
    } catch (err) { wx.showToast({ title: '资料加载失败', icon: 'none' }) }
    finally { this.setData({ loading: false }) }
  },
  async onOpenResource(e) {
    const item = this.data.resources.find(x => x.resource_id === e.currentTarget.dataset.id)
    if (!item) return
    const format = (item.file_format || '').toLowerCase()
    if (['mp4', 'mov', 'm4v'].includes(format) || String(item.resource_type).includes('video')) {
      const url = await openVideo(item)
      this.setData({ videoUrl: url })
    } else if (['mp3', 'wav', 'm4a'].includes(format) || item.resource_type === 'audio') {
      await playAudio(item)
    } else {
      await openDocument(item, format === 'pdf' ? 'pdf' : undefined)
    }
  },
  onRate(e) {
    const rate = Number(e.currentTarget.dataset.rate)
    const ctx = wx.createVideoContext('scoreVideo', this)
    if (ctx.playbackRate) ctx.playbackRate(rate)
    this.setData({ playbackRate: rate })
  }
})
