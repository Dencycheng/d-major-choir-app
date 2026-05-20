const api = require("../../utils/request");
const { sectionLabel, formatTime } = require("../../utils/format");

Page({
  data: {
    member: {},
    sections: [],
    sectionNames: [],
    profileForm: {},
    stats: {
      attendanceRate: 0,
      records: 0,
      feedback: 0
    },
    attendance: [],
    records: []
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const data = await api.get("/api/bootstrap");
      const member = data.currentMember || {};
      member.sectionLabel = sectionLabel(data.sections, member.section);
      member.initial = (member.name || "?").slice(0, 1);
      member.avatarFullUrl = member.avatarUrl ? api.absoluteUrl(member.avatarUrl) : "";

      const eventsById = {};
      (data.events || []).forEach(event => {
        eventsById[event.id] = event;
      });

      const attendance = (data.attendance || [])
        .filter(record => record.memberId === member.id)
        .map(record => ({
          ...record,
          eventTitle: eventsById[record.eventId] ? eventsById[record.eventId].title : "未知活动",
          timeText: record.time ? formatTime(record.time) : "未签到"
        }));

      const checkedIn = attendance.filter(record => record.status === "已签到").length;
      const attendanceRate = Math.round((checkedIn / Math.max(attendance.length, 1)) * 100);

      const records = (data.records || [])
        .filter(record => record.memberId === member.id)
        .map(record => ({
          ...record,
          submittedAtText: formatTime(record.submittedAt)
        }));

      this.setData({
        member,
        sections: data.sections || [],
        sectionNames: (data.sections || []).map(section => `${section.englishName} / ${section.name}`),
        profileForm: {
          nickname: member.nickname || "",
          mobile: member.mobile || "",
          email: member.email || "",
          section: member.section,
          sectionIndex: Math.max((data.sections || []).findIndex(section => section.code === member.section), 0),
          sectionLabel: sectionLabel(data.sections, member.section),
          sectionNote: ""
        },
        attendance,
        records,
        stats: {
          attendanceRate,
          records: records.length,
          feedback: records.filter(record => record.feedback).length
        }
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  onProfileInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`profileForm.${field}`]: event.detail.value });
  },

  onSectionChange(event) {
    const index = Number(event.detail.value);
    const section = this.data.sections[index];
    if (!section) return;
    this.setData({
      "profileForm.section": section.code,
      "profileForm.sectionIndex": index,
      "profileForm.sectionLabel": `${section.englishName} / ${section.name}`
    });
  },

  async saveProfile() {
    wx.showLoading({ title: "保存中" });
    try {
      await api.post("/api/profile", this.data.profileForm);
      wx.hideLoading();
      wx.showToast({ title: "资料已保存", icon: "success" });
      this.load();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: async res => {
        const filePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: "上传中" });
        try {
          await api.uploadFile({
            url: "/api/profile/avatar",
            filePath,
            name: "avatar"
          });
          wx.hideLoading();
          wx.showToast({ title: "头像已更新", icon: "success" });
          this.load();
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message, icon: "none" });
        }
      }
    });
  }
});
