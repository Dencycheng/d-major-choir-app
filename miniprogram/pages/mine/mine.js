const api = require("../../utils/request");
const { sectionLabel, formatTime } = require("../../utils/format");

Page({
  data: {
    member: {},
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
  }
});
