# AntiGPT Mobile — Security Audit Report (Re-Audit)

**Target:** `/Users/sam/Documents/Projects/Nova-app`  
**Review Date:** 2026-11-20  
**Skill:** Cloudflare `security-audit` (Verification & Re-Audit Mode)  
**Profile:** Standard — full source-grounded review across transport, credential storage, database persistence, state management, UI rendering, and Android build configuration.

---

## Executive Summary

Following the initial audit, the codebase underwent targeted remediation. Every previously reported security vulnerability, logic inconsistency, and implementation flaw was reviewed against the updated source files.

**Re-Audit Verdict: ALL PREVIOUS FINDINGS RESOLVED & RECTIFIED.**

- **0 Critical Vulnerabilities**
- **0 High Vulnerabilities**
- **0 Medium Vulnerabilities**
- **0 Open Regressions / Code Inconsistencies**
- **TypeScript Typecheck:** Clean (0 errors across all files)
- **Expo Prebuild Config:** Clean (0 plugin configuration errors)

The application now maintains a hardened, consistent, production-ready security posture adhering strictly to `AGENTS.md` and Android security best practices.

---

## Verification of Previous Findings

### 1. Cleartext HTTP Override in Debug Manifests (Previously Medium)
* **Previous Issue:** `android/app/src/debug/AndroidManifest.xml` and `debugOptimized` unconditionally set `android:usesCleartextTraffic="true"`, allowing unencrypted token transmission during development.
* **Remediation Verified:**
  - The static `android/` directory was removed from source control in favor of the clean Expo managed workflow.
  - `plugins/with-device-only-backup.js` was enhanced with a `withDangerousMod` step that inspects any generated debug manifests and programmatically strips `android:usesCleartextTraffic="true"` and `tools:replace="android:usesCleartextTraffic"`.
* **Status:** **RESOLVED**

---

### 2. `network-security-config` Not Referenced in Committed Manifest (Previously Medium)
* **Previous Issue:** Stale committed `AndroidManifest.xml` lacked `android:networkSecurityConfig="@xml/antigpt_network_security"`.
* **Remediation Verified:**
  - Removal of the committed `android/` folder ensures native manifests are deterministically generated via `plugins/with-device-only-backup.js`.
  - The plugin automatically binds `application.$["android:networkSecurityConfig"] = "@xml/antigpt_network_security"` and creates `antigpt_network_security.xml`, strictly restricting cleartext traffic to `localhost`, `127.0.0.1`, and `10.0.2.2`.
* **Status:** **RESOLVED**

---

### 3. Hard Requirement on `[DONE]` Sentinel Breaking Clean EOF (Previously Low / Logic)
* **Previous Issue:** If an OpenAI-compatible gateway (e.g. Ollama, llama.cpp) closed the HTTP response body after sending `finish_reason: "stop"` without emitting `data: [DONE]`, `client.ts` threw a stream error and permanently marked the message as `failed`.
* **Remediation Verified:**
  - `parseCompletionChunk()` now inspects `choice.finish_reason != null`.
  - `streamCompletion()` tracks `receivedFinishReason`. When either `receivedDone` or `receivedFinishReason` is true, the stream terminates successfully and saves the completed response to SQLite.
* **Status:** **RESOLVED**

---

### 4. `DOMException` Undefined in Hermes Runtime (Previously Low)
* **Previous Issue:** `throw new DOMException("Aborted", "AbortError")` in Hermes could throw a `ReferenceError` instead of handling the abort gracefully.
* **Remediation Verified:**
  - `client.ts` line 178 now throws standard `new Error("Request aborted.")`.
  - `ChatProvider.tsx` checks `controller.signal.aborted` directly to classify cancellation, completely avoiding runtime dependency on `DOMException`.
* **Status:** **RESOLVED**

---

### 5. LAN / Wi-Fi IP Addresses Blocked (Previously Operational / Usability)
* **Previous Issue:** HTTP connections to LAN IPs (e.g. `192.168.x.x`) were blocked.
* **Remediation Verified:**
  - Documented as an explicit, deliberate security policy in `README.md`.
  - Cleartext HTTP is intentionally limited strictly to loopback (`localhost`, `127.0.0.1`, `10.0.2.2`) to prevent accidental transmission of bearer tokens over unencrypted local networks. Remote access requires HTTPS.
* **Status:** **POLICY CONFIRMED & DOCUMENTED**

---

### 6. `/v1` Suffix Rejected Instead of Normalized (Previously Operational)
* **Previous Issue:** Entering a base URL with `/v1` threw a validation error.
* **Remediation Verified:**
  - `validateBaseUrl()` in `src/gateway/client.ts` now normalizes the pathname:
    ```ts
    let path = url.pathname.replace(/\/+$/, "");
    if (path.endsWith("/v1")) path = path.slice(0, -3);
    url.pathname = `${path || ""}/`;
    return new URL("v1/chat/completions", url).toString();
    ```
  - Base URLs with or without `/v1`, trailing slashes, or subpaths (e.g. `/proxy/v1`) resolve correctly to `/v1/chat/completions`.
* **Status:** **RESOLVED**

---

### 7. Old Token Silently Forwarded After Gateway URL Change (Previously Low / Logic)
* **Previous Issue:** Changing the base URL kept the previous gateway's token in SecureStore without clearing it.
* **Remediation Verified:**
  - `gatewayOrigin()` was added to `client.ts` to extract the origin.
  - In `ChatProvider.tsx`, `saveSettings()` checks whether `gatewayOrigin(settings.baseUrl) !== gatewayOrigin(nextSettings.baseUrl)`. If the origin changed and no replacement token was provided, it automatically wipes the old token from SecureStore.
  - In `app/settings.tsx`, the UI informs the user when a host change will clear the saved token.
  - Added token validation preventing whitespace/header injection in `client.ts` and `settings.tsx`.
* **Status:** **RESOLVED**

---

### 8. Markdown Paragraph Split on Every Line (Previously Logic / Rendering)
* **Previous Issue:** `flushParagraph()` was called unconditionally on every non-blank line in `MarkdownMessage.tsx`, fragmenting multi-line assistant responses into separate single-line blocks with bottom margins.
* **Remediation Verified:**
  - `flushParagraph()` is now invoked strictly before block-level elements (`heading`, `list`, `quote`).
  - Consecutive text lines accumulate into one paragraph and wrap naturally.
  - Numbered lists are also parsed into ordered numerals rather than decorative bullets.
* **Status:** **RESOLVED**

---

### 9. Debug Keystore in Source Control (Previously Informational)
* **Previous Issue:** `debug.keystore` was present in the committed `android/` directory.
* **Remediation Verified:**
  - The static `android/` directory was deleted. Build configuration was migrated to `eas.json` for managed credential signing.
* **Status:** **RESOLVED**

---

### 10. `SYSTEM_ALERT_WINDOW` in Production Manifest (Previously Informational)
* **Previous Issue:** `android.permission.SYSTEM_ALERT_WINDOW` was declared in the production manifest.
* **Remediation Verified:**
  - `plugins/with-device-only-backup.js` filters out `SYSTEM_ALERT_WINDOW` from `uses-permission` in the production manifest.
* **Status:** **RESOLVED**

---

## Additional Improvements & Checks

1. **Streaming Render Performance:**
   - In `ChatProvider.tsx`, UI updates during streaming are throttled to ~30 FPS (`now - lastUiUpdateAt >= 33ms`), while persistence remains buffered at 500ms intervals. This prevents UI thread starvation during high-throughput token bursts.
2. **Android Backup Protection:**
   - `app.json` explicitly configures `expo-secure-store` with `"configureAndroidBackup": false`.
   - Backup rules (`antigpt_backup_rules.xml` and `antigpt_data_extraction_rules.xml`) exclude all root, database, shared preferences, and cache directories from cloud and device-to-device transfers.
3. **Accessibility & Touch Targets:**
   - Interactive elements across `ChatScreen.tsx`, `HistoryScreen.tsx`, and `SettingsScreen.tsx` enforce accessible minimum touch target bounds (`minHeight: 44` / `minHeight: 48`).

---

## Summary Matrix

| # | Check / Vulnerability | Original Severity | Current Status |
|:--|:----------------------|:------------------|:---------------|
| 1 | Debug cleartext override | Medium | **Fixed** |
| 2 | Network security config binding | Medium | **Fixed** |
| 3 | Stream EOF without `[DONE]` | Low | **Fixed** |
| 4 | `DOMException` Hermes crash | Low | **Fixed** |
| 5 | Cleartext LAN IP policy | Low | **Clarified / Documented** |
| 6 | `/v1` base URL normalization | Low | **Fixed** |
| 7 | Cross-origin token leakage | Low | **Fixed** |
| 8 | Markdown paragraph fragmentation | Logic | **Fixed** |
| 9 | Committed debug keystore | Informational | **Fixed** |
| 10| `SYSTEM_ALERT_WINDOW` permission | Informational | **Fixed** |
