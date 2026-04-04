import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var inviteField = ""
    @State private var message: String?
    @State private var busy = false
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    Text("Private room for two. Share moods with notes, reply once to each mood, and open synced minigames together.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Section("Start") {
                    Button {
                        Task { await createRoom() }
                    } label: {
                        if busy { ProgressView() } else { Text("Create private room") }
                    }
                }
                Section("Join") {
                    TextField("Invite code", text: $inviteField)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    Button("Join with code") {
                        Task { await joinRoom() }
                    }
                    .disabled(inviteField.trimmingCharacters(in: .whitespaces).count < 6 || busy)
                }
                if let message {
                    Section {
                        Text(message)
                            .foregroundStyle(.orange)
                            .font(.footnote)
                    }
                }
                Section {
                    Button("Sign out", role: .destructive) {
                        try? auth.signOut()
                    }
                }
            }
            .navigationTitle("Together")
            .navigationDestination(for: RoomRoute.self) { route in
                RoomView(roomId: route.roomId, inviteCode: route.inviteCode)
            }
        }
    }

    @MainActor
    private func createRoom() async {
        busy = true
        message = nil
        defer { busy = false }
        do {
            let result = try await FirestoreRoomsService.shared.createRoom()
            path.append(RoomRoute(roomId: result.roomId, inviteCode: result.inviteCode))
        } catch {
            message = error.localizedDescription
        }
    }

    @MainActor
    private func joinRoom() async {
        busy = true
        message = nil
        defer { busy = false }
        do {
            let result = try await FirestoreRoomsService.shared.joinRoom(inviteCode: inviteField)
            path.append(RoomRoute(roomId: result.roomId, inviteCode: result.inviteCode))
        } catch {
            message = error.localizedDescription
        }
    }
}

private struct RoomRoute: Hashable {
    let roomId: String
    let inviteCode: String
}
