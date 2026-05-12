# Graph Report - hermes-agora  (2026-05-12)

## Corpus Check
- 41 files · ~24,784 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 366 nodes · 774 edges · 18 communities (16 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a53e0112`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 12|Community 12]]

## God Nodes (most connected - your core abstractions)
1. `JsonMessageStore` - 31 edges
2. `JsonMessageStore` - 15 edges
3. `buildAuthHeaders()` - 14 edges
4. `buildJsonHeaders()` - 11 edges
5. `normalizeGroupId()` - 10 edges
6. `normalizeProjectId()` - 9 edges
7. `Hermes Agora` - 9 edges
8. `buildAuthHeaders()` - 9 edges
9. `HttpAgoraClient` - 8 edges
10. `normalizeGroupId()` - 8 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (18 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (50): CreateGroupInput, CreateMessageInput, CreateProjectInput, CreateTaskDocumentInput, CreateTaskInput, JsonMessageStore, ListMessagesInput, nextTaskOrder() (+42 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (48): buildAuthHeaders(), buildJsonHeaders(), buildSocketAuth(), createGroup(), deleteGroup(), fetchGroupMessages(), fetchGroups(), fetchIdentity() (+40 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (24): AgoraListenerClient, AgoraTaskListener, AgoraTaskListenerOptions, blockedText(), BootstrapMode, buildHermesPrompt(), extractTaskId(), isActionableTaskForProfile() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (24): loadServerConfig(), parseProfiles(), AgoraEvents, defaultProfiles, loadServerConfig(), parseProfiles(), ServerConfig, attachAgoraSocket() (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.16
Nodes (24): buildGroupMessageMetadata(), canManageGroups(), createAgoraApp(), groupAccessStatus(), isGroupMember(), parseMemberProfileIds(), requireGroupAccess(), buildGroupMessageMetadata() (+16 more)

### Community 5 - "Community 5"
Cohesion: 0.19
Nodes (22): authenticateAgentToken(), authenticateToken(), bearerToken(), canAccessChannel(), hasRequiredAudience(), hasRole(), requireIdentity(), requireScope() (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (11): createHermesCliRunner(), runProcess(), stripCliNoise(), clampNumber(), main(), readArgs(), readListenerConfig(), FileListenerStateStore (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.19
Nodes (7): JsonMessageStore, normalizeChannel(), normalizeGroupId(), normalizeGroupName(), normalizeMemberProfileIds(), slugifyGroupName(), uniqueGroupId()

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (18): Agora listener, API de agentes, code:bash (npm install), code:bash (npm run dev:web), code:bash (npm test), code:bash (export HERMES_AGORA_URL=https://agora.etharlia.com), code:json ({), code:bash (HERMES_AGORA_URL=https://agora.etharlia.com \) (+10 more)

### Community 12 - "Community 12"
Cohesion: 0.5
Nodes (3): Acceptance criteria, Hermes Agora V0 Implementation Plan, MVP boundary

## Knowledge Gaps
- **50 isolated node(s):** `file`, `statuses`, `author`, `config`, `jeeves` (+45 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AgoraMessage` connect `Community 0` to `Community 1`, `Community 2`, `Community 4`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `AgoraGroup` connect `Community 0` to `Community 1`, `Community 2`, `Community 4`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `JsonMessageStore` connect `Community 0` to `Community 3`, `Community 4`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **What connects `file`, `statuses`, `author` to the rest of the system?**
  _50 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._