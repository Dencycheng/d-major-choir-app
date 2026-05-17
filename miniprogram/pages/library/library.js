const api = require("../../utils/request");
const { sectionLabel, isAudio } = require("../../utils/format");

let audioContext = null;

Page({
  data: {
    works: [],
    playingResourceId: ""
  },

  onShow() {
    this.load();
  },

  onUnload() {
    if (audioContext) {
      audioContext.destroy();
      audioContext = null;
    }
  },

  async load() {
    try {
      const data = await api.get("/api/bootstrap");
      const member = data.currentMember || {};
      const resources = (data.resources || [])
        .filter(resource => resource.section === "ALL" || resource.section === member.section)
        .map(resource => ({
          ...resource,
          isAudio: isAudio(resource),
          fileUrl: api.absoluteUrl(resource.fileUrl),
          displaySection: resource.section === "ALL" ? "全团" : sectionLabel(data.sections, resource.section)
        }));

      const works = (data.works || []).map(work => ({
        ...work,
        resources: resources.filter(resource => resource.workId === work.id)
      }));

      this.setData({ works });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async openDocument(event) {
    const { url, title, type } = event.currentTarget.dataset;
    if (!url) {
      wx.showToast({ title: "文件不可用", icon: "none" });
      return;
    }

    wx.showLoading({ title: "打开中" });
    try {
      const tempFilePath = await api.downloadFile(url);
      wx.hideLoading();
      wx.openDocument({
        filePath: tempFilePath,
        showMenu: true,
        success: () => {},
        fail: error => {
          wx.showToast({ title: `${type || title} 无法预览`, icon: "none" });
          console.warn(error);
        }
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  playAudio(event) {
    const { id, url } = event.currentTarget.dataset;
    if (!url) {
      wx.showToast({ title: "音频不可用", icon: "none" });
      return;
    }

    if (this.data.playingResourceId === id && audioContext) {
      audioContext.pause();
      this.setData({ playingResourceId: "" });
      return;
    }

    if (audioContext) {
      audioContext.destroy();
      audioContext = null;
    }

    audioContext = wx.createInnerAudioContext();
    audioContext.src = url;
    audioContext.onEnded(() => this.setData({ playingResourceId: "" }));
    audioContext.onError(error => {
      this.setData({ playingResourceId: "" });
      wx.showToast({ title: error.errMsg || "播放失败", icon: "none" });
    });
    audioContext.play();
    this.setData({ playingResourceId: id });
  }
});
