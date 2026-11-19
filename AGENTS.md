# AntiGPT Mobile --- Codex Instructions

## Mission

Build a polished, lightweight Android AI chat app that connects directly
to the user's **existing** OpenAI-compatible API gateway for Qwen 3.5
2B.

Prioritize **fast delivery and a working app** over elaborate
architecture. Deliver a usable MVP first. Do not expand scope without
asking.

## Product scope (MVP)

-   Android-first mobile application.
-   Premium, minimal dark interface inspired by modern AI chat apps.
-   Connect to an existing OpenAI-compatible API gateway.
-   Send messages and display streamed assistant responses.
-   Start new conversations.
-   Persist conversation history locally.
-   Render basic Markdown and code blocks.
-   Basic settings for API base URL, model ID, and generation
    parameters.
-   Handle loading, empty, offline, and API error states.

Do not build in v1: - Voice input/output - Image uploads - Web search -
n8n or Daytona integrations - Multi-provider/model marketplace - Cloud
sync or account system unless the existing gateway requires
authentication - Push notifications - Analytics, subscriptions, or
payments

## Preferred stack

-   React Native with Expo
-   TypeScript
-   Expo Router
-   `expo-sqlite` for local conversation storage
-   `expo-secure-store` for credentials/tokens
-   Zustand only if shared state becomes cumbersome; prefer simple React
    state initially
-   `fetch` or a small compatible streaming client for API requests
-   Use Expo-compatible libraries and verify SDK compatibility before
    adding dependencies

Use the existing repository conventions if a project already exists. Do
not replace working infrastructure or rewrite unrelated code.

## API integration

The gateway already exists. **Do not create a new backend or gateway.**

Configure the app to call the supplied gateway base URL and its
OpenAI-compatible endpoints: - `GET /v1/models` where available -
`POST /v1/chat/completions`

Example request:

``` json
{
  "model": "MODEL_ID",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 1024
}
```

Important: - Confirm the actual base URL, model ID, authentication
method, and streaming format from the user or existing project
configuration. Do not guess. - Keep secrets out of source code, Git,
logs, and the APK. - Never hardcode a permanent server-side API key in
the mobile app. - If the gateway requires a user token, store it using
SecureStore. - Do not expose the llama.cpp inference port directly to
the public internet. - Support cancellation where practical, and show a
clear error if streaming disconnects.

## UI direction

-   Dark-first, premium, restrained design.
-   Near-black background, subtle elevated surfaces, readable
    typography, one restrained accent color.
-   Comfortable spacing, rounded but not excessively pill-shaped
    controls.
-   Chat screen should be the priority: clear messages, composer
    anchored above keyboard, send/stop control, and visible generation
    state.
-   Include a simple conversation list/history and a compact settings
    screen.
-   Avoid decorative gradients, excessive animation, clutter, and
    oversized empty-state artwork.
-   Ensure keyboard handling and safe areas work on Android.

## Delivery approach

Work in small, direct implementation steps: 1. Inspect the repository
and existing setup before changing files. 2. Create or complete the Expo
app using the current stable compatible setup. 3. Build the chat UI with
a small amount of realistic placeholder content. 4. Connect the existing
gateway and implement streaming. 5. Add local conversation persistence.
6. Add minimal settings and error handling. 7. Run only essential smoke
checks and fix blocking issues. 8. Provide the exact command to launch
on an Android device and, if requested, build an APK.

## Testing policy --- keep it lean

Do not spend time creating a large automated test suite, elaborate
mocks, CI pipelines, benchmarks, or broad test coverage for this MVP.

Only perform essential checks: - App starts without a build/runtime
blocker. - A message reaches the configured gateway. - A streamed
response renders correctly. - A conversation remains after app
restart. - Missing network / API errors show a usable message.

Prefer a quick real-device smoke test over extensive test
infrastructure. Do not add tests unless they catch a concrete high-risk
issue or the user asks.

## Engineering rules

-   Favor the simplest maintainable implementation.
-   Avoid unnecessary abstractions, factories, dependency injection
    frameworks, and premature optimization.
-   Keep dependencies minimal.
-   Do not add features beyond the MVP.
-   Do not change VPS, Cloudflare, gateway, DNS, firewall, or production
    configuration unless explicitly requested.
-   Never invent credentials, endpoints, or model identifiers.
-   Explain any required user-provided configuration clearly.
-   Preserve existing user changes; inspect before overwriting files.
-   If blocked by a missing value, ask one concise question rather than
    guessing.
-   After each meaningful milestone, summarize what changed and give the
    next command/action.

## Definition of done

The MVP is done when the user can install/open the Android app,
configure or securely authenticate to the existing gateway, send a
prompt to Qwen, see the response stream into the chat, and return to
previous locally saved conversations.

**Optimize for a fast, working Android MVP---not an over-engineered
production platform.**
