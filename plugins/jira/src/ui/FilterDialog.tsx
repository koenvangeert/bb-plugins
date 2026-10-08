import { useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EMPTY_VALUE, FILTER_FIELDS, filterField, type FieldId, type Filter, type FilterValue } from "../filterFields";
import { quoteLiteral } from "../filterJql";
import type { rpcContract, TicketList, TicketTab } from "../rpc";
import { TICKET_LIMIT } from "../tickets";
import { errorMessage } from "../errorMessage";

const OPERATORS: Filter["operator"][] = ["in", "not in"];

function ValueCheckbox({ value, checked, onToggle }: { value: FilterValue; checked: boolean; onToggle(): void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      {value.label}
    </label>
  );
}

function dropdownOptions(offered: FilterValue[], selected: FilterValue[]): FilterValue[] {
  const known = new Set(offered.map((value) => value.jql));
  const real = offered.filter((value) => value.jql !== EMPTY_VALUE.jql);
  const missing = selected.filter((value) => !known.has(value.jql) && value.jql !== EMPTY_VALUE.jql);
  return [...real, ...missing, EMPTY_VALUE];
}

export function FilterDialog({
  tab,
  index,
  onSaved,
  onOpenChange,
}: {
  tab: TicketTab;
  index: number | null;
  onSaved(list: TicketList): void;
  onOpenChange(open: boolean): void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const existing = index === null ? undefined : tab.filters[index];
  const [fieldId, setFieldId] = useState<FieldId>(existing?.field ?? FILTER_FIELDS[0].id);
  const [operator, setOperator] = useState<Filter["operator"]>(existing?.operator ?? "in");
  const [values, setValues] = useState<FilterValue[]>(existing?.values ?? []);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = filterField(fieldId);
  const draftValue = field.searchable || !draft.trim() ? null : { label: draft.trim(), jql: quoteLiteral(draft.trim()) };
  const canApply = (values.length > 0 || draftValue !== null) && !saving;
  const close = (open: boolean) => {
    if (!saving) onOpenChange(open);
  };

  const isSelected = (value: FilterValue) => values.some((entry) => entry.jql === value.jql);
  const toggle = (value: FilterValue) =>
    setValues((current) => (isSelected(value) ? current.filter((entry) => entry.jql !== value.jql) : [...current, value]));

  const withDraft = (current: FilterValue[]) =>
    draftValue && !current.some((entry) => entry.jql === draftValue.jql) ? [...current, draftValue] : current;

  const addDraft = () => {
    setValues(withDraft);
    setDraft("");
  };

  const apply = async () => {
    if (!canApply) return;
    const filter: Filter = { field: field.id, label: field.name, operator, values: withDraft(values) };
    const filters = index === null ? [...tab.filters, filter] : tab.filters.map((entry, at) => (at === index ? filter : entry));
    setSaving(true);
    setError(null);
    try {
      onSaved(await rpc.call("setFilters", { id: tab.id, filters }));
      onOpenChange(false);
    } catch (cause) {
      setError(errorMessage(cause));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit filter ${existing.label}` : "Add filter"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Field
            <select
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              value={fieldId}
              onChange={(event) => {
                setFieldId(event.target.value as FieldId);
                setValues([]);
              }}
            >
              {FILTER_FIELDS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="Operator" className="flex gap-1">
            {OPERATORS.map((entry) => (
              <Button
                key={entry}
                type="button"
                size="sm"
                variant={operator === entry ? "default" : "outline"}
                aria-pressed={operator === entry}
                onClick={() => setOperator(entry)}
              >
                {entry}
              </Button>
            ))}
          </div>
          {field.searchable ? (
            <fieldset className="m-0 flex max-h-64 flex-col gap-1.5 overflow-y-auto border-0 p-0">
              <legend className="mb-1.5 text-sm">Values</legend>
              {dropdownOptions(tab.fieldValues[field.id] ?? [], values).map((value) => (
                <ValueCheckbox key={value.jql} value={value} checked={isSelected(value)} onToggle={() => toggle(value)} />
              ))}
              {tab.valuesLimitReached ? (
                <p className="m-0 text-xs text-muted-foreground">Values come from the first {TICKET_LIMIT} tickets of the tab.</p>
              ) : null}
            </fieldset>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1 text-sm">
                Value
                <Input
                  value={draft}
                  placeholder="Type a value and press Enter"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    addDraft();
                  }}
                />
              </label>
              <ul aria-label="Values" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {values
                  .filter((value) => value.jql !== EMPTY_VALUE.jql)
                  .map((value) => (
                    <li key={value.jql} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                      {value.label}
                      <button
                        type="button"
                        aria-label={`Remove value ${value.label}`}
                        className="cursor-pointer text-muted-foreground hover:text-foreground"
                        onClick={() => toggle(value)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
              </ul>
              <ValueCheckbox value={EMPTY_VALUE} checked={isSelected(EMPTY_VALUE)} onToggle={() => toggle(EMPTY_VALUE)} />
            </div>
          )}
          {error ? (
            <p role="alert" className="m-0 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canApply} onClick={() => void apply()}>
            {saving ? "Checking filter…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
