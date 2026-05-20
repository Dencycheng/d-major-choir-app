function sectionLabel(sections, code) {
  const section = (sections || []).find(item => item.code === code);
  if (!section) return code || "全团";
  return `${section.englishName} / ${section.name}`;
}

function isAudio(resource) {
  const type = resource && resource.type || "";
  const mime = resource && resource.file && resource.file.mimeType || "";
  return type.indexOf("伴奏") >= 0 || type.indexOf("音频") >= 0 || /^audio\//.test(mime);
}

function isPdf(resource) {
  const type = resource && resource.type || "";
  const mime = resource && resource.file && resource.file.mimeType || "";
  return type.indexOf("谱") >= 0 || mime.indexOf("pdf") >= 0;
}

function isVideo(resource) {
  const type = resource && resource.type || "";
  const mime = resource && resource.file && resource.file.mimeType || "";
  return type.indexOf("视频") >= 0 || /^video\//.test(mime);
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

module.exports = {
  sectionLabel,
  isAudio,
  isPdf,
  isVideo,
  formatTime
};
