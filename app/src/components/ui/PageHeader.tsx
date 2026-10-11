import type { ReactNode } from "react";

export function PageHeader({ title, children, action }: { title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="pt-safe px-5 pb-4">
      <div className="flex min-h-[44px] items-center justify-between gap-3">
        {title ? <h1 className="text-[28px] font-bold tracking-tight">{title}</h1> : children}
        {action}
      </div>
    </header>
  );
}
