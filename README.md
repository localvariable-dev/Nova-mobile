# AntiGPT Mobile

Android-first Expo chat client for an existing OpenAI-compatible gateway. The app does not include a backend or a bundled API key.

## Run on Android

```sh
npm install
npx expo start --android
```

If Android tooling is not installed on this computer, run `npx expo start` and open the project with a compatible Expo development client on the device.

To generate and install a native Android development build on a connected device or emulator, run `npx expo run:android` from a machine with the Android SDK installed. Android network and backup rules are applied to native builds generated from this project; Expo Go does not use these project-specific manifest rules.

## Configure the gateway

Open **Settings** in the app and enter:

- The gateway base URL, with or without a trailing `/v1` suffix. Remote URLs must use HTTPS.
- The exact model ID accepted by the gateway.
- An optional bearer token if the gateway requires one.

The client sends `POST /v1/chat/completions` as an OpenAI-compatible streaming request and expects server-sent events with `data:` JSON records followed by `data: [DONE]`. Remote gateways must use HTTPS. Plain HTTP is allowed only for `localhost`, `127.0.0.1`, and Android emulator host `10.0.2.2` during development. The gateway must be reachable from the Android device. The app does not guess an endpoint, model ID, token, or gateway-specific custom authentication header.

Changing the gateway origin clears the previously saved token unless a replacement token is entered.

## Data and privacy

Conversation history and non-secret settings are stored in app-private SQLite. The optional bearer token is stored using Android secure storage. Android app backup is disabled, so local history does not move to cloud backup. Messages are sent to the configured gateway when you send them. The SQLite database does not use separate SQLCipher encryption in this MVP.
