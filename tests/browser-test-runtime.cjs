// Install Playwright locally, or point PLAYWRIGHT_MODULE_PATH at an existing install.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const launchOptions = {headless: true};
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE)
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
module.exports = {chromium, launchOptions};
