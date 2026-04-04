import Foundation
import FirebaseAuth
import FirebaseFirestore

enum RoomServiceError: LocalizedError {
    case notSignedIn
    case invalidInviteCode
    case roomNotFound
    case roomFull
    case badData
    case roomNotActive
    case notYourTurn
    case invalidMove
    case noteAlreadyReplied

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "You need to sign in."
        case .invalidInviteCode: return "That invite code doesn’t look valid."
        case .roomNotFound: return "No room matches that code."
        case .roomFull: return "This room already has two partners."
        case .badData: return "Something went wrong loading the room."
        case .roomNotActive: return "Both partners need to be in the room."
        case .notYourTurn: return "Wait for your turn."
        case .invalidMove: return "That move can’t be played."
        case .noteAlreadyReplied: return "That mood already has a reply."
        }
    }
}

@MainActor
final class FirestoreRoomsService {
    static let shared = FirestoreRoomsService()

    private let db = Firestore.firestore()

    private init() {}

    private func invites() -> CollectionReference { db.collection("inviteLookup") }
    private func rooms() -> CollectionReference { db.collection("rooms") }

    func createRoom() async throws -> (roomId: String, inviteCode: String) {
        guard let uid = Auth.auth().currentUser?.uid else { throw RoomServiceError.notSignedIn }

        let roomRef = rooms().document()
        let code = Self.makeInviteCode()
        try await roomRef.setDataAsync(
            [
                "inviteCode": code,
                "createdBy": uid,
                "members": [uid],
                "createdAt": FieldValue.serverTimestamp(),
            ],
            merge: false
        )
        try await invites().document(code).setDataAsync(["roomId": roomRef.documentID], merge: false)
        return (roomRef.documentID, code)
    }

    func joinRoom(inviteCode raw: String) async throws -> (roomId: String, inviteCode: String) {
        guard let uid = Auth.auth().currentUser?.uid else { throw RoomServiceError.notSignedIn }

        let code = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard code.count >= 6 else { throw RoomServiceError.invalidInviteCode }

        let lookupSnap = try await invites().document(code).getDocument()
        guard let roomId = lookupSnap.data()?["roomId"] as? String else { throw RoomServiceError.roomNotFound }

        let roomRef = rooms().document(roomId)
        let roomSnap = try await roomRef.getDocumentAsync()
        guard let members = roomSnap.data()?["members"] as? [String] else { throw RoomServiceError.badData }

        if members.contains(uid) {
            return (roomId, roomSnap.data()?["inviteCode"] as? String ?? code)
        }
        if members.count >= 2 { throw RoomServiceError.roomFull }

        try await roomRef.updateDataAsync(["members": FieldValue.arrayUnion([uid])])
        let updated = try await roomRef.getDocumentAsync()
        return (roomId, updated.data()?["inviteCode"] as? String ?? code)
    }

    func setMood(roomId: String, mood: MoodOption, note: String) async throws {
        guard let uid = Auth.auth().currentUser?.uid else { throw RoomServiceError.notSignedIn }

        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let ref = rooms().document(roomId).collection("moods").document(uid)
        try await ref.setDataAsync(
            [
                "moodKey": mood.rawValue,
                "label": mood.label,
                "emoji": mood.emoji,
                "updatedAt": FieldValue.serverTimestamp(),
                "note": trimmed,
                "messageId": UUID().uuidString,
                "replyNote": NSNull(),
                "replyFromUserId": NSNull(),
                "replyAt": NSNull(),
            ],
            merge: true
        )
    }

    func replyToMood(roomId: String, targetUserId: String, note: String) async throws {
        guard let uid = Auth.auth().currentUser?.uid else { throw RoomServiceError.notSignedIn }
        guard uid != targetUserId else { throw RoomServiceError.invalidMove }

        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let ref = rooms().document(roomId).collection("moods").document(targetUserId)
        try await db.runTransactionAsync { transaction, errorPointer in
            guard let snap = try? transaction.getDocument(ref), let data = snap.data() else {
                errorPointer?.pointee = NSError(domain: "Together", code: 1)
                return nil
            }
            if data["replyNote"] as? String != nil {
                errorPointer?.pointee = NSError(domain: RoomServiceError.noteAlreadyReplied.localizedDescription, code: 2)
                return nil
            }
            transaction.updateData(
                [
                    "replyNote": trimmed,
                    "replyFromUserId": uid,
                    "replyAt": FieldValue.serverTimestamp(),
                ],
                forDocument: ref
            )
            return nil
        }
    }

    func startGame(roomId: String, type: RoomGameType) async throws {
        guard let uid = Auth.auth().currentUser?.uid else { throw RoomServiceError.notSignedIn }
        let roomRef = rooms().document(roomId)

        try await db.runTransactionAsync { transaction, errorPointer in
            guard let roomData = try? transaction.getDocument(roomRef).data(),
                  let members = roomData["members"] as? [String],
                  members.contains(uid)
            else {
                errorPointer?.pointee = NSError(domain: RoomServiceError.badData.localizedDescription, code: 1)
                return nil
            }
            if members.count < 2 {
                errorPointer?.pointee = NSError(domain: RoomServiceError.roomNotActive.localizedDescription, code: 2)
                return nil
            }

            let starter = members.shuffled().first ?? uid
            let payload = self.initialGamePayload(type: type, members: members, starter: starter)
            transaction.updateData(payload, forDocument: roomRef)
            return nil
        }
    }

    func playGameMove(roomId: String, move: [String: Any]) async throws {
        guard let uid = Auth.auth().currentUser?.uid else { throw RoomServiceError.notSignedIn }
        let roomRef = rooms().document(roomId)

        try await db.runTransactionAsync { transaction, errorPointer in
            guard let roomData = try? transaction.getDocument(roomRef).data(),
                  let members = roomData["members"] as? [String],
                  let rawType = roomData["gameType"] as? String,
                  let type = RoomGameType(rawValue: rawType),
                  let status = roomData["gameStatus"] as? String,
                  status == RoomGameStatus.active.rawValue,
                  let state = roomData["gameState"] as? [String: Any]
            else {
                errorPointer?.pointee = NSError(domain: RoomServiceError.badData.localizedDescription, code: 3)
                return nil
            }

            let turnUserId = roomData["gameTurnUserId"] as? String
            if turnUserId != uid {
                errorPointer?.pointee = NSError(domain: RoomServiceError.notYourTurn.localizedDescription, code: 4)
                return nil
            }

            let nextData: [String: Any]
            switch type {
            case .bombminer:
                nextData = self.playBombminer(state: state, members: members, userId: uid, move: move)
            case .connectFour:
                nextData = self.playConnectFour(state: state, members: members, userId: uid, move: move)
            case .rockPaperScissors:
                nextData = self.playRps(state: state, members: members, userId: uid, move: move)
            case .sinkTheShip:
                nextData = self.playSinkTheShip(state: state, members: members, userId: uid, move: move)
            }
            transaction.updateData(nextData, forDocument: roomRef)
            return nil
        }
    }

    func ensureUserProfile() async {
        guard let user = Auth.auth().currentUser else { return }
        let ref = db.collection("users").document(user.uid)
        try? await ref.setDataAsync(
            [
                "email": user.email ?? "",
                "createdAt": FieldValue.serverTimestamp(),
            ],
            merge: true
        )
    }

    private func initialGamePayload(type: RoomGameType, members: [String], starter: String) -> [String: Any] {
        let now: [String: Any] = [
            "gameType": type.rawValue,
            "gameStatus": RoomGameStatus.active.rawValue,
            "gameTurnUserId": starter,
            "gameWinnerUserId": NSNull(),
            "gameUpdatedAt": FieldValue.serverTimestamp(),
        ]

        switch type {
        case .bombminer:
            let bombs = Array(0..<9).shuffled().prefix(2).sorted()
            return now.merging(
                [
                    "gameState": [
                        "kind": type.rawValue,
                        "columns": 3,
                        "boardSize": 9,
                        "bombs": bombs,
                        "safeReveals": Dictionary(uniqueKeysWithValues: members.map { ($0, 0) }),
                        "reveals": [],
                    ],
                ],
                uniquingKeysWith: { _, new in new }
            )
        case .connectFour:
            return now.merging(
                [
                    "gameState": [
                        "kind": type.rawValue,
                        "columns": 7,
                        "rows": 6,
                        "grid": Array(repeating: "", count: 42),
                    ],
                ],
                uniquingKeysWith: { _, new in new }
            )
        case .rockPaperScissors:
            return now.merging(
                [
                    "gameState": [
                        "kind": type.rawValue,
                        "targetWins": 3,
                        "roundNumber": 1,
                        "scores": Dictionary(uniqueKeysWithValues: members.map { ($0, 0) }),
                        "hasPicked": Dictionary(uniqueKeysWithValues: members.map { ($0, false) }),
                        "yourPendingChoices": Dictionary(uniqueKeysWithValues: members.map { ($0, "") }),
                        "rounds": [],
                    ],
                ],
                uniquingKeysWith: { _, new in new }
            )
        case .sinkTheShip:
            let boards = Dictionary(uniqueKeysWithValues: members.map { uid in
                (uid, [
                    "shipCells": Self.generateShipCells(size: 5, lengths: [3, 2]),
                    "hitsTaken": [],
                    "missesTaken": [],
                    "hitsMade": [],
                    "missesMade": [],
                ] as [String: Any])
            })
            return now.merging(
                [
                    "gameState": [
                        "kind": type.rawValue,
                        "size": 5,
                        "boards": boards,
                    ],
                ],
                uniquingKeysWith: { _, new in new }
            )
        }
    }

    private func playBombminer(state: [String: Any], members: [String], userId: String, move: [String: Any]) -> [String: Any] {
        let index = move["index"] as? Int ?? -1
        let bombs = state["bombs"] as? [Int] ?? []
        var reveals = state["reveals"] as? [[String: Any]] ?? []
        guard !reveals.contains(where: { ($0["index"] as? Int) == index }) else { return invalidMoveUpdate() }

        let hitBomb = bombs.contains(index)
        reveals.append(["index": index, "userId": userId, "hitBomb": hitBomb])
        var scores = state["safeReveals"] as? [String: Int] ?? [:]
        if !hitBomb { scores[userId] = (scores[userId] ?? 0) + 1 }

        var update: [String: Any] = [
            "gameState": state.merging(
                [
                    "reveals": reveals,
                    "safeReveals": scores,
                    "lastMove": ["userId": userId, "index": index, "outcome": hitBomb ? "BOMB" : "SAFE"],
                ],
                uniquingKeysWith: { _, new in new }
            ),
            "gameUpdatedAt": FieldValue.serverTimestamp(),
        ]

        if hitBomb {
            update["gameStatus"] = RoomGameStatus.finished.rawValue
            update["gameTurnUserId"] = NSNull()
            update["gameWinnerUserId"] = members.first(where: { $0 != userId }) ?? NSNull()
        } else if reveals.filter({ !($0["hitBomb"] as? Bool ?? false) }).count >= 7 {
            update["gameStatus"] = RoomGameStatus.finished.rawValue
            update["gameTurnUserId"] = NSNull()
            let sorted = scores.sorted { $0.value > $1.value }
            update["gameWinnerUserId"] = sorted.count >= 2 && sorted[0].value != sorted[1].value ? sorted[0].key : NSNull()
        } else {
            update["gameStatus"] = RoomGameStatus.active.rawValue
            update["gameTurnUserId"] = members.first(where: { $0 != userId }) ?? userId
            update["gameWinnerUserId"] = NSNull()
        }
        return update
    }

    private func playConnectFour(state: [String: Any], members: [String], userId: String, move: [String: Any]) -> [String: Any] {
        let column = move["column"] as? Int ?? -1
        let columns = state["columns"] as? Int ?? 7
        let rows = state["rows"] as? Int ?? 6
        var grid = state["grid"] as? [String] ?? Array(repeating: "", count: columns * rows)

        var placedRow = -1
        for row in stride(from: rows - 1, through: 0, by: -1) {
            let index = row * columns + column
            if column >= 0 && column < columns && grid[index].isEmpty {
                grid[index] = userId
                placedRow = row
                break
            }
        }
        guard placedRow >= 0 else { return invalidMoveUpdate() }

        let won = Self.hasConnectFour(grid: grid, columns: columns, rows: rows, userId: userId)
        let draw = !grid.contains(where: { $0.isEmpty })

        return [
            "gameState": state.merging(
                [
                    "grid": grid,
                    "lastMove": ["userId": userId, "column": column, "row": placedRow],
                ],
                uniquingKeysWith: { _, new in new }
            ),
            "gameStatus": won || draw ? RoomGameStatus.finished.rawValue : RoomGameStatus.active.rawValue,
            "gameTurnUserId": won || draw ? NSNull() : (members.first(where: { $0 != userId }) ?? userId),
            "gameWinnerUserId": won ? userId : NSNull(),
            "gameUpdatedAt": FieldValue.serverTimestamp(),
        ]
    }

    private func playRps(state: [String: Any], members: [String], userId: String, move: [String: Any]) -> [String: Any] {
        let choice = (move["choice"] as? String ?? "").uppercased()
        guard ["ROCK", "PAPER", "SCISSORS"].contains(choice) else { return invalidMoveUpdate() }

        var hasPicked = state["hasPicked"] as? [String: Bool] ?? [:]
        var pending = state["yourPendingChoices"] as? [String: String] ?? [:]
        if hasPicked[userId] == true { return invalidMoveUpdate() }

        hasPicked[userId] = true
        pending[userId] = choice
        let opponent = members.first(where: { $0 != userId }) ?? userId

        var updateState = state
        updateState["hasPicked"] = hasPicked
        updateState["yourPendingChoices"] = pending

        if hasPicked[opponent] != true {
            return [
                "gameState": updateState,
                "gameStatus": RoomGameStatus.active.rawValue,
                "gameTurnUserId": opponent,
                "gameWinnerUserId": NSNull(),
                "gameUpdatedAt": FieldValue.serverTimestamp(),
            ]
        }

        let opponentChoice = pending[opponent] ?? ""
        let round = state["roundNumber"] as? Int ?? 1
        var rounds = state["rounds"] as? [[String: Any]] ?? []
        var scores = state["scores"] as? [String: Int] ?? [:]
        let winner: String? = Self.resolveRpsWinner(firstUserId: userId, firstChoice: choice, secondUserId: opponent, secondChoice: opponentChoice)
        if let winner { scores[winner] = (scores[winner] ?? 0) + 1 }
        rounds.append(["round": round, "choices": [userId: choice, opponent: opponentChoice], "winnerUserId": winner as Any])

        let matchWinner = scores.first(where: { $0.value >= 3 })?.key
        return [
            "gameState": state.merging(
                [
                    "scores": scores,
                    "rounds": rounds,
                    "roundNumber": round + 1,
                    "hasPicked": Dictionary(uniqueKeysWithValues: members.map { ($0, false) }),
                    "yourPendingChoices": Dictionary(uniqueKeysWithValues: members.map { ($0, "") }),
                ],
                uniquingKeysWith: { _, new in new }
            ),
            "gameStatus": matchWinner == nil ? RoomGameStatus.active.rawValue : RoomGameStatus.finished.rawValue,
            "gameTurnUserId": matchWinner == nil ? opponent : NSNull(),
            "gameWinnerUserId": matchWinner ?? NSNull(),
            "gameUpdatedAt": FieldValue.serverTimestamp(),
        ]
    }

    private func playSinkTheShip(state: [String: Any], members: [String], userId: String, move: [String: Any]) -> [String: Any] {
        let index = move["index"] as? Int ?? -1
        guard var boards = state["boards"] as? [String: [String: Any]], let opponent = members.first(where: { $0 != userId }),
              var myBoard = boards[userId], var opponentBoard = boards[opponent] else { return invalidMoveUpdate() }

        var hitsMade = myBoard["hitsMade"] as? [Int] ?? []
        var missesMade = myBoard["missesMade"] as? [Int] ?? []
        if hitsMade.contains(index) || missesMade.contains(index) { return invalidMoveUpdate() }

        var hitsTaken = opponentBoard["hitsTaken"] as? [Int] ?? []
        var missesTaken = opponentBoard["missesTaken"] as? [Int] ?? []
        let shipCells = opponentBoard["shipCells"] as? [Int] ?? []
        let hit = shipCells.contains(index)
        if hit {
            hitsMade.append(index)
            hitsTaken.append(index)
        } else {
            missesMade.append(index)
            missesTaken.append(index)
        }
        myBoard["hitsMade"] = hitsMade
        myBoard["missesMade"] = missesMade
        opponentBoard["hitsTaken"] = hitsTaken
        opponentBoard["missesTaken"] = missesTaken
        boards[userId] = myBoard
        boards[opponent] = opponentBoard

        let win = shipCells.allSatisfy { hitsTaken.contains($0) }
        return [
            "gameState": state.merging(
                [
                    "boards": boards,
                    "lastMove": ["userId": userId, "targetIndex": index, "outcome": hit ? "HIT" : "MISS"],
                ],
                uniquingKeysWith: { _, new in new }
            ),
            "gameStatus": win ? RoomGameStatus.finished.rawValue : RoomGameStatus.active.rawValue,
            "gameTurnUserId": win ? NSNull() : opponent,
            "gameWinnerUserId": win ? userId : NSNull(),
            "gameUpdatedAt": FieldValue.serverTimestamp(),
        ]
    }

    private func invalidMoveUpdate() -> [String: Any] {
        ["gameUpdatedAt": FieldValue.serverTimestamp()]
    }

    private static let inviteAlphabet = Array("23456789ABCDEFGHJKLMNPQRSTUVWXYZ")

    private static func makeInviteCode(length: Int = 8) -> String {
        var s = ""
        s.reserveCapacity(length)
        for _ in 0 ..< length { s.append(inviteAlphabet.randomElement()!) }
        return s
    }

    private static func hasConnectFour(grid: [String], columns: Int, rows: Int, userId: String) -> Bool {
        let directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
        for row in 0..<rows {
            for column in 0..<columns {
                guard grid[row * columns + column] == userId else { continue }
                for (dc, dr) in directions {
                    var okay = true
                    for step in 1..<4 {
                        let nextColumn = column + dc * step
                        let nextRow = row + dr * step
                        if nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows ||
                            grid[nextRow * columns + nextColumn] != userId {
                            okay = false
                            break
                        }
                    }
                    if okay { return true }
                }
            }
        }
        return false
    }

    private static func resolveRpsWinner(firstUserId: String, firstChoice: String, secondUserId: String, secondChoice: String) -> String? {
        if firstChoice == secondChoice { return nil }
        if (firstChoice == "ROCK" && secondChoice == "SCISSORS") ||
            (firstChoice == "PAPER" && secondChoice == "ROCK") ||
            (firstChoice == "SCISSORS" && secondChoice == "PAPER") {
            return firstUserId
        }
        return secondUserId
    }

    private static func generateShipCells(size: Int, lengths: [Int]) -> [Int] {
        var occupied = Set<Int>()
        var result: [Int] = []

        for length in lengths {
            var placed = false
            for _ in 0..<100 where !placed {
                let horizontal = Bool.random()
                let startRow = Int.random(in: 0...(horizontal ? size - 1 : size - length))
                let startColumn = Int.random(in: 0...(horizontal ? size - length : size - 1))
                let cells = (0..<length).map { step -> Int in
                    let row = startRow + (horizontal ? 0 : step)
                    let column = startColumn + (horizontal ? step : 0)
                    return row * size + column
                }
                if cells.contains(where: { occupied.contains($0) }) { continue }
                cells.forEach { occupied.insert($0) }
                result.append(contentsOf: cells)
                placed = true
            }
        }

        return result.sorted()
    }
}
