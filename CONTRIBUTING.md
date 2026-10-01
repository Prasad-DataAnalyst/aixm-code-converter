# Contributing to the AIXM Code Converter

AIXM Code Converter · © 2026 Prasad Selvaraj (prasad2t@gmail.com) · Apache-2.0

Thank you for your interest. Contributions are welcome through **pull requests**; nothing is changed in this repository
without a review by the maintainer, Prasad Selvaraj.

1. **Fork** the repository and create a branch in your fork.
2. Make the change in `src/` (never edit `AIXM-Code-Converter.html` by hand), then build and test:
   ```bash
   cd aixm-code-converter/tools && npm ci
   npm run lint && npm run build && npm test
   ```
3. Commit the rebuilt `AIXM-Code-Converter.html` together with your source changes.
4. Open a **pull request** to `main` describing the change. The automatic checks (lint, unit tests, build check, browser
   tests) must pass, and the maintainer reviews every pull request before it is merged.

Please keep the copyright headers, the author credit and the `NOTICE` file: they are required by the Apache License 2.0
for redistributions and derivative works. Report bugs or ideas by e-mail to prasad2t@gmail.com.
