# Graph Report - hermes-agora  (2026-05-14)

## Corpus Check
- 41 files · ~29,634 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 437 nodes · 981 edges · 21 communities (19 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3808656a`
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
- [[_COMMUNITY_Community 17|Community 17]]

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
- `normalizeAssignees()` --calls--> `normalizeMemberProfileIds()`  [EXTRACTED]
  src/server/store.ts → src/server/store.ts  _Bridges community 0 → community 1_
- `buildJsonHeaders()` --calls--> `buildAuthHeaders()`  [EXTRACTED]
  src/client/api.ts → src/client/api.ts  _Bridges community 12 → community 9_

## Communities (21 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (49): assignableProjectProfileIds(), CreateGroupInput, CreateMessageInput, CreateProjectInput, CreateTaskDocumentInput, CreateTaskInput, fromJson(), GroupRow (+41 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (9): normalizeChannel(), normalizeGroupId(), normalizeGroupName(), normalizeMemberProfileIds(), normalizeSharedGroupIds(), slugifyGroupName(), SQLiteMessageStore, toJson() (+1 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (30): loadServerConfig(), parseProfiles(), AgoraEvents, createAgoraApp(), defaultProfiles, deriveLegacyJsonDataFile(), deriveSqliteDataFile(), loadServerConfig() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (24): AgoraListenerClient, AgoraTaskListener, AgoraTaskListenerOptions, blockedText(), BootstrapMode, buildHermesPrompt(), extractTaskId(), isActionableTaskForProfile() (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (29): buildAuthHeaders(), buildJsonHeaders(), buildSocketAuth(), createGroup(), deleteGroup(), fetchGroupMessages(), fetchGroups(), fetchIdentity() (+21 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (9): JsonMessageStore, normalizeProjectId(), author, dbFile, file, jsonFile, statuses, updatedProject (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (24): buildGroupMessageMetadata(), canManageGroups(), createAgoraApp(), groupAccessStatus(), isGroupMember(), parseMemberProfileIds(), requireGroupAccess(), buildGroupMessageMetadata() (+16 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (6): App(), composerPlaceholder(), KANBAN_COLUMNS, ProjectPanel, View, ProfileStatus

### Community 8 - "Community 8"
Cohesion: 0.19
Nodes (22): authenticateAgentToken(), authenticateToken(), bearerToken(), canAccessChannel(), hasRequiredAudience(), hasRole(), requireIdentity(), requireScope() (+14 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (18): appendTaskDocument(), buildJsonHeaders(), createGroup(), createProject(), createProjectTask(), deleteProject(), postGroupMessage(), postMessage() (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (11): createHermesCliRunner(), runProcess(), stripCliNoise(), clampNumber(), main(), readArgs(), readListenerConfig(), FileListenerStateStore (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (18): Agora listener, API de agentes, code:bash (npm install), code:bash (npm run dev:web), code:bash (npm test), code:bash (export HERMES_AGORA_URL=https://agora.etharlia.com), code:json ({), code:bash (HERMES_AGORA_URL=https://agora.etharlia.com \) (+10 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (12): buildAuthHeaders(), buildSocketAuth(), deleteGroup(), fetchGroupMessages(), fetchGroups(), fetchIdentity(), fetchMessages(), fetchProfileStatuses() (+4 more)

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (3): Acceptance criteria, Hermes Agora V0 Implementation Plan, MVP boundary

## Knowledge Gaps
- **63 isolated node(s):** `file`, `statuses`, `author`, `updatedProject`, `updatedTask` (+58 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SQLiteMessageStore` connect `Community 1` to `Community 0`, `Community 2`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Why does `AgoraMessage` connect `Community 4` to `Community 0`, `Community 3`, `Community 6`, `Community 7`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `AgoraGroup` connect `Community 4` to `Community 0`, `Community 3`, `Community 6`, `Community 7`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **What connects `file`, `statuses`, `author` to the rest of the system?**
  _63 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._