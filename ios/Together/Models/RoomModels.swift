import Foundation
import FirebaseFirestore

struct MoodEntry: Identifiable, Equatable {
    var id: String { userId }
    let userId: String
    let emoji: String
    let label: String
    let updatedAt: Date?
    let note: String
    let replyNote: String?
    let replyFromUserId: String?
}

enum RoomGameType: String, CaseIterable, Identifiable {
    case bombminer = "BOMBMINER"
    case connectFour = "CONNECT_FOUR"
    case rockPaperScissors = "ROCK_PAPER_SCISSORS"
    case sinkTheShip = "SINK_THE_SHIP"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .bombminer: return "Bombminer"
        case .connectFour: return "Connect 4"
        case .rockPaperScissors: return "Rock Paper Scissors"
        case .sinkTheShip: return "Sink the Ship"
        }
    }
}

enum RoomGameStatus: String {
    case active = "ACTIVE"
    case finished = "FINISHED"
}

struct BombminerCell: Identifiable, Equatable {
    let index: Int
    let status: String
    let revealedByUserId: String?
    var id: Int { index }
}

struct BombminerGame: Equatable {
    let columns: Int
    let boardSize: Int
    let safeReveals: [String: Int]
    let lastMove: [String: AnyHashable]?
    let cells: [BombminerCell]
}

struct ConnectFourGame: Equatable {
    let columns: Int
    let rows: Int
    let grid: [String?]
}

struct RockPaperScissorsRound: Identifiable, Equatable {
    let round: Int
    let choices: [String: String]
    let winnerUserId: String?
    var id: Int { round }
}

struct RockPaperScissorsGame: Equatable {
    let targetWins: Int
    let roundNumber: Int
    let scores: [String: Int]
    let hasPicked: [String: Bool]
    let yourPendingChoice: String?
    let rounds: [RockPaperScissorsRound]
}

struct SinkBoardState: Equatable {
    let ownerUserId: String
    let shipCells: [Int]
    let hitsTaken: [Int]
    let missesTaken: [Int]
    let hitsMade: [Int]
    let missesMade: [Int]
    let remainingShipCells: Int
}

struct SinkTheShipGame: Equatable {
    let size: Int
    let yourBoard: SinkBoardState?
    let targetBoard: SinkBoardState?
}

enum RoomGameState: Equatable {
    case bombminer(BombminerGame)
    case connectFour(ConnectFourGame)
    case rockPaperScissors(RockPaperScissorsGame)
    case sinkTheShip(SinkTheShipGame)
}

struct RoomGameSummary: Equatable {
    let type: RoomGameType
    let status: RoomGameStatus
    let turnUserId: String?
    let winnerUserId: String?
    let updatedAt: Date?
    let state: RoomGameState
}

struct RoomSnapshot: Equatable {
    let members: [String]
    let inviteCode: String
    let game: RoomGameSummary?
}

enum RoomGameParser {
    static func roomSnapshot(from data: [String: Any], currentUserId: String?) -> RoomSnapshot {
        RoomSnapshot(
            members: data["members"] as? [String] ?? [],
            inviteCode: data["inviteCode"] as? String ?? "",
            game: gameSummary(from: data, currentUserId: currentUserId)
        )
    }

    static func gameSummary(from data: [String: Any], currentUserId: String?) -> RoomGameSummary? {
        guard
            let rawType = data["gameType"] as? String,
            let type = RoomGameType(rawValue: rawType),
            let rawStatus = data["gameStatus"] as? String,
            let status = RoomGameStatus(rawValue: rawStatus),
            let state = data["gameState"] as? [String: Any]
        else {
            return nil
        }

        let updatedAt = (data["gameUpdatedAt"] as? Timestamp)?.dateValue()
        switch type {
        case .bombminer:
            let cells = (state["cells"] as? [[String: Any]] ?? []).map {
                BombminerCell(
                    index: $0["index"] as? Int ?? 0,
                    status: $0["status"] as? String ?? "HIDDEN",
                    revealedByUserId: $0["revealedByUserId"] as? String
                )
            }
            let game = BombminerGame(
                columns: state["columns"] as? Int ?? 3,
                boardSize: state["boardSize"] as? Int ?? 9,
                safeReveals: state["safeReveals"] as? [String: Int] ?? [:],
                lastMove: state["lastMove"] as? [String: AnyHashable],
                cells: cells
            )
            return RoomGameSummary(
                type: type,
                status: status,
                turnUserId: data["gameTurnUserId"] as? String,
                winnerUserId: data["gameWinnerUserId"] as? String,
                updatedAt: updatedAt,
                state: .bombminer(game)
            )
        case .connectFour:
            let rawGrid = state["grid"] as? [String] ?? []
            let game = ConnectFourGame(
                columns: state["columns"] as? Int ?? 7,
                rows: state["rows"] as? Int ?? 6,
                grid: rawGrid.map { $0.isEmpty ? nil : $0 }
            )
            return RoomGameSummary(
                type: type,
                status: status,
                turnUserId: data["gameTurnUserId"] as? String,
                winnerUserId: data["gameWinnerUserId"] as? String,
                updatedAt: updatedAt,
                state: .connectFour(game)
            )
        case .rockPaperScissors:
            let rounds = (state["rounds"] as? [[String: Any]] ?? []).map {
                RockPaperScissorsRound(
                    round: $0["round"] as? Int ?? 0,
                    choices: $0["choices"] as? [String: String] ?? [:],
                    winnerUserId: $0["winnerUserId"] as? String
                )
            }
            let game = RockPaperScissorsGame(
                targetWins: state["targetWins"] as? Int ?? 3,
                roundNumber: state["roundNumber"] as? Int ?? 1,
                scores: state["scores"] as? [String: Int] ?? [:],
                hasPicked: state["hasPicked"] as? [String: Bool] ?? [:],
                yourPendingChoice: currentUserId.flatMap { uid in
                    (state["yourPendingChoices"] as? [String: String])?[uid]
                },
                rounds: rounds
            )
            return RoomGameSummary(
                type: type,
                status: status,
                turnUserId: data["gameTurnUserId"] as? String,
                winnerUserId: data["gameWinnerUserId"] as? String,
                updatedAt: updatedAt,
                state: .rockPaperScissors(game)
            )
        case .sinkTheShip:
            let size = state["size"] as? Int ?? 5
            let boards = state["boards"] as? [String: [String: Any]] ?? [:]
            let myBoard = currentUserId.flatMap { uid in board(from: boards[uid], ownerUserId: uid) }
            let enemyId = boards.keys.first(where: { $0 != currentUserId })
            let targetBoard = enemyId.flatMap { uid in board(from: boards[uid], ownerUserId: uid) }
            return RoomGameSummary(
                type: type,
                status: status,
                turnUserId: data["gameTurnUserId"] as? String,
                winnerUserId: data["gameWinnerUserId"] as? String,
                updatedAt: updatedAt,
                state: .sinkTheShip(SinkTheShipGame(size: size, yourBoard: myBoard, targetBoard: targetBoard))
            )
        }
    }

    private static func board(from data: [String: Any]?, ownerUserId: String) -> SinkBoardState? {
        guard let data else { return nil }
        let shipCells = data["shipCells"] as? [Int] ?? []
        let hitsTaken = data["hitsTaken"] as? [Int] ?? []
        return SinkBoardState(
            ownerUserId: ownerUserId,
            shipCells: shipCells,
            hitsTaken: hitsTaken,
            missesTaken: data["missesTaken"] as? [Int] ?? [],
            hitsMade: data["hitsMade"] as? [Int] ?? [],
            missesMade: data["missesMade"] as? [Int] ?? [],
            remainingShipCells: shipCells.filter { !hitsTaken.contains($0) }.count
        )
    }
}
