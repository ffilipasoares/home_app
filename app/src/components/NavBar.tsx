import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/transactions", label: "Transactions" },
  { to: "/import", label: "Import" },
  { to: "/ask", label: "Ask" },
  { to: "/settings", label: "Settings" },
];

export function NavBar() {
  return (
    <nav className="nav">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "active" : "")}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
