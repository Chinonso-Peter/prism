# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Prism — including the rate limiter, the decoder, the indexer, or any other component — please report it **privately** through [GitHub Security Advisories](https://github.com/prism-explorer/prism/security/advisories/new).

**Do not open a public issue for security vulnerabilities.**

When reporting, please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Any relevant code snippets or proof-of-concept
- The commit hash you tested against

## What to Expect

- We will acknowledge your report within **72 hours**
- We will provide an initial assessment within **7 days**
- We will work with you to understand and resolve the issue before any public disclosure
- We will credit you in the fix unless you prefer to remain anonymous

## Scope

In scope:

- The indexer (`indexer/`)
- The frontend (`frontend/`)
- The smart contracts (`contracts/`)
- The rate limiter and decoder components

Out of scope:

- Social engineering attacks
- Denial-of-service attacks
- Issues in third-party dependencies (report to the upstream project)
