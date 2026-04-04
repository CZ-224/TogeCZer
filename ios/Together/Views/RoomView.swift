import SwiftUI
import FirebaseAuth

struct RoomView: View {
    let roomId: String
    let inviteCode: String

    @StateObject private var session = RoomSession()
    @State private var selectedMood: MoodOption?
    @State private var moodNote = ""
    @State private var replyDrafts: [String: String] = [:]
    @State private var sendError: String?
    @State private var gameError: String?

    private var currentUid: String? { Auth.auth().currentUser?.uid }

    var body: some View {
        List {
            Section("Invite") {
                Text(session.inviteCode.isEmpty ? inviteCode : session.inviteCode)
                    .font(.title2.monospaced())
                    .fontWeight(.semibold)
                Text(session.isActive ? "Both of you are here — moods and games stay synced." : "Waiting for your partner…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let sendError {
                Section { Text(sendError).foregroundStyle(.red).font(.footnote) }
            }

            if let gameError {
                Section { Text(gameError).foregroundStyle(.red).font(.footnote) }
            }

            Section("Partner moods") {
                ForEach(partnerRows) { row in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(row.title)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let mood = row.mood {
                            HStack(alignment: .top, spacing: 12) {
                                Text(mood.emoji).font(.largeTitle)
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(mood.label).font(.headline)
                                    if !mood.note.isEmpty {
                                        Text(mood.note)
                                            .font(.subheadline)
                                    }
                                    if let reply = mood.replyNote, !reply.isEmpty {
                                        Text("Reply: \(reply)")
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                    } else if row.userId != currentUid {
                                        TextField("Reply once…", text: bindingForReply(row.userId))
                                            .textFieldStyle(.roundedBorder)
                                        Button("Send reply") {
                                            Task { await sendReply(to: row.userId) }
                                        }
                                        .disabled(replyDrafts[row.userId, default: ""].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                    }
                                }
                            }
                        } else {
                            Text(session.isActive ? "No mood yet" : "—").foregroundStyle(.tertiary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Section("How do you feel?") {
                TextField("Optional note for your partner", text: $moodNote, axis: .vertical)
                    .lineLimit(1...4)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 5), spacing: 10) {
                    ForEach(MoodOption.allCases) { mood in
                        Button {
                            Task { await sendMood(mood) }
                        } label: {
                            VStack(spacing: 4) {
                                Text(mood.emoji).font(.title2)
                                Text(mood.label)
                                    .font(.caption2)
                                    .multilineTextAlignment(.center)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, minHeight: 72)
                            .padding(6)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(isSelected(mood) ? Color.accentColor.opacity(0.15) : Color.secondary.opacity(0.08))
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(!session.isActive || selectedMood != nil)
                    }
                }
                .listRowInsets(EdgeInsets())
            }

            Section("Minigames") {
                Menu {
                    ForEach(RoomGameType.allCases) { gameType in
                        Button(gameType.title) {
                            Task { await start(gameType) }
                        }
                    }
                } label: {
                    Label(session.game.map { "Change game: \($0.type.title)" } ?? "Open minigames", systemImage: "gamecontroller")
                }
                .disabled(!session.isActive)

                if let game = session.game {
                    gamePanel(game)
                } else {
                    Text("No game running yet. Open the minigames menu to start one.")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Your room")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { session.subscribe(roomId: roomId) }
        .onDisappear { session.unsubscribe() }
    }

    @ViewBuilder
    private func gamePanel(_ game: RoomGameSummary) -> some View {
        Text(game.status == .finished ? winnerText(game) : turnText(game))
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.secondary)

        switch game.state {
        case .bombminer(let bombminer):
            VStack(spacing: 12) {
                HStack {
                    ForEach(partnerRows) { row in
                        VStack(alignment: .leading) {
                            Text(row.title).font(.caption)
                            Text("\(bombminer.safeReveals[row.userId] ?? 0) safe picks").font(.footnote)
                        }
                        Spacer()
                    }
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: bombminer.columns), spacing: 8) {
                    ForEach(bombminer.cells) { cell in
                        Button {
                            Task { await play(["kind": "REVEAL_CELL", "index": cell.index]) }
                        } label: {
                            Text(cell.status == "HIDDEN" ? "?" : cell.status == "SAFE" ? "OK" : "B")
                                .frame(maxWidth: .infinity, minHeight: 54)
                                .background(RoundedRectangle(cornerRadius: 12).fill(tileColor(cell.status)))
                        }
                        .disabled(!isMyTurn(game) || cell.status != "HIDDEN" || game.status != .active)
                        .buttonStyle(.plain)
                    }
                }
            }
        case .connectFour(let connectFour):
            VStack(spacing: 12) {
                HStack(spacing: 6) {
                    ForEach(0..<connectFour.columns, id: \.self) { column in
                        Button("Drop") {
                            Task { await play(["kind": "DROP_DISC", "column": column]) }
                        }
                        .buttonStyle(.bordered)
                        .disabled(!isMyTurn(game) || game.status != .active)
                    }
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: connectFour.columns), spacing: 6) {
                    ForEach(Array(connectFour.grid.enumerated()), id: \.offset) { _, cell in
                        Circle()
                            .fill(connectFourColor(cell))
                            .frame(height: 34)
                    }
                }
            }
        case .rockPaperScissors(let rps):
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    ForEach(partnerRows) { row in
                        VStack(alignment: .leading) {
                            Text(row.title).font(.caption)
                            Text("\(rps.scores[row.userId] ?? 0) wins").font(.footnote)
                            Text(rps.hasPicked[row.userId] == true ? "Locked in" : "Waiting").font(.footnote).foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                }
                HStack {
                    ForEach(["ROCK", "PAPER", "SCISSORS"], id: \.self) { choice in
                        Button(choice.capitalized) {
                            Task { await play(["kind": "THROW_SIGN", "choice": choice]) }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(!isMyTurn(game) || game.status != .active || rps.yourPendingChoice != nil)
                    }
                }
                Text("Round \(rps.roundNumber), first to \(rps.targetWins). Your hidden pick: \(rps.yourPendingChoice ?? "none")")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                ForEach(rps.rounds.suffix(3).reversed()) { round in
                    Text("Round \(round.round): \(roundSummary(round))")
                        .font(.footnote)
                }
            }
        case .sinkTheShip(let sink):
            VStack(spacing: 12) {
                HStack {
                    VStack(alignment: .leading) {
                        Text("Your fleet").font(.caption)
                        Text("\(sink.yourBoard?.remainingShipCells ?? 0) cells left").font(.footnote)
                    }
                    Spacer()
                    VStack(alignment: .leading) {
                        Text("Enemy fleet").font(.caption)
                        Text("\(sink.targetBoard?.remainingShipCells ?? 0) cells left").font(.footnote)
                    }
                }
                if let board = sink.yourBoard {
                    Text("Your board").font(.caption).frame(maxWidth: .infinity, alignment: .leading)
                    gridBoard(size: sink.size) { index in
                        let hasShip = board.shipCells.contains(index)
                        let hit = board.hitsTaken.contains(index)
                        let miss = board.missesTaken.contains(index)
                        Text(hit ? "X" : miss ? "o" : hasShip ? "S" : "")
                            .frame(maxWidth: .infinity, minHeight: 32)
                            .background(RoundedRectangle(cornerRadius: 8).fill(hit ? .red.opacity(0.22) : hasShip ? .purple.opacity(0.18) : .secondary.opacity(0.08)))
                    }
                }
                if let board = sink.targetBoard {
                    Text("Target board").font(.caption).frame(maxWidth: .infinity, alignment: .leading)
                    gridBoard(size: sink.size) { index in
                        let hit = board.hitsMade.contains(index)
                        let miss = board.missesMade.contains(index)
                        Button {
                            Task { await play(["kind": "FIRE_TORPEDO", "index": index]) }
                        } label: {
                            Text(hit ? "X" : miss ? "o" : "")
                                .frame(maxWidth: .infinity, minHeight: 32)
                                .background(RoundedRectangle(cornerRadius: 8).fill(hit ? .red.opacity(0.22) : miss ? .blue.opacity(0.18) : .secondary.opacity(0.08)))
                        }
                        .buttonStyle(.plain)
                        .disabled(!isMyTurn(game) || game.status != .active || hit || miss)
                    }
                }
            }
        }
    }

    private var partnerRows: [PartnerRow] {
        guard let uid = currentUid else { return [] }
        return session.members.map { memberId in
            PartnerRow(
                id: memberId,
                userId: memberId,
                title: memberId == uid ? "You" : "Your partner",
                mood: session.moodsByUser[memberId]
            )
        }
    }

    private func bindingForReply(_ userId: String) -> Binding<String> {
        Binding(
            get: { replyDrafts[userId, default: ""] },
            set: { replyDrafts[userId] = $0 }
        )
    }

    private func isSelected(_ mood: MoodOption) -> Bool {
        guard let uid = currentUid, let entry = session.moodsByUser[uid] else { return false }
        return entry.label == mood.label
    }

    private func isMyTurn(_ game: RoomGameSummary) -> Bool {
        game.turnUserId == currentUid && game.status == .active
    }

    private func turnText(_ game: RoomGameSummary) -> String {
        if game.turnUserId == currentUid { return "Your turn" }
        return "Your partner's turn"
    }

    private func winnerText(_ game: RoomGameSummary) -> String {
        if game.winnerUserId == nil { return "It ended in a tie" }
        return game.winnerUserId == currentUid ? "You won" : "Your partner won"
    }

    private func roundSummary(_ round: RockPaperScissorsRound) -> String {
        partnerRows.map { row in
            "\(row.title): \(round.choices[row.userId] ?? "-")"
        }.joined(separator: " · ")
    }

    private func tileColor(_ status: String) -> Color {
        switch status {
        case "SAFE": return .green.opacity(0.18)
        case "BOMB": return .red.opacity(0.18)
        default: return .secondary.opacity(0.08)
        }
    }

    private func connectFourColor(_ owner: String?) -> Color {
        guard let owner else { return .secondary.opacity(0.12) }
        return owner == currentUid ? .pink.opacity(0.75) : .purple.opacity(0.75)
    }

    @ViewBuilder
    private func gridBoard<Content: View>(size: Int, @ViewBuilder content: @escaping (Int) -> Content) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: size), spacing: 6) {
            ForEach(0..<(size * size), id: \.self) { index in
                content(index)
            }
        }
    }

    @MainActor
    private func sendMood(_ mood: MoodOption) async {
        guard session.isActive else { return }
        sendError = nil
        selectedMood = mood
        defer { selectedMood = nil }
        do {
            try await FirestoreRoomsService.shared.setMood(roomId: roomId, mood: mood, note: moodNote)
            moodNote = ""
        } catch {
            sendError = error.localizedDescription
        }
    }

    @MainActor
    private func sendReply(to targetUserId: String) async {
        sendError = nil
        let note = replyDrafts[targetUserId, default: ""]
        do {
            try await FirestoreRoomsService.shared.replyToMood(roomId: roomId, targetUserId: targetUserId, note: note)
            replyDrafts[targetUserId] = ""
        } catch {
            sendError = error.localizedDescription
        }
    }

    @MainActor
    private func start(_ game: RoomGameType) async {
        gameError = nil
        do {
            try await FirestoreRoomsService.shared.startGame(roomId: roomId, type: game)
        } catch {
            gameError = error.localizedDescription
        }
    }

    @MainActor
    private func play(_ move: [String: Any]) async {
        gameError = nil
        do {
            try await FirestoreRoomsService.shared.playGameMove(roomId: roomId, move: move)
        } catch {
            gameError = error.localizedDescription
        }
    }
}

private struct PartnerRow: Identifiable {
    let id: String
    let userId: String
    let title: String
    let mood: MoodEntry?
}
