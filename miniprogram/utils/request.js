const { API_BASE_URL, DEFAULT_MEMBER_ID } = require("../config/index");

function getMemberId() {
  return wx.getStorageSync("memberId") || DEFAULT_MEMBER_ID;
}

function setMemberId(memberId) {
  wx.setStorageSync("memberId", memberId);
}

function absoluteUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

function request(options) {
  const { url, method = "GET", data = {}, header = {} } = options;
  return new Promise((resolve, reject) => {
    wx.request({
      url: absoluteUrl(url),
      method,
      data,
      header: {
        "Content-Type": "application/json",
        "X-Member-Id": getMemberId(),
        ...header
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        reject(new Error((res.data && res.data.error) || `请求失败：${res.statusCode}`));
      },
      fail(error) {
        reject(new Error(error.errMsg || "网络请求失败"));
      }
    });
  });
}

function uploadFile(options) {
  const { url, filePath, name = "file", formData = {} } = options;
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: absoluteUrl(url),
      filePath,
      name,
      formData,
      header: {
        "X-Member-Id": getMemberId()
      },
      success(res) {
        let data = {};
        try {
          data = JSON.parse(res.data || "{}");
        } catch (error) {
          reject(new Error("上传结果解析失败"));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
          return;
        }
        reject(new Error(data.error || `上传失败：${res.statusCode}`));
      },
      fail(error) {
        reject(new Error(error.errMsg || "上传失败"));
      }
    });
  });
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: absoluteUrl(url),
      header: {
        "X-Member-Id": getMemberId()
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error(`下载失败：${res.statusCode}`));
      },
      fail(error) {
        reject(new Error(error.errMsg || "下载失败"));
      }
    });
  });
}

module.exports = {
  API_BASE_URL,
  getMemberId,
  setMemberId,
  absoluteUrl,
  request,
  uploadFile,
  downloadFile,
  get: url => request({ url }),
  post: (url, data) => request({ url, method: "POST", data }),
  put: (url, data) => request({ url, method: "PUT", data }),
  del: url => request({ url, method: "DELETE" })
};
