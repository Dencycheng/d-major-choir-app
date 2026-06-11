const { API_BASE_URL } = require("../config/index");

const TOKEN_KEY = "dmajor_token";

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function setToken(token) {
  if (token) {
    wx.setStorageSync(TOKEN_KEY, token);
  } else {
    wx.removeStorageSync(TOKEN_KEY);
  }
}

function authHeader(extra = {}) {
  const token = getToken();
  const header = { ...extra };
  if (token) header.Authorization = `Bearer ${token}`;
  return header;
}

function absoluteUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

function fileUrl(path) {
  // 文件流地址附加 token（音视频/图片组件无法带自定义 Header）
  const url = absoluteUrl(path);
  if (!url) return "";
  const token = getToken();
  if (!token) return url;
  return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);
}

function rawRequest({ url, method = "GET", data = {}, header = {} }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: absoluteUrl(url),
      method,
      data,
      header: authHeader(header),
      success: res => resolve(res),
      fail: err => reject(new Error(err && err.errMsg ? err.errMsg : "网络请求失败")),
    });
  });
}

let loginPromise = null;

function wechatLogin() {
  if (loginPromise) return loginPromise;
  loginPromise = new Promise((resolve, reject) => {
    wx.login({
      success: ({ code }) => {
        if (!code) {
          reject(new Error("微信登录失败：未获取到 code"));
          return;
        }
        wx.request({
          url: absoluteUrl("/api/auth/wechat"),
          method: "POST",
          data: { code },
          success: res => {
            if (res.statusCode === 200 && res.data && res.data.token) {
              setToken(res.data.token);
              resolve(res.data);
            } else {
              reject(new Error((res.data && (res.data.error || res.data.message)) || "登录失败，请稍后再试"));
            }
          },
          fail: () => reject(new Error("网络异常，登录失败")),
        });
      },
      fail: () => reject(new Error("微信登录失败")),
    });
  }).finally(() => {
    loginPromise = null;
  });
  return loginPromise;
}

async function ensureLogin() {
  const token = getToken();
  if (token) {
    try {
      const res = await rawRequest({ url: "/api/me" });
      if (res.statusCode === 200) return res.data;
      if (res.statusCode !== 401) {
        throw new Error((res.data && (res.data.error || res.data.message)) || "获取登录状态失败");
      }
      setToken("");
    } catch (err) {
      // 网络错误时不清除 token，向上抛出
      if (getToken()) throw err;
    }
  }
  return wechatLogin();
}

async function request(options) {
  const { retryOnAuthFail = true } = options;
  let res = await rawRequest(options);
  if (res.statusCode === 401 && retryOnAuthFail) {
    setToken("");
    await wechatLogin();
    res = await rawRequest(options);
  }
  if (res.statusCode >= 200 && res.statusCode < 300) {
    return res.data;
  }
  const message = (res.data && (res.data.error || res.data.message)) || `请求失败（${res.statusCode}）`;
  const error = new Error(message);
  error.statusCode = res.statusCode;
  error.payload = res.data;
  throw error;
}

function get(url, data = {}) {
  return request({ url, method: "GET", data });
}

function post(url, data = {}) {
  return request({ url, method: "POST", data });
}

function put(url, data = {}) {
  return request({ url, method: "PUT", data });
}

function del(url, data = {}) {
  return request({ url, method: "DELETE", data });
}

function uploadFile({ url, filePath, name = "file", formData = {} }) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: absoluteUrl(url),
      filePath,
      name,
      formData,
      header: authHeader(),
      success: res => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(res.data));
          } catch (err) {
            resolve(res.data);
          }
        } else {
          let message = `上传失败（${res.statusCode}）`;
          try {
            const payload = JSON.parse(res.data);
            if (payload) message = payload.error || payload.message || message;
          } catch (err) {
            /* ignore */
          }
          reject(new Error(message));
        }
      },
      fail: () => reject(new Error("网络异常，上传失败")),
    });
  });
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: fileUrl(url),
      header: authHeader(),
      success: res => {
        if (res.statusCode === 200) {
          resolve(res.tempFilePath);
        } else {
          reject(new Error(`下载失败（${res.statusCode}）`));
        }
      },
      fail: () => reject(new Error("网络异常，下载失败")),
    });
  });
}

module.exports = {
  TOKEN_KEY,
  getToken,
  setToken,
  absoluteUrl,
  fileUrl,
  wechatLogin,
  ensureLogin,
  request,
  get,
  post,
  put,
  del,
  uploadFile,
  downloadFile,
};
