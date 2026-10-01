// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// Shared settings for the browser tests: repository root, output folder, Chromium path.
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
function out(name) { const d = path.join(__dirname, 'out', name); fs.mkdirSync(d, { recursive: true }); return d; }
const chrome = process.env.CHROME || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .find((c) => fs.existsSync(c)) || undefined; // undefined: playwright-core's own browser
module.exports = { ROOT, out, chrome, playwright: require(path.join(ROOT, 'tools', 'node_modules', 'playwright-core')) };
