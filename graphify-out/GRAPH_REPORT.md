# Graph Report - hermes-agora  (2026-05-15)

## Corpus Check
- 41 files · ~30,321 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 446 nodes · 998 edges · 20 communities (18 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0c33bfca`
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
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 16|Community 16]]

## God Nodes (most connected - your core abstractions)
1. `SQLiteMessageStore` - 47 edges
2. `JsonMessageStore` - 31 edges
3. `normalizeGroupId()` - 17 edges
4. `JsonMessageStore` - 15 edges
5. `normalizeProjectId()` - 14 edges
6. `buildAuthHeaders()` - 14 edges
7. `normalizeMemberProfileIds()` - 13 edges
8. `buildJsonHeaders()` - 11 edges
9. `normalizeDescription()` - 10 edges
10. `loadServerConfig()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `rowToTaskDocument()` --calls--> `parseTaskDocumentKind()`  [EXTRACTED]
  src/server/store.ts → src/server/store.ts  _Bridges community 4 → community 0_
- `buildJsonHeaders()` --calls--> `buildAuthHeaders()`  [EXTRACTED]
  src/client/api.ts → src/client/api.ts  _Bridges community 5 → community 8_

## Communities (20 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (36): assignableProjectProfileIds(), fromJson(), JsonMessageStore, nextTaskOrder(), normalizeAssignees(), normalizeChannel(), normalizeDescription(), normalizeGroupId() (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (30): loadServerConfig(), parseProfiles(), AgoraEvents, createAgoraApp(), defaultProfiles, deriveLegacyJsonDataFile(), deriveSqliteDataFile(), loadServerConfig() (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (39): CreateGroupInput, CreateMessageInput, CreateProjectInput, CreateTaskDocumentInput, CreateTaskInput, GroupRow, ListMessagesInput, MessageRow (+31 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (24): AgoraListenerClient, AgoraTaskListener, AgoraTaskListenerOptions, blockedText(), BootstrapMode, buildHermesPrompt(), extractTaskId(), isActionableTaskForProfile() (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (25): buildGroupMessageMetadata(), canManageGroups(), createAgoraApp(), groupAccessStatus(), isGroupMember(), parseMemberProfileIds(), requireGroupAccess(), buildGroupMessageMetadata() (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (26): buildAuthHeaders(), buildJsonHeaders(), buildSocketAuth(), createGroup(), deleteGroup(), fetchGroupMessages(), fetchGroups(), fetchIdentity() (+18 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (5): App(), composerPlaceholder(), KANBAN_COLUMNS, ProjectPanel, View

### Community 7 - "Community 7"
Cohesion: 0.19
Nodes (22): authenticateAgentToken(), authenticateToken(), bearerToken(), canAccessChannel(), hasRequiredAudience(), hasRole(), requireIdentity(), requireScope() (+14 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (18): appendTaskDocument(), buildJsonHeaders(), createGroup(), createProject(), createProjectTask(), deleteProject(), postGroupMessage(), postMessage() (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (11): createHermesCliRunner(), runProcess(), stripCliNoise(), clampNumber(), main(), readArgs(), readListenerConfig(), FileListenerStateStore (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.19
Nodes (7): JsonMessageStore, normalizeChannel(), normalizeGroupId(), normalizeGroupName(), normalizeMemberProfileIds(), slugifyGroupName(), uniqueGroupId()

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (18): Agora listener, API de agentes, code:bash (npm install), code:bash (npm run dev:web), code:bash (npm test), code:bash (export HERMES_AGORA_URL=https://agora.etharlia.com), code:json ({), code:bash (HERMES_AGORA_URL=https://agora.etharlia.com \) (+10 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (8): AuthMode, ClientAuthConfig, createClientAuthConfig(), defaultPostLogoutRedirectUri(), initKeycloak(), isMockAllowed(), logoutKeycloak(), resetKeycloakForRetry()

### Community 16 - "Community 16"
Cohesion: 0.5
Nodes (3): Acceptance criteria, Hermes Agora V0 Implementation Plan, MVP boundary

## Knowledge Gaps
- **65 isolated node(s):** `file`, `statuses`, `author`, `updatedProject`, `updatedTask` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SQLiteMessageStore` connect `Community 0` to `Community 1`, `Community 2`, `Community 4`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Why does `AgoraMessage` connect `Community 2` to `Community 3`, `Community 4`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Why does `AgoraGroup` connect `Community 2` to `Community 3`, `Community 4`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **What connects `file`, `statuses`, `author` to the rest of the system?**
  _65 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._