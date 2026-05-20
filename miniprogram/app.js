const { DEFAULT_MEMBER_ID } = require("./config/index");

App({
  globalData: {
    memberId: DEFAULT_MEMBER_ID
  },

  onLaunch() {
    const savedMemberId = wx.getStorageSync("memberId");
    if (!savedMemberId) {
      wx.setStorageSync("memberId", DEFAULT_MEMBER_ID);
      this.globalData.memberId = DEFAULT_MEMBER_ID;
      return;
    }
    this.globalData.memberId = savedMemberId;
  }
});
