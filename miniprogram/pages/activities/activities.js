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
    try {
      await api.post("/api/events/respond", {
        eventId: id,
        response,
        note: this.data.noteMap[id] || ""
      });
      wx.showToast({ title: response === "请假" ? "请假已提交" : "已反馈参加", icon: "success" });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async checkin(event) {
    try {
      await api.post("/api/events/checkin", { eventId: event.currentTarget.dataset.id });
      wx.showToast({ title: "签到成功", icon: "success" });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  }
});
