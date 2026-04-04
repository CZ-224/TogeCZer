import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseMessaging

/// Keeps the current FCM registration token on the signed-in user's Firestore document
/// so Cloud Functions can notify the partner when a mood is saved.
final class FCMTokenStore {
    static let shared = FCMTokenStore()

    private var pendingToken: String?

    private init() {}

    /// Called from `MessagingDelegate` when APNs/FCM rotates the token.
    func cache(token: String?) {
        guard let token else { return }
        pendingToken = token
        flushToFirestoreIfPossible()
    }

    func flushToFirestoreIfPossible() {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        let token = pendingToken ?? Messaging.messaging().fcmToken
        guard let token else { return }

        Firestore.firestore().collection("users").document(uid).setData(
            [
                "fcmToken": token,
                "fcmTokenUpdatedAt": FieldValue.serverTimestamp(),
            ],
            merge: true
        ) { error in
            if let error {
                print("[FCMTokenStore] Failed to save token: \(error.localizedDescription)")
            } else {
                print("[FCMTokenStore] Saved FCM token for user \(uid)")
            }
        }
    }
}
