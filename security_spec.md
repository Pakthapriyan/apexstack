# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **Strict Ownership**: Every document under `/users/{userId}` and its subcollections (`skills`, `workLogs`, `drills`, `reviewCards`, `agentSessions`, `projectMissions`, `dailyQuests`) must have `userId == request.auth.uid` and can only be read or mutated by that verified authenticated owner.
2. **Parent Existence (Master Gate)**: No subcollection record can be created or updated unless the parent `/users/{userId}` document exists and belongs to `request.auth.uid`.
3. **Temporal & Identity Immutability**: `userId` and `createdAt` are immutable after creation; `createdAt` must equal `request.time` on creation, and `updatedAt` must equal `request.time` on updates.
4. **Terminal State Locking**: Once an `IncidentDrill`, `ProjectMission`, or `DailyQuest` transitions to `status == 'completed'`, no further mutations are permitted.
5. **Volumetric & Key Bounds**: Every string has strict `.size()` caps, arrays have `.size()` and element-type guards, and `keys().hasAll` + `keys().hasOnly` + `affectedKeys().hasOnly` prevent shadow/ghost fields.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Profile Read**: Read `/users/uid_1` with `auth == null`.
2. **Cross-User Profile Hijack**: Create `/users/uid_2` as `uid_1`.
3. **Unverified Email Write**: Create `/users/uid_1` with `email_verified: false`.
4. **Shadow Field Injection on Create**: Create `/users/uid_1` with extra `isAdmin: true` field.
5. **Fake Client Timestamp**: Create `/users/uid_1/workLogs/log1` with client-forged `createdAt` instead of `request.time`.
6. **Orphaned Skill Node**: Create `/users/uid_1/skills/s1` when parent `/users/uid_1` does not exist.
7. **ID Poisoning**: Create `/users/uid_1/skills/../../admin` or 200-char invalid ID.
8. **Immutable Field Tamper**: Update `/users/uid_1/skills/s1` changing `userId` or `createdAt`.
9. **Value Poisoning on Update**: Update `/users/uid_1/skills/s1` setting `mastery: 9999` or `mastery: "high"`.
10. **Ghost Field on Update**: Update `/users/uid_1/skills/s1` adding `secretFlag: true` alongside `mastery`.
11. **Terminal Drill Reopen**: Update `/users/uid_1/drills/d1` after `status == 'completed'` to set `status: 'active'`.
12. **Unscoped List Scraping**: List `/users/uid_2/reviewCards` as `uid_1` without matching `resource.data.userId == request.auth.uid`.
