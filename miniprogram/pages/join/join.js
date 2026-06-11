const api = require("../../utils/request");

const SECTIONS = [
  { value: "S", label: "女高 S" },
  { value: "A", label: "女低 A" },
  { value: "T", label: "男高 T" },
  { value: "B", label: "男低 B" },
];

Page({
  data: {
    loading: true,
    submitting: false,
    status: "form", // form | pending | rejected | approved
    rejectReason: "",
    sections: SECTIONS,
    sectionIndex: -1,
    form: {
      inviteCode: "",
      name: "",
      mobile: "",
      preferredSection: "",
      vocalRange: "",
      experience: "",
    },
  },

  onLoad(options) {
    if (options && options.code) {
      this.setData({ "form.inviteCode": options.code });
    }
    this.refresh();
  },

  onShow() {
    if (!this.data.loading) this.refresh();
  },

  async refresh() {
    try {
      const auth = await api.ensureLogin();
      const app = getApp();
      app.globalData.auth = auth;
      if (auth.member) {
        this.setData({ status: "approved", loading: false });
        wx.showToast({ title: "欢迎加入，一起唱歌吧", icon: "none" });
        setTimeout(() => wx.switchTab({ url: "/pages/home/home" }), 1200);
        return;
      }
      const latest = auth.joinRequest || null;
      if (latest && latest.status === "pending") {
        this.setData({ status: "pending", loading: false });
      } else if (latest && latest.status === "rejected") {
        this.setData({
          status: "rejected",
          rejectReason: latest.reviewNote || "",
          loading: false,
        });
      } else {
        this.setData({ status: "form", loading: false });
      }
    } catch (error) {
      console.error("[join] refresh", error);
      this.setData({ loading: false });
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    }
  },

  onInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onSectionChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      sectionIndex: index,
      "form.preferredSection": SECTIONS[index] ? SECTIONS[index].value : "",
    });
  },

  async submit() {
    const { form } = this.data;
    if (!form.inviteCode.trim()) {
      wx.showToast({ title: "请填写邀请码", icon: "none" });
      return;
    }
    if (!form.name.trim()) {
      wx.showToast({ title: "请填写姓名", icon: "none" });
      return;
    }
    if (!/^1\d{10}$/.test(form.mobile.trim())) {
      wx.showToast({ title: "请填写正确的手机号", icon: "none" });
      return;
    }
    if (!form.preferredSection) {
      wx.showToast({ title: "请选择意向声部", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.post("/api/join-requests", {
        inviteCode: form.inviteCode.trim(),
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        sectionPreference: form.preferredSection,
        voiceRange: form.vocalRange.trim(),
        experience: form.experience.trim(),
      });
      this.setData({ status: "pending", submitting: false });
      wx.showToast({ title: "申请已提交，等待审核", icon: "none" });
    } catch (error) {
      this.setData({ submitting: false });
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    }
  },

  retry() {
    this.setData({ status: "form", rejectReason: "" });
  },

  checkStatus() {
    this.setData({ loading: true });
    this.refresh();
  },
});
