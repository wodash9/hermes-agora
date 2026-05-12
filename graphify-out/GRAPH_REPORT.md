# Graph Report - hermes-agora  (2026-05-12)

## Corpus Check
- 41 files · ~27,788 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 427 nodes · 948 edges · 20 communities (18 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `00d11110`
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
- [[_COMMUNITY_Community 16|Community 16]]

## God Nodes (most connected - your core abstractions)
1. `SQLiteMessageStore` - 46 edges
2. `JsonMessageStore` - 31 edges
3. `normalizeGroupId()` - 16 edges
4. `JsonMessageStore` - 15 edges
5. `normalizeProjectId()` - 14 edges
6. `buildAuthHeaders()` - 14 edges
7. `normalizeMemberProfileIds()` - 11 edges
8. `buildJsonHeaders()` - 11 edges
9. `normalizeDescription()` - 10 edges
10. `loadServerConfig()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `buildJsonHeaders()` --calls--> `buildAuthHeaders()`  [EXTRACTED]
  src/client/api.ts → src/client/api.ts  _Bridges community 5 → community 8_

## Communities (20 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (27): fromJson(), JsonMessageStore, nextTaskOrder(), normalizeAssignees(), normalizeChannel(), normalizeDescription(), normalizeGroupId(), normalizeGroupName() (+19 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (40): buildGroupMessageMetadata(), canManageGroups(), createAgoraApp(), groupAccessStatus(), isGroupMember(), parseMemberProfileIds(), requireGroupAccess(), authenticateAgentToken() (+32 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (31): loadServerConfig(), parseProfiles(), AgoraEvents, createAgoraApp(), defaultProfiles, deriveLegacyJsonDataFile(), deriveSqliteDataFile(), loadServerConfig() (+23 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (37): CreateGroupInput, CreateMessageInput, CreateProjectInput, CreateTaskDocumentInput, CreateTaskInput, GroupRow, ListMessagesInput, MessageRow (+29 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (26): AgoraListenerClient, AgoraTaskListener, AgoraTaskListenerOptions, blockedText(), BootstrapMode, buildHermesPrompt(), extractTaskId(), isActionableTaskForProfile() (+18 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (27): buildAuthHeaders(), buildJsonHeaders(), buildSocketAuth(), createGroup(), deleteGroup(), fetchGroupMessages(), fetchGroups(), fetchIdentity() (+19 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (4): App(), composerPlaceholder(), KANBAN_COLUMNS, View

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (11): createHermesCliRunner(), runProcess(), stripCliNoise(), clampNumber(), main(), readArgs(), readListenerConfig(), FileListenerStateStore (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (17): appendTaskDocument(), buildJsonHeaders(), createGroup(), createProject(), createProjectTask(), postGroupMessage(), postMessage(), updateGroup() (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (7): JsonMessageStore, normalizeChannel(), normalizeGroupId(), normalizeGroupName(), normalizeMemberProfileIds(), slugifyGroupName(), uniqueGroupId()

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (18): Agora listener, API de agentes, code:bash (npm install), code:bash (npm run dev:web), code:bash (npm test), code:bash (export HERMES_AGORA_URL=https://agora.etharlia.com), code:json ({), code:bash (HERMES_AGORA_URL=https://agora.etharlia.com \) (+10 more)

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (7): author, dbFile, file, jsonFile, statuses, updatedProject, updatedTask

### Community 16 - "Community 16"
Cohesion: 0.5
Nodes (3): Acceptance criteria, Hermes Agora V0 Implementation Plan, MVP boundary

## Knowledge Gaps
- **62 isolated node(s):** `file`, `statuses`, `author`, `updatedProject`, `updatedTask` (+57 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SQLiteMessageStore` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 13`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `AgoraMessage` connect `Community 4` to `Community 1`, `Community 3`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `AgoraGroup` connect `Community 4` to `Community 1`, `Community 3`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **What connects `file`, `statuses`, `author` to the rest of the system?**
  _62 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._