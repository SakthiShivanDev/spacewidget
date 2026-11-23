# SpaceWidget Firebase

Optional Firebase Messaging 17 integration for a hosted SpaceWidget app. Initialize Firebase with your platform configuration, call `SpaceFirebasePush.start()` early, and expose its `pushRegister` and `pushUnregister` operations to the client. The core renderer does not depend on Firebase.

The bridge handles permission, persisted consent, current/rotated registrations, foreground state updates and notification taps from a cold or background app. The backend resolves notification IDs to authenticated, owned destinations. Dispose the bridge before disposing its client.

See [the complete integration guide](../../docs/commerce-and-integrations.md) for host wiring, server credentials, APNs, app-link and web service-worker requirements and verification limits.
