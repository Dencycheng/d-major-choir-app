const api = require("../../utils/request");
const { formatTime } = require("../../utils/format");

const recorderManager = wx.getRecorderManager();

Page({
  data: {
    tasks: [],
    ratings: ["稳定", "一般", "需要帮助"],
    formMap: {},
    recordingMap: {},
    activeRecordingTaskId: ""
  },

  onLoad() {
    recorderManager.onStop(res => {
      const taskId = this.data.activeRecordingTaskId;
      if (!taskId) return;
      this.setData({
        [`recordingMap.${taskId}`]: {
          filePath: res.tempFilePath,
          label: "现场录音"
        },
        activeRecordingTaskId: ""
      });
      wx.showToast({ title: "录音已保存", icon: "success" });
    });

    recorderManager.onError(error => {
      this.setData({ activeRecordingTaskId: "" });
      wx.showToast({ title: error.errMsg || "录音失败", icon: "none" });
    });
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const data = await api.get("/api/bootstrap");
      const member = data.currentMember || {};
      const tasks = (data.tasks || [])
        .filter(task => task.targetSections.includes(member.section) || task.targetSections.includes("ALL"))
        .map(task => {
          const myRecords = (data.records || [])
            .filter(record => record.taskId === task.id && record.memberId === member.id)
            .map(record => ({ ...record, submittedAtText: formatTime(record.submittedAt) }));
          return { ...task, myRecords };
        });

      const formMap = { ...this.data.formMap };
      tasks.forEach(task => {
        formMap[task.id] ||= {
          feelings: "",
          pitch: "一般",
          pitchIndex: 1,
          rhythm: "一般",
          rhythmIndex: 1,
          breath: "一般",
          breathIndex: 1,
          needHelp: false
        };
      });

      this.setData({ tasks, formMap });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  startRecord(event) {
    const taskId = event.currentTarget.dataset.id;
    wx.authorize({
      scope: "scope.record",
      success: () => {
        this.setData({ activeRecordingTaskId: taskId });
        recorderManager.start({
          duration: 5 * 60 * 1000,
          sampleRate: 44100,
          numberOfChannels: 1,
          encodeBitRate: 96000,
          format: "mp3"
        });
      },
      fail: () => {
        wx.showModal({
          title: "需要录音权限",
          content: "请在设置中允许录音，用于提交练习打卡。",
          confirmText: "去设置",
          success(res) {
            if (res.confirm) wx.openSetting();
          }
        });
      }
    });
  },

  stopRecord() {
    if (!this.data.activeRecordingTaskId) return;
    recorderManager.stop();
  },

  chooseAudio(event) {
    const taskId = event.currentTarget.dataset.id;
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["mp3", "m4a", "wav", "aac"],
      success: res => {
        const file = res.tempFiles[0];
        this.setData({
          [`recordingMap.${taskId}`]: {
            filePath: file.path,
            label: file.name || "已选择音频"
          }
        });
      },
      fail: error => {
        if (error.errMsg.indexOf("cancel") < 0) {
          wx.showToast({ title: error.errMsg || "选择失败", icon: "none" });
        }
      }
    });
  },

  onFormInput(event) {
    const { id, field } = event.currentTarget.dataset;
    this.setData({ [`formMap.${id}.${field}`]: event.detail.value });
  },

  onRatingChange(event) {
    const { id, field } = event.currentTarget.dataset;
    const index = Number(event.detail.value);
    this.setData({
      [`formMap.${id}.${field}`]: this.data.ratings[index],
      [`formMap.${id}.${field}Index`]: index
    });
  },

  toggleNeedHelp(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ [`formMap.${id}.needHelp`]: !this.data.formMap[id].needHelp });
  },

  async submitRecord(event) {
    const taskId = event.currentTarget.dataset.id;
    const recording = this.data.recordingMap[taskId];
    if (!recording || !recording.filePath) {
      wx.showToast({ title: "请先录音或选择音频", icon: "none" });
      return;
    }

    const form = this.data.formMap[taskId] || {};
    wx.showLoading({ title: "上传中" });
    try {
      await api.uploadFile({
        url: "/api/practice/records",
        filePath: recording.filePath,
        name: "audio",
        formData: {
          taskId,
          feelings: form.feelings || "",
          pitch: form.pitch || "一般",
          rhythm: form.rhythm || "一般",
          breath: form.breath || "一般",
          needHelp: form.needHelp ? "true" : "false"
        }
      });
      wx.hideLoading();
      wx.showToast({ title: "打卡已提交", icon: "success" });
      this.setData({ [`recordingMap.${taskId}`]: null });
      this.load();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message, icon: "none" });
    }
  }
});
