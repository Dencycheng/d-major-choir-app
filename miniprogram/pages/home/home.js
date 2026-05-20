const api = require("../../utils/request");
const { sectionLabel, formatTime } = require("../../utils/format");

Page({
  data: {
    choir: {},
    member: {},
    latestEvent: {},
    pendingTasks: [],
    latestFeedback: {}
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const data = await api.get("/api/bootstrap");
      const member = data.currentMember || {};
      member.sectionLabel = sectionLabel(data.sections, member.section);
      const section = member.section;
      const tasks = (data.tasks || []).filter(task => task.targetSections.includes(section) || task.targetSections.includes("ALL"));
      const pendingTasks = tasks.filter(task => !task.progress || !task.progress.done).slice(0, 3);
      const latestFeedback = (data.records || [])
        .filter(record => record.memberId === member.id && record.feedback)
        .sort((a, b) => new Date(b.commentedAt || b.submittedAt) - new Date(a.commentedAt || a.submittedAt))[0] || {};
      if (latestFeedback.id) latestFeedback.submittedAtText = formatTime(latestFeedback.submittedAt);

      this.setData({
        choir: data.choir || {},
        member,
        latestEvent: (data.events || [])[0] || {},
        pendingTasks,
        latestFeedback
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async respondEvent(event) {
    const { id, response } = event.currentTarget.dataset;
    try {
      await api.post("/api/events/respond", { eventId: id, response });
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
  },

  goActivities() {
    wx.switchTab({ url: "/pages/activities/activities" });
  },

  goPractice() {
    wx.switchTab({ url: "/pages/practice/practice" });
  },

  goMine() {
    wx.switchTab({ url: "/pages/mine/mine" });
  }
});
