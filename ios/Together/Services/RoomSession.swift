import Foundation
import FirebaseAuth
import FirebaseFirestore

@MainActor
final class RoomSession: ObservableObject {
    @Published private(set) var members: [String] = []
    @Published private(set) var inviteCode: String = ""
    @Published private(set) var moodsByUser: [String: MoodEntry] = [:]
    @Published private(set) var game: RoomGameSummary?
    @Published private(set) var errorMessage: String?

    var isActive: Bool { members.count >= 2 }

    private var roomListener: ListenerRegistration?
    private var moodsListener: ListenerRegistration?

    func subscribe(roomId: String) {
        unsubscribe()
        errorMessage = nil

        let roomRef = Firestore.firestore().collection("rooms").document(roomId)

        roomListener = roomRef.addSnapshotListener { [weak self] snapshot, error in
            Task { @MainActor in
                if let error {
                    self?.errorMessage = error.localizedDescription
                    return
                }
                guard let data = snapshot?.data() else { return }
                let currentUid = Auth.auth().currentUser?.uid
                let room = RoomGameParser.roomSnapshot(from: data, currentUserId: currentUid)
                self?.members = room.members
                self?.inviteCode = room.inviteCode
                self?.game = room.game
            }
        }

        moodsListener = roomRef.collection("moods").addSnapshotListener { [weak self] snapshot, error in
            Task { @MainActor in
                if let error {
                    self?.errorMessage = error.localizedDescription
                    return
                }
                guard let docs = snapshot?.documents else { return }
                var map: [String: MoodEntry] = [:]
                for doc in docs {
                    let data = doc.data()
                    map[doc.documentID] = MoodEntry(
                        userId: doc.documentID,
                        emoji: data["emoji"] as? String ?? "·",
                        label: data["label"] as? String ?? "",
                        updatedAt: (data["updatedAt"] as? Timestamp)?.dateValue(),
                        note: data["note"] as? String ?? "",
                        replyNote: data["replyNote"] as? String,
                        replyFromUserId: data["replyFromUserId"] as? String
                    )
                }
                self?.moodsByUser = map
            }
        }
    }

    func unsubscribe() {
        roomListener?.remove()
        moodsListener?.remove()
        roomListener = nil
        moodsListener = nil
    }
}
