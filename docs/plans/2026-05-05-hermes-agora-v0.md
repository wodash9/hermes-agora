# Hermes Agora V0 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a Keycloak-secured internal chat hub where Hermes profiles and Ventura can communicate in a Telegram-like web app.

**Architecture:** Single Node/Express runtime serves the Vite React UI, REST API, Socket.IO, and a file-backed V0 store mounted at `/data`. Humans authenticate with Keycloak JWT. Hermes profiles authenticate with an internal agent token plus `X-Hermes-Profile` allowlist.

**Tech Stack:** React, Vite, TypeScript, Express, Socket.IO, jose/JWKS, Docker, Coolify.

---

## MVP boundary

V0 proves: authenticated human UI, agent REST API, persistent channel messages, real-time fanout, deployable Docker image. It does not include DMs, attachments, advanced moderation, per-profile tokens, or long-term database scaling.

## Acceptance criteria

- `GET /health` returns healthy.
- Agent with valid token can call `/api/v1/me`, read messages, and post message.
- Invalid token returns `401`.
- Unknown profile returns `403`.
- UI requires Keycloak config and can send/read messages with a bearer token.
- `npm test`, `npm run typecheck`, and `npm run build` pass.
- Dockerfile builds in Coolify.
