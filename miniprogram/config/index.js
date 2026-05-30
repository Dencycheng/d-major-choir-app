const ENV = "production";
const VERSION = "1.2.0";

const CONFIG = {
  production: {
    API_BASE_URL: "https://api.dmajorchoir.com"
  },
  development: {
    API_BASE_URL: "http://127.0.0.1:4173"
  }
};

module.exports = {
  ENV,
  VERSION,
  API_BASE_URL: CONFIG[ENV].API_BASE_URL,
  DEFAULT_MEMBER_ID: "m-alto-01"
};
