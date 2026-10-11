import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutGridIcon, ReceiptTextIcon, Settings2Icon, UploadIcon } from "lucide-react";

const TABS = [
  { to: "/", label: "Dashboard", icon: LayoutGridIcon, end: true },
  { to: "/transactions", label: "Transactions", icon: ReceiptTextIcon, end: false },
  { to: "/import", label: "Import", icon: UploadIcon, end: false },
  { to: "/settings", label: "Settings", icon: Settings2Icon, end: false },
];

export function TabBar() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex justify-center">
      <div className="pb-safe w-full max-w-[440px] border-t border-line bg-surface/95 backdrop-blur">
        <ul className="grid grid-cols-4">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 pb-1.5 pt-2 text-[11px] font-semibold transition-colors duration-150 focus-visible:text-ink focus-visible:outline-none ${
                    isActive ? "text-accent" : "text-subtle hover:text-muted"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative flex h-8 w-14 items-center justify-center">
                      {isActive && (
                        <motion.span
                          layoutId="tab-pill"
                          className="absolute inset-0 rounded-full bg-accent/15"
                          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                        />
                      )}
                      <Icon className="relative h-5 w-5" strokeWidth={2} aria-hidden="true" />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
