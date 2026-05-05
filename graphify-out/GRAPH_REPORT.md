# Graph Report - .  (2026-05-05)

## Corpus Check
- 36 files · ~15,550 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 144 nodes · 227 edges · 20 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `JsonMessageStore` - 15 edges
2. `HttpAgoraClient` - 8 edges
3. `normalizeGroupId()` - 8 edges
4. `AgoraTaskListener` - 6 edges
5. `FakeAgoraClient` - 6 edges
6. `FileListenerStateStore` - 5 edges
7. `readListenerConfig()` - 5 edges
8. `verifyKeycloakToken()` - 5 edges
9. `normalizeState()` - 4 edges
10. `normalizeChannel()` - 4 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.21
Nodes (8): JsonMessageStore, normalizeChannel(), normalizeGroupId(), normalizeGroupName(), normalizeMemberProfileIds(), parseProfilePresence(), slugifyGroupName(), uniqueGroupId()

### Community 1 - "Community 1"
Cohesion: 0.19
Nodes (12): canManageGroups(), createAgoraApp(), groupAccessStatus(), isGroupMember(), parseMemberProfileIds(), requireGroupAccess(), loadServerConfig(), parseProfiles() (+4 more)

### Community 2 - "Community 2"
Cohesion: 0.23
Nodes (3): HttpAgoraClient, safeErrorDetail(), redactSensitive()

### Community 3 - "Community 3"
Cohesion: 0.35
Nodes (6): AgoraTaskListener, blockedText(), buildHermesPrompt(), extractTaskId(), isActionableTaskForProfile(), sanitizeAgentOutput()

### Community 4 - "Community 4"
Cohesion: 0.38
Nodes (10): authenticateAgentToken(), authenticateToken(), bearerToken(), canAccessChannel(), hasRequiredAudience(), hasRole(), requireIdentity(), requireScope() (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.33
Nodes (7): createHermesCliRunner(), runProcess(), stripCliNoise(), clampNumber(), main(), readArgs(), readListenerConfig()

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (0):

### Community 7 - "Community 7"
Cohesion: 0.2
Nodes (0):

### Community 8 - "Community 8"
Cohesion: 0.36
Nodes (4): FileListenerStateStore, getGroupState(), normalizeState(), rememberProcessed()

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (1): FakeAgoraClient

### Community 10 - "Community 10"
Cohesion: 0.4
Nodes (0):

### Community 11 - "Community 11"
Cohesion: 1.0
Nodes (0):

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (0):

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (0):

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (0):

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0):

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (0):

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0):

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (0):

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0):

## Knowledge Gaps
- **Thin community `Community 11`** (2 nodes): `connect()`, `socket.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (1 nodes): `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (1 nodes): `types.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (1 nodes): `store.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (1 nodes): `config.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (1 nodes): `api.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Not enough signal to generate questions. This usually means the corpus has no AMBIGUOUS edges, no bridge nodes, no INFERRED relationships, and all communities are tightly cohesive. Add more files or run with --mode deep to extract richer edges._
