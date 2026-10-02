import { useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Filter } from "../filterFields";
import type { rpcContract, TicketList, TicketTab } from "../rpc";
import { errorMessage } from "../errorMessage";

export function filterText(filter: Filter): string {
  const values = filter.values.map((value) => value.label).join(", ");
  return `${filter.label}${filter.operator === "not in" ? " not" : ""}: ${values}`;
}

export function FilterBar({
  tab,
  onChanged,
  onEdit,
}: {
  tab: TicketTab;
  onChanged(list: TicketList): void;
  onEdit(index: number | null): void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (index: number) => {
    setRemoving(true);
    setError(null);
    try {
      onChanged(await rpc.call("setFilters", { id: tab.id, filters: tab.filters.filter((_, at) => at !== index) }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <ul aria-label="Filters" className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
        {tab.filters.map((filter, index) => (
          <li key={index} className="flex items-center rounded-full border border-border bg-card text-xs">
            <button
              type="button"
              className="max-w-80 cursor-pointer truncate py-1 pl-3 pr-1.5 hover:text-primary disabled:cursor-default"
              disabled={removing}
              onClick={() => onEdit(index)}
            >
              {filterText(filter)}
            </button>
            <button
              type="button"
              aria-label={`Remove filter ${filter.label}`}
              className="cursor-pointer rounded-full p-1 pr-2 text-muted-foreground hover:text-foreground disabled:cursor-default"
              disabled={removing}
              onClick={() => void remove(index)}
            >
              <Icon name="X" className="size-3" aria-hidden />
            </button>
          </li>
        ))}
        <li>
          <Button size="sm" variant="ghost" aria-label="Add filter" disabled={removing} onClick={() => onEdit(null)}>
            <Icon name="FilterHorizontal" aria-hidden />
            Filter
          </Button>
        </li>
      </ul>
      {error ? (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
