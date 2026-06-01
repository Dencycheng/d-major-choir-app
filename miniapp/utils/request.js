function request(path, method = 'GET', data = {}) {
  const app = getApp()
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.apiBase + path,
      method,
      data,
      header: { 'Content-Type': 'application/json', 'Authorization': app.globalData.token ? `Bearer ${app.globalData.token}` : '' },
      success: res => res.statusCode >= 200 && res.statusCode < 300 ? resolve(res.data) : reject(res.data),
      fail: reject
    })
  })
}
module.exports = { request }
