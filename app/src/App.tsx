import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./lib/auth";
import { AuthGate } from "./components/AuthGate";
import { Dashboard } from "./pages/Dashboard";
import { Transactions } from "./pages/Transactions";
import { Analysis } from "./pages/Analysis";
import { Investments } from "./pages/Investments";
import { Settings } from "./pages/Settings";
import { BankCallback } from "./pages/BankCallback";
import { SelectedMonthProvider } from "./components/SelectedMonthProvider";

export function App() {
  return (
    <AuthProvider>
      {/* HashRouter avoids needing server-side rewrite rules for deep links
          on a static host — Firebase Hosting's SPA rewrite (firebase.json)
          would also work, but this needs zero extra config either way. */}
      <HashRouter>
        <AuthGate>
          <SelectedMonthProvider>
            <PageBoundary>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/analysis" element={<Analysis />} />
                <Route path="/investments" element={<Investments />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/bank-callback" element={<BankCallback />} />
              </Routes>
            </PageBoundary>
          </SelectedMonthProvider>
        </AuthGate>
      </HashRouter>
    </AuthProvider>
  );
}

/** A crash on one page shows an error there; switching tab tries again. */
function PageBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}
