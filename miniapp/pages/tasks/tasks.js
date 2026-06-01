const { request, uploadFile, getCurrentChoir } = require('../../utils/api')
const recorder = wx.getRecorderManager()
Page({
  data: { tasks: [], records: [], recording: false, currentTaskId: null, currentChoir: null },
  onLoad() {
    recorder.onStop(async (res) => {
      const taskId = this.data.currentTaskId
      const choir = this.data.currentChoir
      this.setData({ recording: false, currentTaskId: null })
      if (!taskId || !choir) return
      wx.showLoading({ title: '上传中' })
      try {
        const uploaded = await uploadFile(res.tempFilePath, { choir_id: choir.choir_id, purpose: 'practice_record' })
        await request(`/api/practice-tasks/${taskId}/records`, { method: 'POST', data: { audio_url: uploaded.file_url, audio_duration: Math.round((res.duration || 0) / 1000), practice_count: 1, note: '小程序录音打卡' } })
        wx.showToast({ title: '打卡成功' })
        await this.load()
      } catch (err) { wx.showToast({ title: '上传或打卡失败', icon: 'none' }) }
      finally { wx.hideLoading() }
    })
    recorder.onError(() => { this.setData({ recording: false, currentTaskId: null }); wx.showToast({ title: '录音失败，请检查麦克风权限', icon: 'none' }) })
  },
  onShow() { this.load() },
  async load() { try { const choir = await getCurrentChoir(); if (!choir) return; this.setData({ currentChoir: choir, tasks: await request(`/api/choirs/${choir.choir_id}/practice-tasks`) }) } catch (err) { wx.showToast({ title: '任务加载失败', icon: 'none' }) } },
  onStartRecord(e) { const id = e.currentTarget.dataset.id; this.setData({ recording: true, currentTaskId: id }); recorder.start({ duration: 120000, sampleRate: 44100, numberOfChannels: 1, encodeBitRate: 128000, format: 'mp3' }) },
  onStopRecord() { recorder.stop() },
  async onSubmitDemoRecord(e) { const id = e.currentTarget.dataset.id; try { await request(`/api/practice-tasks/${id}/records`, { method: 'POST', data: { audio_url: '/api/files/demo/download', audio_duration: 60, practice_count: 1, note: '小程序Demo打卡' } }); wx.showToast({ title: '打卡成功' }); await this.onLoadRecords({ currentTarget: { dataset: { id } } }) } catch (err) { wx.showToast({ title: '打卡失败', icon: 'none' }) } },
  async onLoadRecords(e) { const id = e.currentTarget.dataset.id; try { const choir = await getCurrentChoir(); const rows = await request(`/api/choirs/${choir.choir_id}/practice-records?task_id=${id}`); this.setData({ records: rows }); wx.showToast({ title: '已刷新', icon: 'none' }) } catch (err) { wx.showToast({ title: '加载打卡失败', icon: 'none' }) } }
})
