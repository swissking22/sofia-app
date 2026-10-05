import React from "react";
import { useRouter } from "next/router";
import { Add01Icon } from "@hugeicons/core-free-icons";
import {
  FormField,
  FormSection,
  FormSelect,
  SetupFooter,
} from "../../components/setup";
import {
  SetupShell,
  useSetupProgress,
} from "../../components/setup/SetupShell";
import { Icon } from "../../components/ui/Icon";
import {
  CURRENCY_OPTIONS,
  fetchFinanceSetup,
  formatMoney,
  PAYMENT_METHOD_OPTIONS,
  saveFinanceSetup,
  type FeeCategoryDto,
  type FeeStructureRow,
  type FinanceSetup,
  type PaymentMethodKey,
} from "../../lib/finance";
import {
  completeSetupStep,
  getNextSetupHref,
  saveSetupDraft,
} from "../../lib/setup";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-(--sofia-primary) focus:ring-2 focus:ring-(--sofia-primary)/15";

export default function FinanceSetupPage() {
  return (
    <SetupShell stepId="finance" aside={<FinanceAside />}>
      <FinanceSetupForm />
    </SetupShell>
  );
}

function FinanceAside() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Used for</h3>
      <p className="mt-1 text-xs text-slate-500">
        Fee categories and level amounts drive billing, invoices, and receipts.
      </p>
      <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Student billing
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Payment collection
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--sofia-primary)" />
          Official receipts
        </li>
      </ul>
    </div>
  );
}

type CategoryDraft = FeeCategoryDto & { isNew?: boolean };

function FinanceSetupForm() {
  const router = useRouter();
  const { refreshProgress } = useSetupProgress();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [draftSaving, setDraftSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [categories, setCategories] = React.useState<CategoryDraft[]>([]);
  const [structure, setStructure] = React.useState<FeeStructureRow[]>([]);
  const [currency, setCurrency] = React.useState("XAF");
  const [methods, setMethods] = React.useState<PaymentMethodKey[]>([
    "cash",
    "mobile_money",
    "bank_transfer",
  ]);
  const [receiptPrefix, setReceiptPrefix] = React.useState("RCP");
  const [receiptNext, setReceiptNext] = React.useState("1");
  const [expandedLevel, setExpandedLevel] = React.useState<string | null>(null);
  const [categorySearch, setCategorySearch] = React.useState("");
  const [categoryStatus, setCategoryStatus] = React.useState<
    "" | "active" | "inactive"
  >("");

  const applyData = React.useCallback((data: FinanceSetup) => {
    setCategories(data.categories);
    setStructure(data.structure);
    setCurrency(data.currency);
    setMethods(data.payment_methods);
    setReceiptPrefix(data.receipt_prefix);
    setReceiptNext(String(data.receipt_next_number));
    setExpandedLevel(
      (prev) => prev ?? data.structure[0]?.academic_level_id ?? null,
    );
  }, []);

  React.useEffect(() => {
    void (async () => {
      const res = await fetchFinanceSetup();
      if (res.ok) applyData(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, [applyData]);

  const activeCategories = categories.filter((c) => c.is_active);
  const filteredCategories = React.useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    return categories.filter((c) => {
      if (categoryStatus === "active" && !c.is_active) return false;
      if (categoryStatus === "inactive" && c.is_active) return false;
      if (!q) return true;
      return `${c.name} ${c.category_key}`.toLowerCase().includes(q);
    });
  }, [categories, categorySearch, categoryStatus]);
  const receiptExample = `${receiptPrefix.trim().toUpperCase() || "RCP"}-${String(
    Math.max(1, Number(receiptNext) || 1),
  ).padStart(5, "0")}`;

  function toggleCategory(id: string) {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_active: !c.is_active } : c)),
    );
  }

  function addCustomCategory() {
    const localId = `local-${Date.now()}`;
    setCategories((prev) => [
      ...prev,
      {
        id: localId,
        name: "",
        category_key: "",
        is_system: false,
        is_active: true,
        sort_order: prev.length + 1,
        isNew: true,
      },
    ]);
  }

  function setAmount(levelId: string, categoryId: string, value: string) {
    const amount = Math.max(0, Number(value.replace(/,/g, "")) || 0);
    setStructure((prev) =>
      prev.map((row) =>
        row.academic_level_id === levelId
          ? {
              ...row,
              amounts: { ...row.amounts, [categoryId]: amount },
            }
          : row,
      ),
    );
  }

  function toggleMethod(key: PaymentMethodKey) {
    setMethods((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function buildInput() {
    const amounts: Array<{
      academic_level_id: string;
      fee_category_id: string;
      amount: number;
    }> = [];
    for (const row of structure) {
      for (const cat of categories) {
        if (!cat.is_active || cat.isNew) continue;
        amounts.push({
          academic_level_id: row.academic_level_id,
          fee_category_id: cat.id,
          amount: row.amounts[cat.id] ?? 0,
        });
      }
    }

    return {
      categories: categories
        .filter((c) => c.name.trim() || c.is_system)
        .map((c) => ({
          id: c.isNew ? null : c.id,
          name: c.name.trim() || c.category_key,
          category_key: c.category_key || null,
          is_active: c.is_active,
        })),
      amounts,
      currency,
      payment_methods: methods,
      receipt_prefix: receiptPrefix.trim().toUpperCase() || "RCP",
      receipt_next_number: Math.max(1, Number(receiptNext) || 1),
    };
  }

  async function persist(): Promise<boolean> {
    if (!methods.length) {
      setError("Select at least one payment method.");
      return false;
    }
    if (!categories.some((c) => c.is_active)) {
      setError("Enable at least one fee category.");
      return false;
    }
    const res = await saveFinanceSetup(buildInput());
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    applyData(res.data);
    return true;
  }

  async function handleSaveDraft() {
    setDraftSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      const draft = await saveSetupDraft("finance");
      if (!draft.ok) {
        setError(draft.error);
        return;
      }
      await refreshProgress();
      setSuccess("Finance draft saved.");
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleContinue() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!(await persist())) return;
      const done = await completeSetupStep("finance");
      if (!done.ok) {
        setError(done.error);
        return;
      }
      await refreshProgress();
      await router.push(getNextSetupHref("finance"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading finance setup…</p>;
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <FormSection
        title="Fee Categories"
        description="Enable the fee types your school charges. System defaults can be toggled."
        layout="stack"
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            className={`${inputClass} min-w-48 flex-1`}
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            placeholder="Filter categories…"
          />
          <select
            className={inputClass}
            value={categoryStatus}
            onChange={(e) =>
              setCategoryStatus(
                e.target.value === "active" || e.target.value === "inactive"
                  ? e.target.value
                  : "",
              )
            }
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {filteredCategories.length === 0 ? (
            <p className="col-span-full text-sm text-slate-500">
              No categories match these filters.
            </p>
          ) : (
            filteredCategories.map((cat) => (
              <div
                key={cat.id}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${
                  cat.is_active
                    ? "border-(--sofia-primary)/30 bg-(--sofia-primary)/5"
                    : "border-slate-200 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={cat.is_active}
                  onChange={() => toggleCategory(cat.id)}
                  className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
                />
                {cat.is_system || !cat.isNew ? (
                  <span className="flex-1 text-sm font-medium text-slate-900">
                    {cat.name}
                    {cat.is_system ? (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Default
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <input
                    value={cat.name}
                    onChange={(e) =>
                      setCategories((prev) =>
                        prev.map((c) =>
                          c.id === cat.id ? { ...c, name: e.target.value } : c,
                        ),
                      )
                    }
                    placeholder="Category name"
                    className={`${inputClass} flex-1`}
                  />
                )}
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={addCustomCategory}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-(--sofia-primary) hover:underline"
        >
          <Icon icon={Add01Icon} size={14} />
          Add custom category
        </button>
      </FormSection>

      <FormSection
        title="Fee Structure"
        description="Set amounts per academic level. Leave blank or 0 if not charged."
        layout="stack"
      >
        {structure.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
            No academic levels yet. Complete Academic Structure first to assign
            class-level fees.
          </p>
        ) : (
          <div className="space-y-2">
            {structure.map((row) => {
              const open = expandedLevel === row.academic_level_id;
              const total = activeCategories.reduce(
                (sum, cat) => sum + (row.amounts[cat.id] ?? 0),
                0,
              );
              return (
                <div
                  key={row.academic_level_id}
                  className="overflow-hidden rounded-xl border border-slate-200/80"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedLevel(open ? null : row.academic_level_id)
                    }
                    className="flex w-full cursor-pointer items-center justify-between gap-3 bg-slate-50/80 px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold text-slate-900">
                      {row.level_name}
                    </span>
                    <span className="text-xs text-slate-500">
                      Total {formatMoney(total, currency)}
                    </span>
                  </button>
                  {open ? (
                    <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-4 sm:grid-cols-2">
                      {activeCategories.map((cat) => (
                        <label key={cat.id} className="block text-sm">
                          <span className="mb-1.5 block font-medium text-slate-700">
                            {cat.name}
                          </span>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              step={100}
                              value={row.amounts[cat.id] ?? 0}
                              onChange={(e) =>
                                setAmount(
                                  row.academic_level_id,
                                  cat.id,
                                  e.target.value,
                                )
                              }
                              className={inputClass}
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                              {currency}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </FormSection>

      <FormSection
        title="Payment Settings"
        description="Currency, accepted methods, and receipt numbering."
      >
        <FormSelect
          label="Currency"
          options={[...CURRENCY_OPTIONS]}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          placeholder="Select currency"
        />
        <FormField
          label="Receipt prefix"
          value={receiptPrefix}
          onChange={(e) =>
            setReceiptPrefix(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 8),
            )
          }
          placeholder="RCP"
          hint={`Next receipt: ${receiptExample}`}
        />
        <FormField
          label="Next receipt number"
          type="number"
          min={1}
          value={receiptNext}
          onChange={(e) => setReceiptNext(e.target.value)}
        />
        <div className="mb-4 sm:col-span-2">
          <p className="mb-2 text-sm font-medium text-slate-700">
            Payment methods
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PAYMENT_METHOD_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm ${
                  methods.includes(opt.key)
                    ? "border-(--sofia-primary)/30 bg-(--sofia-primary)/5"
                    : "border-slate-200 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={methods.includes(opt.key)}
                  onChange={() => toggleMethod(opt.key)}
                  className="h-4 w-4 rounded border-slate-300 text-(--sofia-primary)"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      </FormSection>

      <SetupFooter
        stepId="finance"
        onSaveDraft={() => void handleSaveDraft()}
        onContinue={() => void handleContinue()}
        saving={saving}
        draftSaving={draftSaving}
      />
    </div>
  );
}
