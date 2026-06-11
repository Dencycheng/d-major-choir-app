const { ensureLogin } = require("./utils/request");

App({
  globalData: {
    auth: null
  },

  onLaunch() {
    // V2.1：取消固定 memberId，使用微信登录绑定真实成员身份
    wx.removeStorageSync("memberId");
    ensureLogin()
      .then(auth => {
        this.globalData.auth = auth;
        if (!auth.member) {
          // 未绑定成员：进入邀请码入团流程
          wx.reLaunch({ url: "/pages/join/join" });
        }
      })
      .catch(error => {
        console.error("[auth] 登录失败", error);
      });
  }
});
