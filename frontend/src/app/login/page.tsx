import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="shell">
      <Suspense
        fallback={
          <p className="muted" style={{ margin: 0 }}>
            Loading…
          </p>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
