import SwiftUI
import FirebaseAuth

struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false
    @State private var showRegister = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                }
                if let error {
                    Text(error)
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
                Section {
                    Button {
                        Task { await signIn() }
                    } label: {
                        if busy { ProgressView() } else { Text("Sign in") }
                    }
                    .disabled(busy || email.isEmpty || password.count < 8)
                }
            }
            .navigationTitle("Together")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign up") { showRegister = true }
                }
            }
            .navigationDestination(isPresented: $showRegister) {
                RegisterView()
            }
        }
    }

    @MainActor
    private func signIn() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            _ = try await Auth.auth().signIn(withEmail: email, password: password)
            await FirestoreRoomsService.shared.ensureUserProfile()
            FCMTokenStore.shared.flushToFirestoreIfPossible()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
