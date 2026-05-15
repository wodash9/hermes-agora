# Graph Report - hermes-agora  (2026-05-16)

## Corpus Check
- 46 files · ~36,610 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 511 nodes · 1144 edges · 20 communities (19 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `60405461`
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
1. `SQLiteMessageStore` - 51 edges
2. `JsonMessageStore` - 31 edges
3. `normalizeGroupId()` - 17 edges
4. `buildAuthHeaders()` - 15 edges
5. `JsonMessageStore` - 15 edges
6. `normalizeProjectId()` - 14 edges
7. `normalizeMemberProfileIds()` - 13 edges
8. `buildJsonHeaders()` - 12 edges
9. `normalizeDescription()` - 10 edges
10. `loadServerConfig()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `buildJsonHeaders()` --calls--> `buildAuthHeaders()`  [EXTRACTED]
  src/client/api.ts → src/client/api.ts  _Bridges community 13 → community 8_

## Communities (20 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (57): assignableProjectProfileIds(), CreateGroupInput, CreateMessageInput, CreateProjectInput, CreateTaskDocumentInput, CreateTaskInput, fromJson(), GroupRow (+49 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (47): buildGroupMessageMetadata(), canManageGroups(), createAgoraApp(), groupAccessStatus(), isGroupMember(), parseMemberProfileIds(), requireGroupAccess(), authenticateAgentToken() (+39 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (28): AgoraListenerClient, AgoraTaskListener, AgoraTaskListenerOptions, blockedText(), BootstrapMode, buildHermesPrompt(), extractTaskId(), isActionableTaskForProfile() (+20 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (31): loadServerConfig(), parseProfiles(), AgoraEvents, createAgoraApp(), defaultProfiles, deriveLegacyJsonDataFile(), deriveSqliteDataFile(), loadServerConfig() (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (10): normalizeWhiteboardTitle(), SQLiteMessageStore, toJson(), author, dbFile, file, jsonFile, statuses (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (33): buildAuthHeaders(), buildJsonHeaders(), buildSocketAuth(), createGroup(), deleteGroup(), fetchGroupMessages(), fetchGroups(), fetchIdentity() (+25 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (28): AgoraApiClient, asRecord(), callAgoraTool(), createAgoraWhiteboardMcpServer(), env(), parseElements(), requiredString(), safeError() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (14): App(), composerPlaceholder(), formatDate(), KANBAN_COLUMNS, labelX(), labelY(), ProjectPanel, renderWhiteboardShape() (+6 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (21): appendTaskDocument(), buildJsonHeaders(), createGroup(), createProject(), createProjectTask(), deleteProject(), fetchTaskWhiteboard(), postGroupMessage() (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.1
Nodes (22): Agora listener, API de agentes, code:bash (npm install), code:bash (npm run build), code:env (NODE_ENV=production), code:bash (npm run dev:web), code:bash (npm test), code:bash (export HERMES_AGORA_URL=https://agora.etharlia.com) (+14 more)

### Community 10 - "Community 10"
Cohesion: 0.16
Nodes (9): HttpAgoraClient, safeErrorDetail(), createHermesCliRunner(), runProcess(), stripCliNoise(), clampNumber(), main(), readArgs() (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (7): JsonMessageStore, normalizeChannel(), normalizeGroupId(), normalizeGroupName(), normalizeMemberProfileIds(), slugifyGroupName(), uniqueGroupId()

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (8): AuthMode, ClientAuthConfig, createClientAuthConfig(), defaultPostLogoutRedirectUri(), initKeycloak(), isMockAllowed(), logoutKeycloak(), resetKeycloakForRetry()

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (12): buildAuthHeaders(), buildSocketAuth(), deleteGroup(), fetchGroupMessages(), fetchGroups(), fetchIdentity(), fetchMessages(), fetchProfileStatuses() (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.5
Nodes (3): Acceptance criteria, Hermes Agora V0 Implementation Plan, MVP boundary

## Knowledge Gaps
- **75 isolated node(s):** `file`, `statuses`, `author`, `updatedProject`, `updatedTask` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SQLiteMessageStore` connect `Community 4` to `Community 0`, `Community 1`, `Community 3`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Why does `AgoraMessage` connect `Community 5` to `Community 0`, `Community 1`, `Community 2`, `Community 7`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `AgoraGroup` connect `Community 5` to `Community 0`, `Community 1`, `Community 2`, `Community 7`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **What connects `file`, `statuses`, `author` to the rest of the system?**
  _75 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._