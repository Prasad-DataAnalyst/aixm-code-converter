// AIXM Code Converter - Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com>
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
// ESLint configuration (flat format, ESLint 9+): the application sources run in the browser as classic scripts that
// share module globals; the tools and tests run in Node. Run from the repository root (npm run lint does).
const js = require('@eslint/js');
const globals = require('globals');
const APP_GLOBALS = {"APP_INFO":"readonly","APP_SETTINGS":"readonly","AX":"readonly","MODEL":"readonly","AIP":"readonly","ANALYSIS":"readonly","MAPVIEW":"readonly","EXPORTS":"readonly","CONVERT":"readonly","LIBRARY":"readonly","REVIEW":"readonly","RULES":"readonly","I18N":"readonly","ADCHART":"readonly","MAPWIN":"readonly","ABOUT":"readonly","TERRAIN":"readonly","VIEW3D":"readonly","THREE":"readonly","OLS":"readonly","INTEGRITY":"readonly","PROFILE":"readonly","EXTRACT":"readonly","DEVICE":"readonly","FEEDBACK":"readonly","L":"readonly","XLSX":"readonly","jspdf":"readonly","fflate":"readonly","topojson":"readonly","module":"writable"};
const RULES = {
  "no-undef": "error",
  "no-redeclare": [
    "error",
    {
      "builtinGlobals": false
    }
  ],
  "no-dupe-keys": "error",
  "no-unreachable": "error",
  "no-self-assign": "error",
  "no-unused-vars": [
    "warn",
    {
      "args": "none",
      "caughtErrors": "none",
      "varsIgnorePattern": "^(APP_INFO|APP_SETTINGS|AX|MODEL|AIP|ANALYSIS|MAPVIEW|EXPORTS|CONVERT|LIBRARY|REVIEW|RULES|I18N|ADCHART|MAPWIN|ABOUT|TERRAIN|VIEW3D|OLS|INTEGRITY|PROFILE|EXTRACT|DEVICE|FEEDBACK|OBSTAB|OBSTVIEW|DDVIEW|DDMAP)$"
    }
  ],
  "no-constant-condition": [
    "warn",
    {
      "checkLoops": false
    }
  ],
  "no-empty": "warn",
  "eqeqeq": [
    "warn",
    "smart"
  ],
  "no-unused-expressions": "warn"
};
module.exports = [
  { ignores: ['tools/node_modules/**', 'tools/tests/out/**', 'tools/shots/**', 'AIXM-Code-Converter.html'] },
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: Object.assign({}, globals.browser, globals.worker, APP_GLOBALS) },
    rules: RULES
  },
  {
    files: ['tools/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: Object.assign({}, globals.node, globals.browser, APP_GLOBALS, { MODEL: 'readonly', AIP: 'readonly', AX: 'readonly' }) },
    rules: Object.assign({}, js.configs.recommended.rules, RULES)
  }
];
