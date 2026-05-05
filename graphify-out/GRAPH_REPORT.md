# Graph Report - .  (2026-05-05)

## Corpus Check
- 23 files · ~10,355 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 90 nodes · 140 edges · 18 communities detected
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

## God Nodes (most connected - your core abstractions)
1. `JsonMessageStore` - 15 edges
2. `normalizeGroupId()` - 8 edges
3. `verifyKeycloakToken()` - 5 edges
4. `normalizeChannel()` - 4 edges
5. `normalizeGroupName()` - 4 edges
6. `normalizeMemberProfileIds()` - 4 edges
7. `authenticateAgentToken()` - 4 edges
8. `authenticateToken()` - 4 edges
9. `isGroupMember()` - 4 edges
10. `slugifyGroupName()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.38
Nodes (10): authenticateAgentToken(), authenticateToken(), bearerToken(), canAccessChannel(), hasRequiredAudience(), hasRole(), requireIdentity(), requireScope() (+2 more)

### Community 1 - "Community 1"
Cohesion: 0.29
Nodes (6): loadServerConfig(), parseProfiles(), attachAgoraSocket(), canSeeGroup(), groupRoom(), visibleGroupsFor()

### Community 2 - "Community 2"
Cohesion: 0.18
Nodes (0):

### Community 3 - "Community 3"
Cohesion: 0.31
Nodes (1): JsonMessageStore

### Community 4 - "Community 4"
Cohesion: 0.2
Nodes (0):

### Community 5 - "Community 5"
Cohesion: 0.44
Nodes (6): normalizeChannel(), normalizeGroupName(), normalizeMemberProfileIds(), parseProfilePresence(), slugifyGroupName(), uniqueGroupId()

### Community 6 - "Community 6"
Cohesion: 0.5
Nodes (6): canManageGroups(), createAgoraApp(), groupAccessStatus(), isGroupMember(), parseMemberProfileIds(), requireGroupAccess()

### Community 7 - "Community 7"
Cohesion: 0.4
Nodes (0):

### Community 8 - "Community 8"
Cohesion: 0.67
Nodes (1): normalizeGroupId()

### Community 9 - "Community 9"
Cohesion: 1.0
Nodes (0):

### Community 10 - "Community 10"
Cohesion: 1.0
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

## Knowledge Gaps
- **Thin community `Community 9`** (2 nodes): `connect()`, `socket.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 10`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (1 nodes): `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (1 nodes): `types.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (1 nodes): `store.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (1 nodes): `config.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (1 nodes): `api.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `JsonMessageStore` connect `Community 3` to `Community 8`, `Community 5`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `normalizeGroupId()` connect `Community 8` to `Community 3`, `Community 5`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `normalizeChannel()` connect `Community 5` to `Community 3`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._