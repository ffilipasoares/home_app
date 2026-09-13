import { HashRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { AuthGate } from "./components/AuthGate";
import { Dashboard } from "./pages/Dashboard";
import { Transactions } from "./pages/Transactions";
import { Import } from "./pages/Import";
import { Settings } from "./pages/Settings";
import { Ask } from "./pages/Ask";

export function App() {
  return (
    <AuthProvider>
      {/* HashRouter avoids needing server-side rewrite rules for deep links
          on a static host — Firebase Hosting's SPA rewrite (firebase.json)
          would also work, but this needs zero extra config either way. */}
      <HashRouter>
        <AuthGate>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/import" element={<Import />} />
            <Route path="/ask" element={<Ask />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </AuthGate>
      </HashRouter>
    </AuthProvider>
  );
}
