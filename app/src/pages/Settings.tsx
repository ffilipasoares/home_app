import { useEffect, useState } from "react";
import { CalendarClockIcon, LogOutIcon, PiggyBankIcon, TagsIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { subscribeDashboard } from "../lib/dashboard";
import { formatCurrency, formatMoney } from "../lib/format";
import { useSelectedMonth } from "../lib/selectedMonth";
import { saveDisplayCurrency, subscribeCategories, subscribeUserSettings } from "../lib/settings";
import { PageHeader } from "../components/ui/PageHeader";
import { IconTile } from "../components/ui/IconTile";
import { RowGroup, SectionHeader, ValueRow } from "../components/ui/ValueRow";
import { BottomSheet, SheetFooter } from "../components/ui/BottomSheet";
import { Button } from "../components/ui/Button";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { CURRENCY_OPTIONS } from "../components/ui/styles";
import { categoryLook } from "../lib/categoryLook";
import { BankConnection } from "../components/settings/BankConnection";
import { FilipaSalarySheet, JoaoSalarySheet } from "../components/settings/SalarySheets";
import { SavingsGoalSheet } from "../components/settings/SavingsGoalSheet";
import { FixedExpensesSheet } from "../components/settings/FixedExpensesSheet";
import { CategoriesSheet } from "../components/settings/CategoriesSheet";
import { ENTRY_CURRENCY } from "../types";
import type { CategoryDef, DashboardDoc, DisplayCurrency, UserSettings } from "../types";

type OpenSheet = "filipa" | "joao" | "goal" | "fixed" | "categories" | "signout" | null;

export function Settings() {
  const { user, signOut } = useAuth();
  const uid = user!.uid;
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [open, setOpen] = useState<OpenSheet>(null);
  const close = () => setOpen(null);

  useEffect(() => subscribeUserSettings(uid, setSettings), [uid]);
  useEffect(() => subscribeCategories(uid, setCategories), [uid]);

  // The month picked on the Dashboard, for "detected in <month>" and the fixed total.
  const { month } = useSelectedMonth();
  const [dashboard, setDashboard] = useState<DashboardDoc | null>(null);
  useEffect(() => subscribeDashboard(uid, month, setDashboard), [uid, month]);

  if (!settings) {
    return <PageHeader title="Settings" />;
  }

  const currency: DisplayCurrency = settings.displayCurrency ?? ENTRY_CURRENCY;
  const salaryCurrency: DisplayCurrency = settings.salaryCurrency ?? ENTRY_CURRENCY;
  const detectedRaw = dashboard?.views?.[salaryCurrency]?.autoDetectedFilipaSalary ?? 0;
  const detected = detectedRaw > 0 ? detectedRaw : null;
  const fixedTotal = dashboard?.views?.[currency]?.fixedExpensesTotal;
  const goal = settings.savingsGoal;

  return (
    <>
      <PageHeader title="Settings" />

      <div className="space-y-10 px-5 pb-8">
        <BankConnection uid={uid} />

        <section aria-labelledby="currency-heading">
          <SectionHeader
            id="currency-heading"
            title="App currency"
            note="Everything is shown in it. Other-currency transactions convert at their own date's rate."
          />
          <div className="mt-3">
            <SegmentedControl<DisplayCurrency>
              label="App currency"
              value={currency}
              onChange={(displayCurrency) => {
                setSettings({ ...settings, displayCurrency });
                saveDisplayCurrency(uid, displayCurrency);
              }}
              options={CURRENCY_OPTIONS}
            />
          </div>
        </section>

        <section aria-labelledby="salaries-heading">
          <SectionHeader id="salaries-heading" title="Salaries" note="Used for every month's income on the Dashboard." />
          <RowGroup className="mt-3">
            <ValueRow
              leading={<IconTile letter="F" color="#F472B6" round />}
              label="Filipa's salary"
              description={
                settings.filipaSalaryAmount != null ? "Fixed amount" : detected === null ? "Detected · none yet" : "Detected"
              }
              value={
                settings.filipaSalaryAmount != null
                  ? formatCurrency(settings.filipaSalaryAmount, salaryCurrency)
                  : detected !== null
                    ? formatCurrency(detected, salaryCurrency)
                    : "—"
              }
              onClick={() => setOpen("filipa")}
            />
            <ValueRow
              leading={<IconTile letter="J" color="#60A5FA" round />}
              label="João's salary"
              description={settings.joaoSalary ? "Fixed amount" : "Not set"}
              value={settings.joaoSalary ? formatCurrency(settings.joaoSalary.amount, settings.joaoSalary.currency) : "—"}
              onClick={() => setOpen("joao")}
            />
          </RowGroup>
        </section>

        <section aria-labelledby="budget-heading">
          <SectionHeader id="budget-heading" title="Budget" />
          <RowGroup className="mt-3">
            <ValueRow
              leading={<IconTile icon={PiggyBankIcon} color="#A78BFA" />}
              label="Savings goal"
              description={goal.type === "fixed" ? "Per month" : "Of monthly income"}
              value={
                goal.type === "fixed"
                  ? goal.value > 0
                    ? formatCurrency(goal.value, goal.currency ?? ENTRY_CURRENCY)
                    : "—"
                  : `${goal.value.toLocaleString()}%`
              }
              onClick={() => setOpen("goal")}
            />
            <ValueRow
              leading={<IconTile icon={CalendarClockIcon} color="#FACC15" />}
              label="Fixed expenses"
              description={settings.fixedExpenses.map((f) => f.label).join(", ") || "None yet"}
              value={fixedTotal !== undefined && settings.fixedExpenses.length > 0 ? formatMoney(fixedTotal, currency) : undefined}
              onClick={() => setOpen("fixed")}
            />
          </RowGroup>
        </section>

        <section aria-labelledby="categories-heading">
          <SectionHeader id="categories-heading" title="Categories" />
          <RowGroup className="mt-3">
            <ValueRow
              leading={<IconTile icon={TagsIcon} color="#2DD4BF" />}
              label={`${categories.length} categories`}
              description={categories.map((c) => c.label).join(", ")}
              onClick={() => setOpen("categories")}
            />
          </RowGroup>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden="true">
            {categories.map((c) => {
              const { color } = categoryLook(c);
              return (
                <span
                  key={c.id}
                  className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                  style={{ backgroundColor: `${color}1F`, color }}
                >
                  {c.label}
                </span>
              );
            })}
          </div>
        </section>

        <div>
          <Button variant="secondary" className="w-full !text-negative" onClick={() => setOpen("signout")}>
            <LogOutIcon className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
          <p className="mt-2 text-center text-[12px] text-subtle">Signed in as {user?.email}</p>
        </div>
      </div>

      <FilipaSalarySheet open={open === "filipa"} onClose={close} uid={uid} settings={settings} detected={detected} month={month} />
      <JoaoSalarySheet open={open === "joao"} onClose={close} uid={uid} settings={settings} />
      <SavingsGoalSheet open={open === "goal"} onClose={close} uid={uid} settings={settings} />
      <FixedExpensesSheet
        open={open === "fixed"}
        onClose={close}
        uid={uid}
        items={settings.fixedExpenses}
        categories={categories}
        defaultCurrency={currency}
      />
      <CategoriesSheet open={open === "categories"} onClose={close} uid={uid} categories={categories} />
      <BottomSheet open={open === "signout"} onClose={close} title="Sign out?">
        <p className="px-5 pb-6 pt-1 text-sm text-muted">
          Your data stays safe and the bank connection keeps syncing. You'll need to sign in again to see it.
        </p>
        <SheetFooter>
          <Button variant="secondary" fullWidth onClick={close}>
            Cancel
          </Button>
          <Button
            fullWidth
            className="!bg-negative !text-canvas"
            onClick={() => {
              close();
              signOut();
            }}
          >
            Sign out
          </Button>
        </SheetFooter>
      </BottomSheet>
    </>
  );
}
