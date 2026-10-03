# Security policy

AIXM Code Converter is a single offline HTML file. It does not upload, store or send your data anywhere: AIXM files
are read inside your browser. The only network requests are the optional online map tiles.

## Supported versions

Only the latest release receives fixes: <https://github.com/Prasad-DataAnalyst/aixm-code-converter/releases/latest>

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately:

- GitHub: **Security → Report a vulnerability** on this repository (private advisory), or
- e-mail: prasad2t@gmail.com

Include the version (top bar, e.g. v1.2.1), the browser, and steps or a sample file that shows the problem.
You will get an answer within 7 days.

## Verify your download

Every release lists the SHA-256 checksum of its files (`SHA256SUMS.txt`) and has a signed build record made by
GitHub Actions from the source in this repository. To check a downloaded file:

```
sha256sum AIXM-Code-Converter.html            # Linux / macOS: compare with SHA256SUMS.txt
certutil -hashfile AIXM-Code-Converter.html SHA256   # Windows
gh attestation verify AIXM-Code-Converter.html --repo Prasad-DataAnalyst/aixm-code-converter   # GitHub CLI
```

Download the tool only from this repository's releases.
