---
name: secret-scan
description: Use for a full-history secret scan, when a secret may have been committed, or when changing .gitleaksignore. Scans locally, triages without printing values, and records false positives with reasons.
---

# Secret scan

CI (`.github/workflows/secret-scan.yml`) scans each PR range and each push to
main after the push. The workflow also has a manual run whose `full` input
defaults to true; do not use it for full history. This repo is public, so
Actions logs are world-readable, and the log would show where a real hit is
before anyone could rotate it. Full-history scans run locally.

## Scan

```bash
gitleaks git --redact=100 --no-banner --log-opts=origin/main \
  --report-format json --report-path <scratch>/gitleaks-report.json .
```

The report path must be outside the repository.

## Triage without printing a value

```bash
python3 -I .claude/skills/secret-scan/triage.py <scratch>/gitleaks-report.json
```

It prints each finding's rule, file and lines, commit, fingerprint, and only
the shape of each value (an identifier-type prefix and a length). Open the
line yourself to judge it, and describe it by shape only, in chat and in
files.

- A credential: tell the owner, who rotates it first. Commit nothing that
  points at where it is.
- A false positive: add its fingerprint to `.gitleaksignore` with a `# reason`
  comment on the line above that says what the value is, not what it is not.

## Done

A rescan with the updated `.gitleaksignore` reports no leaks. Record the
gitleaks version and its own count of commits scanned (it differs from
`git rev-list`).
