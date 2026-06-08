# Security Policy

## Local-First Scope

opencode-pet reads local OpenCode data and local OpenCode server responses. It should not require a hosted AI provider for status bubbles or session summaries.

The summary generator only accepts local HTTP endpoints such as `127.0.0.1`, `localhost`, `[::1]`, or `0.0.0.0`. Remote summary endpoints are rejected intentionally.

## Reporting Vulnerabilities

Please report security issues through GitHub Security Advisories when the repository is public. If advisories are not enabled yet, open a minimal issue that says you have a security report, without including private exploit details.

Do not attach private `.opencode` databases, logs, screenshots, API keys, or project source unless they are fully sanitized.

## Supported Versions

Until the first stable release, security fixes target the latest `main` branch.
