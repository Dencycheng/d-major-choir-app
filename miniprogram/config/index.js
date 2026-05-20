const ENV = "production";
const VERSION = "1.1.3";

const CONFIG = {
  production: {
    API_BASE_URL: "http://119.45.176.130:4173"
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
