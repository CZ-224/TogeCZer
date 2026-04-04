import SwiftUI
import FirebaseAuth

struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        Group {
            if !auth.isReady {
                ProgressView("Loading…")
            } else if auth.user == nil {
                LoginView()
            } else {
                HomeView()
            }
        }
    }
}
