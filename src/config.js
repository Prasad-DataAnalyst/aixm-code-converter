/*!
 * AIXM Code Converter
 * Copyright 2026 Prasad Selvaraj <prasad2t@gmail.com> - author of the AIXM Code Converter
 * SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE; keep this notice in all copies)
 * ==========================================================================
 * AIXM Code Converter - application identity and shared settings
 * One place for the name, version, author and tunable limits used by every
 * module (UI, exports, conversions, map). Change values here, not in modules.
 * ========================================================================== */
var APP_INFO = Object.freeze({
  name: 'AIXM Code Converter',
  version: '1.2.0',
  year: '2026',
  author: 'Prasad Selvaraj',
  email: 'prasad2t@gmail.com',
  license: 'Apache-2.0',
  credit: 'AIXM Code Converter (c) 2026 Prasad Selvaraj <prasad2t@gmail.com>, Apache-2.0'
});
var APP_SETTINGS = Object.freeze({
  liteAutoBytes: 1.5 * 1024 * 1024 * 1024, // files above this size use the Lite memory mode (Auto)
  maxThreads: 8,                          // parallel parser threads (capped by the CPU count)
  pdfMaxRows: 5000,                       // rows per table in PDF exports (Excel/JSON keep everything)
  airacPublishDays: 42                    // AIRAC amendments are published this many days before the effective date
});
