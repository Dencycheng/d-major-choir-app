function baseUrl() {
  return wx.getStorageSync('choir_api_base') || getApp().globalData.apiBaseUrl || 'https://api.dmajorchoir.com'
}
function setBaseUrl(url) {
  wx.setStorageSync('choir_api_base', url)
  getApp().globalData.apiBaseUrl = url
}
function token() { return wx.getStorageSync('choir_token') || '' }
function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl() + path,
      method: options.method || 'GET',
      data: options.data || undefined,
      header: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
      success(res) { res.statusCode >= 200 && res.statusCode < 300 ? resolve(res.data) : reject(res.data || res.errMsg) },
      fail: reject
    })
  })
}
function uploadFile(filePath, formData = {}) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: baseUrl() + '/api/files/upload', filePath, name: 'file', formData,
      header: token() ? { Authorization: 'Bearer ' + token() } : {},
      success(res) { if (res.statusCode >= 200 && res.statusCode < 300) { try { resolve(JSON.parse(res.data)) } catch (e) { reject(e) } } else reject(res.data || res.errMsg) },
      fail: reject
    })
  })
}
async function sendLoginCode(mobile) {
  return request('/api/auth/send-code', { method: 'POST', data: { mobile, purpose: 'login' } })
}
async function login(mobile, code, name) {
  const res = await request('/api/auth/login-mobile', { method: 'POST', data: { mobile, code, name } })
  wx.setStorageSync('choir_token', res.access_token)
  wx.setStorageSync('choir_user', res.user)
  return res
}
async function myChoirs() { return request('/api/choirs/my') }
async function getCurrentChoir() {
  const stored = wx.getStorageSync('choir_current')
  if (stored && stored.choir_id) return stored
  const rows = await myChoirs()
  const active = (rows || [])[0]
  if (active) wx.setStorageSync('choir_current', active)
  return active
}
function setCurrentChoir(choir) { wx.setStorageSync('choir_current', choir) }
function logout() { wx.removeStorageSync('choir_token'); wx.removeStorageSync('choir_user'); wx.removeStorageSync('choir_current') }
function assetIdFromUrl(fileUrl) { const m = (fileUrl || '').match(/\/api\/files\/([^/]+)\/download/); return m && m[1] }
function fullUrl(url) { return url && (url.startsWith('http') ? url : baseUrl() + url) }
async function getSignedDownloadUrl(fileUrl) {
  const assetId = assetIdFromUrl(fileUrl)
  if (!assetId) return fullUrl(fileUrl)
  const res = await request(`/api/files/${assetId}/signed-url`)
  return fullUrl(res.signed_url)
}
async function getResourceDownloadUrl(input) {
  if (input && typeof input === 'object' && input.resource_id) {
    const res = await request(`/api/resources/${input.resource_id}/signed-url`)
    return fullUrl(res.signed_url || input.file_url)
  }
  return getSignedDownloadUrl(input)
}
async function openDocument(fileUrlOrResource, fileType) {
  const url = await getResourceDownloadUrl(fileUrlOrResource)
  wx.showLoading({ title: '打开中' })
  wx.downloadFile({ url, success(res) { wx.hideLoading(); if (res.statusCode === 200) wx.openDocument({ filePath: res.tempFilePath, fileType: fileType || undefined, showMenu: true }); else wx.showToast({ title: '下载失败', icon: 'none' }) }, fail() { wx.hideLoading(); wx.showToast({ title: '打开失败', icon: 'none' }) } })
}
async function playAudio(fileUrlOrResource) {
  const url = await getResourceDownloadUrl(fileUrlOrResource)
  const audio = wx.createInnerAudioContext(); audio.src = url; audio.play(); wx.showToast({ title: '开始播放', icon: 'none' }); return audio
}
async function openVideo(fileUrlOrResource) {
  const url = await getResourceDownloadUrl(fileUrlOrResource)
  wx.setStorageSync('choir_current_video_url', url)
  wx.navigateTo({ url: '/pages/library/library?video=1' })
  return url
}
module.exports = { request, uploadFile, sendLoginCode, login, logout, myChoirs, getCurrentChoir, setCurrentChoir, setBaseUrl, getSignedDownloadUrl, getResourceDownloadUrl, openDocument, playAudio, openVideo }
