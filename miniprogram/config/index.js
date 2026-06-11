// 正式上线使用 production（HTTPS 合法域名）；开发联调切到 development 并在开发者工具勾选“不校验合法域名”
const ENV = "production";
const VERSION = "2.1.0";

const CONFIG = {
  production: {
    API_BASE_URL: "https://api.dmajorchoir.com"
  },
  development: {
    API_BASE_URL: "http://119.45.176.130:4173"
  }
};

module.exports = {
  ENV,
  VERSION,
  API_BASE_URL: CONFIG[ENV].API_BASE_URL
};
