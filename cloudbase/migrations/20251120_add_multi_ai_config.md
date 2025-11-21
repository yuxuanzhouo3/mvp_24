# CloudBase Migration: Add Multi-AI Configuration Support

## Overview
This migration adds support for locking AI configuration in multi-AI sessions. Once a user starts a multi-AI session, the AI configuration cannot be changed without creating a new session.

## Changes

### 1. Add `multi_ai_config` field to `ai_conversations` collection

**Collection**: `ai_conversations`

**New Field**: `multi_ai_config` (Object)

**Structure**:
```json
{
  "isMultiAI": true,
  "selectedAgentIds": ["agent-id-1", "agent-id-2"],
  "collaborationMode": "parallel",
  "lockedAt": "2024-11-20T10:00:00Z",
  "lockedBy": "user_id_123"
}
```

**Field Descriptions**:
- `isMultiAI` (boolean): Whether this session is configured for multi-AI mode
- `selectedAgentIds` (string[]): Array of locked AI agent IDs for this session
- `collaborationMode` (string): The collaboration mode ("parallel", "sequential", "debate", or "synthesis")
- `lockedAt` (string, ISO8601): Timestamp when the configuration was locked
- `lockedBy` (string): User ID who created/locked the configuration

### 2. Create Composite Index

**Collection**: `ai_conversations`

**Index Name**: `user_id_multi_ai_config`

**Index Fields**:
- `user_id` (Ascending)
- `multi_ai_config.isMultiAI` (Ascending)

**Purpose**: Efficient querying of multi-AI sessions by user

## Implementation Steps

### Step 1: Manual Data Migration (if needed)

If you have existing multi-AI sessions stored with `isMultiAI` flag in messages, you can optionally backfill the `multi_ai_config` field:

```javascript
// Example: CloudBase Console or function
const cloudbase = require("@cloudbase/node-sdk").init({...});
const db = cloudbase.database();

db.collection("ai_conversations")
  .where({
    "messages": db.command.elemMatch({
      "isMultiAI": true
    })
  })
  .get()
  .then(res => {
    res.data.forEach(session => {
      // Extract agent IDs from messages
      const agentIds = new Set();
      session.messages.forEach(msg => {
        if (msg.isMultiAI && Array.isArray(msg.content)) {
          msg.content.forEach(r => {
            if (r.agentId) agentIds.add(r.agentId);
          });
        }
      });

      // Update with multi_ai_config
      if (agentIds.size > 0) {
        db.collection("ai_conversations")
          .doc(session._id)
          .update({
            multi_ai_config: {
              isMultiAI: true,
              selectedAgentIds: Array.from(agentIds),
              collaborationMode: "parallel",
              lockedAt: session.created_at,
              lockedBy: session.user_id
            }
          });
      }
    });
  });
```

### Step 2: Create Index via CloudBase Console

1. Go to CloudBase Console → Collections → `ai_conversations`
2. Click on "Indexes" tab
3. Add composite index:
   - Field 1: `user_id` (Ascending)
   - Field 2: `multi_ai_config.isMultiAI` (Ascending)
4. Save

Alternatively, via CloudBase SDK:
```javascript
const cloudbase = require("@cloudbase/node-sdk").init({...});
const db = cloudbase.database();

// Note: Index creation via SDK varies, check CloudBase documentation
// Index creation is typically done via console or CloudBase admin tools
```

### Step 3: Code Deployment

Deploy the following updated files:
- `lib/cloudbase-db.ts` - Updated `createGptSession()` and `getGptMessages()`
- `app/api/chat/sessions/route.ts` - Support multi_ai_config in session creation
- `app/api/chat/send/route.ts` - Validate multi_ai_config and filter messages
- `components/gpt-workspace.tsx` - Pass multi-AI config to session creation
- `components/chat-toolbar.tsx` - Lock AI selection after session creation

## Backend Logic Changes

### Session Creation (`createGptSession`)
- Accepts `multiAiConfig` parameter
- Stores it in the `ai_conversations` document when creating a multi-AI session

### Message Retrieval (`getGptMessages`)
- Accepts optional `agentId` parameter
- Filters multi-AI messages to only return responses matching the requested `agentId`
- Single-AI and user messages are always returned

### Chat API (`/api/chat/send`)
- Validates `agentId` against session's `multi_ai_config.selectedAgentIds`
- Returns 409 Conflict if agent ID doesn't match session configuration
- Filters historical messages to only include:
  - User messages
  - Single-AI assistant messages
  - Multi-AI messages from the same `agentId`

## Frontend Logic Changes

### Workspace Component
- Creates session with `isMultiAI` flag when multiple AIs selected
- Stores `sessionConfig` in local state
- Passes `agentId` when calling `/api/chat/send`

### Toolbar Component
- Locks AI selection when `sessionConfig.isMultiAI` is true
- Displays lock icon and prevents modification
- Shows message: "要修改AI配置，请创建新会话"

## Verification Checklist

- [ ] Supabase migration runs successfully
- [ ] New `multi_ai_config` column created on `gpt_sessions`
- [ ] CloudBase collection field structure verified manually
- [ ] Index created in CloudBase
- [ ] Session creation with multiple AIs stores `multi_ai_config`
- [ ] Message filtering works correctly (test with multiple agents)
- [ ] API returns 409 when agentId doesn't match session config
- [ ] Frontend locks AI selection after multi-AI session creation
- [ ] Clearing session and creating new one allows AI selection again

## Testing Scenarios

### Scenario 1: Create Multi-AI Session
1. Select 2+ AIs
2. Send a message → Session created with `multi_ai_config`
3. Verify AI selection button is locked
4. Try to change AIs → Button disabled, no action

### Scenario 2: Single-AI Session
1. Select 1 AI
2. Send message → Session created without `multi_ai_config` (or `isMultiAI: false`)
3. AI selection button remains enabled
4. Can change AI and session still works

### Scenario 3: Create New Session
1. Click "New Session" or clear chat
2. AI selection unlocked
3. Can select different AIs
4. Start new multi-AI session

### Scenario 4: Message Context Isolation
1. Start multi-AI session with AI1, AI2, AI3
2. Send Message A → All AIs respond
3. Send Message B
4. Verify AI1 only sees: [System] [UserMsg A] [AI1's response to A] [UserMsg B]
5. Verify AI2 only sees: [System] [UserMsg A] [AI2's response to A] [UserMsg B]
6. AI responses from other agents are NOT in context

## Rollback Plan

If issues arise:

1. **Supabase**: Drop the column and index (can be done via migration)
   ```sql
   ALTER TABLE gpt_sessions DROP COLUMN IF EXISTS multi_ai_config;
   DROP INDEX IF EXISTS idx_gpt_sessions_multi_ai_config;
   DROP INDEX IF EXISTS idx_gpt_sessions_is_multi_ai;
   ```

2. **CloudBase**: Remove the field from documents manually or revert to previous schema version

3. **Code**: Revert commits to previous version before changes

## Notes

- This change is backward compatible - old sessions without `multi_ai_config` still work
- The filtering logic gracefully handles missing fields
- Both Supabase and CloudBase implementations follow the same logic for consistency
