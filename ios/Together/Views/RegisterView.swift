import SwiftUI
import FirebaseAuth

struct RegisterView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            Section("Create account") {
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                SecureField("Password (min 8)", text: $password)
                    .textContentType(.newPassword)
            }
            if let error {
                Text(error)
                    .foregroundStyle(.red)
                    .font(.footnote)
            }
            Section {
                Button {
                    Task { await register() }
                } label: {
                    if busy { ProgressView() } else { Text("Create account") }
                }
                .disabled(busy || email.isEmpty || password.count < 8)
            }
        }
        .navigationTitle("Sign up")
        .navigationBarTitleDisplayMode(.inline)
    }

    @MainActor
    private func register() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            _ = try await Auth.auth().createUser(withEmail: email, password: password)
            await FirestoreRoomsService.shared.ensureUserProfile()
            FCMTokenStore.shared.flushToFirestoreIfPossible()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
