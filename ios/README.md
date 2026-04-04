# Together — SwiftUI + Firebase (iOS)

Native iOS client for the couples “shared mood room” app: **Firebase Auth** (email/password), **Firestore** for rooms/moods/minigames, **Firebase Cloud Messaging** for push when a partner updates their mood or replies to a note (via **Cloud Functions** in `/firebase`).

Your Firebase iOS config already uses **bundle ID `cz-app`** and project **`cz-app-62772`** — this target matches that plist.

## 1. Requirements

- macOS with **Xcode 15+** (iOS 17 deployment)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
- CocoaPods **not** required — dependencies come from the Swift Package **firebase-ios-sdk**

## 2. Generate the Xcode project

```bash
cd ios
xcodegen generate
open Together.xcodeproj
```

If `GoogleService-Info.plist` is missing from `Together/`, copy the one from the Firebase console (or from the repo root) into `Together/`.

## 3. Apple Push Notifications (APNs) + FCM

1. In **Apple Developer** → Identifiers → your App ID (`cz-app`) → enable **Push Notifications**.
2. Create an **APNs Authentication Key** (.p8) and note the **Key ID** and **Team ID**.
3. In **Firebase Console** → Project settings → **Cloud Messaging** → **Apple app configuration** → upload the APNs key.
4. In Xcode → **Signing & Capabilities** → add **Push Notifications** (the project already includes `Together.entitlements` with `aps-environment` for **development**; use **Release**/TestFlight with **production** when you ship).

The app registers for remote notifications in `AppDelegate`, forwards the APNs token to Firebase Messaging, and stores the **FCM registration token** on `users/{uid}.fcmToken` for the Cloud Function to target the partner.

## 4. Firestore data model used by the iOS app

- `users/{uid}`
  - `email`
  - `createdAt`
  - `fcmToken`
- `inviteLookup/{code}`
  - `roomId`
- `rooms/{roomId}`
  - `inviteCode`
  - `createdBy`
  - `members`
  - `createdAt`
  - `gameType`
  - `gameStatus`
  - `gameTurnUserId`
  - `gameWinnerUserId`
  - `gameUpdatedAt`
  - `gameState`
- `rooms/{roomId}/moods/{userId}`
  - `moodKey`
  - `label`
  - `emoji`
  - `updatedAt`
  - `note`
  - `messageId`
  - `replyNote`
  - `replyFromUserId`
  - `replyAt`

## 5. Deploy Firestore rules + Cloud Functions

From the repo’s **`firebase/`** directory (requires [Firebase CLI](https://firebase.google.com/docs/cli) and a logged-in account with access to the project):

```bash
cd firebase
npm install --prefix functions
npm run build --prefix functions
firebase deploy --only firestore:rules,functions
```

- **Rules** enforce: max two room members (via the `1 → 2` join update only), moods writable only when two members exist, invite lookup creatable only by the room creator.
- **`notifyPartnerMood`** sends an FCM data+notification message to the other member’s stored token when a mood document is written.

Pick a Functions region close to your users by editing `region` in `firebase/functions/src/index.ts` if `us-central1` is not ideal.

## 6. Firebase Console checklist

- **Authentication** → enable **Email/Password**
- **Firestore** → create database in production (or test) mode, then deploy rules above
- **Cloud Messaging** — APNs key linked (step 3)

## 7. Run on device

Push notifications **do not arrive in the Simulator** for full APNs testing; use a physical iPhone with a development provisioning profile.

## 8. Product caveat for the Firebase-only MVP

The iOS app writes shared minigame state directly to Firestore using client transactions. That keeps setup simple and sync fast, but hidden-information games such as **Rock Paper Scissors** and **Sink the Ship** are still client-authoritative. For a hardened production version, move game turns to a trusted backend or callable Cloud Functions.

## 9. Optional: Web app / Node backend

The original Next.js + Postgres app in `/frontend` and `/backend` is independent. You can retire it or keep it for internal testing; **Firestore is the source of truth** for the Swift app.
