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
  credit: 'AIXM Code Converter (c) 2026 Prasad Selvaraj <prasad2t@gmail.com>, Apache-2.0',
  // safety notice, shown on the About page and in Help
  disclaimer: 'NOT FOR OPERATIONAL USE. The AIXM Code Converter is a tool for checking, studying and visualising aeronautical data. ' +
    'It must not be used for flight planning, navigation, flight operations, aerodrome or instrument procedure design decisions, ' +
    'obstacle assessment or any other operational or safety-related purpose. Always use the official AIP, AIP amendments and ' +
    'supplements, NOTAM and the approved aeronautical charts published by the State. Everything this tool shows or produces ' +
    '(AIP pages, maps, airport charts, 3D views, terrain, grid MORA, approach profiles, obstacle limitation surfaces, data ' +
    'integrity results, conversions and exports) is derived automatically from the input data, may be incomplete or ' +
    'inaccurate, and is provided "as is" without warranty of any kind (Apache License 2.0, sections 7 and 8).'
});
var APP_SETTINGS = Object.freeze({
  liteAutoBytes: 1.5 * 1024 * 1024 * 1024, // files above this size use the Lite memory mode (Auto)
  maxThreads: 8,                          // parallel parser threads (capped by the CPU count)
  pdfMaxRows: 5000,                       // rows per table in PDF exports (Excel/JSON keep everything)
  airacPublishDays: 42                    // AIRAC amendments are published this many days before the effective date
});
