const api = require("../../utils/request");

Page({
  data: {
    events: [],
    noteMap: {}
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const data = await api.get("/api/bootstrap");
      this.setData({ events: data.events || [] });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  onNoteInput(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ [`noteMap.${id}`]: event.detail.value });
  },

  async respond(event) {
    const { id, response } = event.currentTarget.dataset;
    if (response === "参加") {
      wx.showModal({
        title: "确认参加",
        content: "确认参加，期待一起唱歌。",
        confirmText: "确认参加",
        success: res => {
          if (res.confirm) this.submitResponse(id, response, "");
        }
      });
      return;
    }

    wx.showModal({
      title: "请假说明",
      content: "今晚需要请假吗？写下原因，声部长会温柔确认。",
      editable: true,
      placeholderText: "请假理由",
      confirmText: "提交请假",
      success: res => {
        if (!res.confirm) return;
        const reason = (res.content || this.data.noteMap[id] || "").trim();
        if (!reason) {
          wx.showToast({ title: "请填写请假理由", icon: "none" });
          return;
        }
        this.submitResponse(id, response, reason);
      }
    });
  },

  async submitResponse(id, response, note) {
    try {
      await api.post("/api/events/respond", { eventId: id, response, note });
      wx.showToast({ title: response === "请假" ? "请假已提交，等待确认" : "确认参加，期待一起唱歌", icon: "none" });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async checkin(event) {
    try {
      await api.post("/api/events/checkin", { eventId: event.currentTarget.dataset.id });
      wx.showToast({ title: "签到成功，快快开嗓一起唱吧", icon: "none" });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  }
});
