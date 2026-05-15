# Graph Report - hermes-agora  (2026-05-16)

## Corpus Check
- 46 files · ~40,164 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 536 nodes · 1215 edges · 25 communities (22 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `386b96ad`
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
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 21|Community 21]]

## God Nodes (most connected - your core abstractions)
1. `SQLiteMessageStore` - 52 edges
2. `JsonMessageStore` - 31 edges
3. `normalizeGroupId()` - 17 edges
4. `buildAuthHeaders()` - 15 edges
5. `JsonMessageStore` - 15 edges
6. `normalizeProjectId()` - 14 edges
7. `normalizeMemberProfileIds()` - 13 edges
8. `buildJsonHeaders()` - 12 edges
9. `elementToStroke()` - 11 edges
10. `elementToNode()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `normalizeSharedGroupIds()` --calls--> `normalizeGroupId()`  [EXTRACTED]
  src/server/store.ts → src/server/store.ts  _Bridges community 14 → community 17_
- `rowToProject()` --calls--> `parseProjectStatus()`  [EXTRACTED]
  src/server/store.ts → src/server/store.ts  _Bridges community 0 → community 15_
- `rowToProject()` --calls--> `fromJson()`  [EXTRACTED]
  src/server/store.ts → src/server/store.ts  _Bridges community 15 → community 2_
- `rowToProject()` --calls--> `normalizeProfileId()`  [EXTRACTED]
  src/server/store.ts → src/server/store.ts  _Bridges community 15 → community 17_
- `buildJsonHeaders()` --calls--> `buildAuthHeaders()`  [EXTRACTED]
  src/client/api.ts → src/client/api.ts  _Bridges community 6 → community 10_

## Communities (25 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (48): buildGroupMessageMetadata(), canManageGroups(), createAgoraApp(), groupAccessStatus(), isGroupMember(), parseMemberProfileIds(), requireGroupAccess(), authenticateAgentToken() (+40 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (30): AgoraListenerClient, AgoraTaskListener, AgoraTaskListenerOptions, blockedText(), BootstrapMode, buildHermesPrompt(), extractTaskId(), isActionableTaskForProfile() (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (39): CreateGroupInput, CreateMessageInput, CreateProjectInput, CreateTaskDocumentInput, CreateTaskInput, defaultNodeFill(), defaultWhiteboardDiagram(), fromJson() (+31 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (32): loadServerConfig(), parseProfiles(), AgoraEvents, createAgoraApp(), defaultProfiles, deriveLegacyJsonDataFile(), deriveSqliteDataFile(), loadServerConfig() (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (34): AgoraApiClient, asRecord(), callAgoraTool(), createAgoraWhiteboardMcpServer(), env(), parseElements(), requiredString(), safeError() (+26 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (15): App(), composerPlaceholder(), emptyWhiteboardDiagram(), formatDate(), KANBAN_COLUMNS, labelX(), labelY(), ProjectPanel (+7 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (28): buildAuthHeaders(), buildJsonHeaders(), buildSocketAuth(), createGroup(), deleteGroup(), fetchGroupMessages(), fetchGroups(), fetchIdentity() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (25): AgentScope, AgoraProject, AgoraTask, Author, GroupListResponse, KanbanStatus, MessageListResponse, ParticipantType (+17 more)

### Community 9 - "Community 9"
Cohesion: 0.1
Nodes (22): Agora listener, API de agentes, code:bash (npm install), code:bash (npm run build), code:env (NODE_ENV=production), code:bash (npm run dev:web), code:bash (npm test), code:bash (export HERMES_AGORA_URL=https://agora.etharlia.com) (+14 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (19): appendTaskDocument(), buildJsonHeaders(), createGroup(), createProject(), createProjectTask(), postGroupMessage(), postMessage(), updateGroup() (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.16
Nodes (9): HttpAgoraClient, safeErrorDetail(), createHermesCliRunner(), runProcess(), stripCliNoise(), clampNumber(), main(), readArgs() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.19
Nodes (7): JsonMessageStore, normalizeChannel(), normalizeGroupId(), normalizeGroupName(), normalizeMemberProfileIds(), slugifyGroupName(), uniqueGroupId()

### Community 14 - "Community 14"
Cohesion: 0.21
Nodes (5): normalizeChannel(), normalizeGroupId(), normalizeGroupName(), slugifyGroupName(), uniqueGroupId()

### Community 15 - "Community 15"
Cohesion: 0.27
Nodes (8): assignableProjectProfileIds(), nextTaskOrder(), normalizeAssignees(), normalizeLabels(), normalizeTaskTitle(), parseKanbanStatus(), rowToProject(), rowToTask()

### Community 16 - "Community 16"
Cohesion: 0.18
Nodes (8): AuthMode, ClientAuthConfig, createClientAuthConfig(), defaultPostLogoutRedirectUri(), initKeycloak(), isMockAllowed(), logoutKeycloak(), resetKeycloakForRetry()

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (7): normalizeDescription(), normalizeMemberProfileIds(), normalizeProfileId(), normalizeProjectName(), normalizeSharedGroupIds(), slugifyProjectName(), uniqueProjectId()

### Community 19 - "Community 19"
Cohesion: 0.25
Nodes (7): author, dbFile, file, jsonFile, statuses, updatedProject, updatedTask

### Community 21 - "Community 21"
Cohesion: 0.5
Nodes (3): Acceptance criteria, Hermes Agora V0 Implementation Plan, MVP boundary

## Knowledge Gaps
- **76 isolated node(s):** `file`, `statuses`, `author`, `updatedProject`, `updatedTask` (+71 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SQLiteMessageStore` connect `Community 8` to `Community 0`, `Community 2`, `Community 3`, `Community 13`, `Community 14`, `Community 15`, `Community 17`, `Community 19`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `AgoraMessage` connect `Community 1` to `Community 0`, `Community 2`, `Community 5`, `Community 6`, `Community 7`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `AgoraGroup` connect `Community 1` to `Community 0`, `Community 2`, `Community 5`, `Community 6`, `Community 7`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **What connects `file`, `statuses`, `author` to the rest of the system?**
  _76 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._