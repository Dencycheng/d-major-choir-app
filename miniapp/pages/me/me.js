const { login, sendLoginCode, logout, request, myChoirs, setCurrentChoir, setBaseUrl } = require('../../utils/api')
Page({
  data: { user: null, choirs: [], choirNames: [], currentChoir: null, mobile: '', name: '', smsCode: '', inviteCode: '', apiBase: 'https://api.dmajorchoir.com', loading: false },
  onShow() { this.load() },
  onMobile(e) { this.setData({ mobile: e.detail.value }) },
  onName(e) { this.setData({ name: e.detail.value }) },
  onSmsCode(e) { this.setData({ smsCode: e.detail.value }) },
  onInviteCode(e) { this.setData({ inviteCode: e.detail.value }) },
  onApiBase(e) { this.setData({ apiBase: e.detail.value }) },
  onSaveApiBase() { setBaseUrl(this.data.apiBase.trim()); wx.showToast({ title: '已保存', icon: 'success' }) },
  async onSendCode() {
    const mobile = this.data.mobile.trim()
    if (!mobile) return wx.showToast({ title: '请输入手机号', icon: 'none' })
    this.setData({ loading: true })
    try {
      const res = await sendLoginCode(mobile)
      wx.showToast({ title: res.debug_code ? `验证码 ${res.debug_code}` : (res.message || '验证码已发送'), icon: 'none' })
    } catch (err) { wx.showToast({ title: '发送失败', icon: 'none' }) }
    finally { this.setData({ loading: false }) }
  },
  async onLogin() {
    const mobile = this.data.mobile.trim()
    const code = this.data.smsCode.trim()
    if (!mobile) return wx.showToast({ title: '请输入手机号', icon: 'none' })
    if (!code) return wx.showToast({ title: '请输入验证码', icon: 'none' })
    this.setData({ loading: true })
    try { const res = await login(mobile, code, this.data.name.trim()); wx.showToast({ title: '登录成功', icon: 'success' }); this.setData({ user: res.user }); await this.load() }
    catch (err) { wx.showToast({ title: '登录失败', icon: 'none' }) }
    finally { this.setData({ loading: false }) }
  },
  onLogout() { logout(); this.setData({ user: null, choirs: [], choirNames: [], currentChoir: null }); wx.showToast({ title: '已退出', icon: 'none' }) },
  async onJoin() {
    const code = this.data.inviteCode.trim()
    if (!code) return wx.showToast({ title: '请输入邀请码', icon: 'none' })
    try { await request(`/api/choirs/join?invite_code=${encodeURIComponent(code)}`, { method: 'POST' }); wx.showToast({ title: '已提交申请', icon: 'success' }); await this.load() }
    catch (err) { wx.showToast({ title: '申请失败，请检查邀请码', icon: 'none' }) }
  },
  onChooseChoir(e) { const choir = this.data.choirs[Number(e.detail.value)]; if (choir) { setCurrentChoir(choir); this.setData({ currentChoir: choir }); wx.showToast({ title: '已选择', icon: 'success' }) } },
  async load() {
    const user = wx.getStorageSync('choir_user')
    const current = wx.getStorageSync('choir_current')
    const apiBase = wx.getStorageSync('choir_api_base') || getApp().globalData.apiBaseUrl
    this.setData({ user, currentChoir: current, apiBase })
    if (!wx.getStorageSync('choir_token')) return
    try { const choirs = await myChoirs(); const choirNames = choirs.map(x => x.choir_name); let selected = current && choirs.find(x => x.choir_id === current.choir_id); if (!selected && choirs[0]) selected = choirs[0]; if (selected) setCurrentChoir(selected); this.setData({ choirs, choirNames, currentChoir: selected || null }) } catch (err) {}
  }
})
