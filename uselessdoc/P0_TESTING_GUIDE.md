# P0 Testing Guide

## Quick Verification

### 1. Build Check ✓

```bash
npm run build
# Should output: ✓ Compiled successfully
```

### 2. Dev Server Check ✓

```bash
npm run dev
# Server running at http://localhost:3000
```

---

## Test 1: Login Flow (Single Tab)

**Goal**: Verify user appears immediately after login without "not logged in" flash

**Steps**:

1. Open DevTools Console (F12)
2. Navigate to `http://localhost:3000/auth?mode=signin`
3. Enter credentials:
   - Email: `pro@example.com`
   - Password: `Test@1234`
4. Click "Sign In"
5. **Observe**:
   - Should redirect to `/` immediately
   - User should be visible in UI
   - **No "not logged in" flash**

**Console Verification**:

```javascript
// In DevTools Console, run:
const state = localStorage.getItem("app-auth-state");
if (state) {
  const parsed = JSON.parse(state);
  console.log("✅ Auth state found:");
  console.log("  - User:", parsed.user.email);
  console.log("  - Token length:", parsed.accessToken.length);
  console.log(
    "  - Token expires in:",
    parsed.tokenMeta.accessTokenExpiresIn,
    "seconds"
  );
} else {
  console.error("❌ Auth state NOT found");
}
```

**Expected Output**:

```
✅ Auth state found:
  - User: pro@example.com
  - Token length: 1234
  - Token expires in: 3600 seconds
```

---

## Test 2: Multi-Tab Logout (Multi-Tab Sync)

**Goal**: Verify that logout in one tab affects other tabs

**Steps**:

1. Complete Test 1 (logged in)
2. Keep browser window open
3. Open a new tab and navigate to `http://localhost:3000`
   - **Should show user logged in** (multi-tab read)
4. Go back to first tab
5. Click on profile icon → "Logout"
6. Switch back to second tab
7. **Observe**:
   - Second tab **should automatically update**
   - Should show "not logged in" or redirect to login
   - **No manual refresh needed**

**Console Verification** (in second tab):

```javascript
// Monitor auth state changes
const checkAuth = () => {
  const state = localStorage.getItem("app-auth-state");
  if (state) {
    const parsed = JSON.parse(state);
    console.log("✅ Tab 2 - User logged in:", parsed.user.email);
  } else {
    console.log("⚠️  Tab 2 - User logged out");
  }
};

// Check periodically
setInterval(checkAuth, 500);

// Logout in Tab 1, Tab 2 should detect change within 1 second
```

---

## Test 3: Token Validation

**Goal**: Verify token expiry information is stored correctly

**Steps**:

1. Login (follow Test 1)
2. Open DevTools Console
3. Run this code:

```javascript
const state = JSON.parse(localStorage.getItem("app-auth-state"));
const now = Date.now();
const tokenExpiresAt =
  state.savedAt + state.tokenMeta.accessTokenExpiresIn * 1000;
const expiresInMinutes = (tokenExpiresAt - now) / 1000 / 60;

console.log("Token Info:");
console.log("  - Saved at:", new Date(state.savedAt).toISOString());
console.log("  - Expires at:", new Date(tokenExpiresAt).toISOString());
console.log("  - Expires in:", Math.round(expiresInMinutes), "minutes");
console.log("  - Access Token Length:", state.accessToken.length);
console.log("  - Refresh Token Length:", state.refreshToken.length);
```

**Expected Output**:

```
Token Info:
  - Saved at: 2025-01-08T10:30:00.000Z
  - Expires at: 2025-01-08T11:30:00.000Z
  - Expires in: 60 minutes
  - Access Token Length: 1200
  - Refresh Token Length: 1200
```

---

## Test 4: Local Storage Structure

**Goal**: Verify the new atomic storage format

**Steps**:

1. Login (follow Test 1)
2. Open DevTools → Application → Storage → Local Storage
3. Look for key: `app-auth-state`
4. **Verify structure**:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "ba046a62690e1d5502a1af976b19bacc",
    "email": "pro@example.com",
    "full_name": "Test User",
    "avatar": "https://example.com/avatar.jpg",
    "subscription_status": "active",
    "subscription_plan": "pro"
  },
  "tokenMeta": {
    "accessTokenExpiresIn": 3600,
    "refreshTokenExpiresIn": 604800
  },
  "savedAt": 1720000000000
}
```

**Expected**:

- ✅ Single key `app-auth-state` (no scattered tokens)
- ✅ All data in one atomic structure
- ✅ No `auth-token`, `auth-user`, `auth-logged-in` keys (old format)

---

## Test 5: UserContext Sync Initialization

**Goal**: Verify UserContext reads state synchronously without delay

**Steps**:

1. Logout completely
2. Open DevTools Console
3. Login and watch console:

```javascript
// In DevTools, monitor user context changes
console.log("Before reload - checking auth state...");
console.log(
  localStorage.getItem("app-auth-state") ? "✅ Found" : "❌ Not found"
);

// After login, check timing
const start = performance.now();
const state = localStorage.getItem("app-auth-state");
const elapsed = performance.now() - start;
console.log(`✅ Auth state read in ${elapsed.toFixed(2)}ms (should be <1ms)`);
```

**Expected**:

- Auth state read in **< 1ms** (synchronous, no async delay)
- User appears on page before any animations
- **No loading spinner before showing user**

---

## Test 6: Page Refresh Persistence

**Goal**: Verify user stays logged in after page refresh

**Steps**:

1. Login (follow Test 1)
2. Verify user is visible
3. Refresh page (F5)
4. **Observe**:
   - User should still be visible
   - **No flashing "not logged in"**
   - Page should not redirect to login

**Console After Refresh**:

```javascript
const state = JSON.parse(localStorage.getItem("app-auth-state"));
console.log("After refresh - User:", state.user.email);
```

---

## Troubleshooting

### Issue: "Not logged in" still appears after login

**Checklist**:

```javascript
// 1. Check if saveAuthState was called
console.log(
  "Auth state in localStorage:",
  localStorage.getItem("app-auth-state")
);

// 2. Check if UserContext initialized
console.log("IsAuthInitialized should be true after mount");

// 3. Check browser console for errors
// - Look for red error messages during login
```

### Issue: Multi-tab sync not working

**Checklist**:

```javascript
// 1. Verify storage event listener exists
window.addEventListener("storage", (e) => {
  if (e.key === "app-auth-state") {
    console.log("✅ Storage event detected in tab");
  }
});

// 2. Change state in Tab A (logout)
// 3. Check if event fires in Tab B

// Note: Storage events don't fire in the same tab that made the change
```

### Issue: Token expired error after 1 hour

**Expected** (P1 fix coming):

- Currently: You need to login again after 1 hour
- Soon: /api/auth/refresh will auto-refresh token

---

## Automated Test Script

Save this as `test-auth.js` and run it in DevTools console:

```javascript
async function testAuthState() {
  console.log("🧪 Testing P0 Auth State Implementation\n");

  // Test 1: Check storage format
  const state = localStorage.getItem("app-auth-state");
  if (!state) {
    console.error("❌ FAILED: app-auth-state not found in localStorage");
    return;
  }

  const parsed = JSON.parse(state);
  console.log("✅ PASSED: app-auth-state found");
  console.log("   Structure:", Object.keys(parsed).sort().join(", "));

  // Test 2: Check required fields
  const required = [
    "accessToken",
    "refreshToken",
    "user",
    "tokenMeta",
    "savedAt",
  ];
  const missing = required.filter((f) => !(f in parsed));
  if (missing.length > 0) {
    console.error("❌ FAILED: Missing fields:", missing.join(", "));
    return;
  }
  console.log("✅ PASSED: All required fields present");

  // Test 3: Check user object
  const userRequired = ["id", "email"];
  const userMissing = userRequired.filter((f) => !(f in parsed.user));
  if (userMissing.length > 0) {
    console.error("❌ FAILED: User missing fields:", userMissing.join(", "));
    return;
  }
  console.log("✅ PASSED: User object valid");

  // Test 4: Check token expiry
  const expiresAt =
    parsed.savedAt + parsed.tokenMeta.accessTokenExpiresIn * 1000;
  if (expiresAt > Date.now()) {
    console.log("✅ PASSED: Token is valid");
    const minutesLeft = ((expiresAt - Date.now()) / 1000 / 60).toFixed(0);
    console.log(`   Expires in: ${minutesLeft} minutes`);
  } else {
    console.warn("⚠️  WARNING: Token is expired");
  }

  // Test 5: Check for old format
  const oldKeys = ["auth-token", "auth-user", "auth-logged-in"];
  const foundOld = oldKeys.filter((k) => localStorage.getItem(k) !== null);
  if (foundOld.length > 0) {
    console.warn("⚠️  WARNING: Old format keys found:", foundOld.join(", "));
  } else {
    console.log("✅ PASSED: No old format keys found");
  }

  console.log("\n✨ All tests passed!");
}

testAuthState();
```

---

## Success Criteria

### The Bug is Fixed When:

- [ ] Login completes without "not logged in" flash
- [ ] User visible immediately on home page
- [ ] localStorage has single `app-auth-state` key
- [ ] Token info shows correct expiry
- [ ] Multi-tab logout works (no manual refresh needed)
- [ ] Page refresh keeps user logged in
- [ ] Multiple logins work without errors
- [ ] Logout clears all auth state

### Test Results Template

```markdown
| Test              | Status  | Notes                        |
| ----------------- | ------- | ---------------------------- |
| Login Flow        | ✅ PASS | No flash, user immediate     |
| Multi-Tab Sync    | ✅ PASS | Logout detected in other tab |
| Token Validation  | ✅ PASS | Expiry 1 hour from login     |
| Storage Structure | ✅ PASS | Single atomic key            |
| UserContext Sync  | ✅ PASS | <1ms read time               |
| Page Refresh      | ✅ PASS | User persists                |
```

---

## Need Help?

If tests fail, check:

1. Dev server is running: `npm run dev`
2. Build is successful: `npm run build`
3. No console errors (F12)
4. Using correct test credentials
5. localStorage not cleared between tests
