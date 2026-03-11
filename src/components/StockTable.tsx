"use client";

import { useState, useMemo } from "react";

export interface StockColumn<T> {
  key: keyof T | string;
  label: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
}

interface StockTableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: StockColumn<T>[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  defaultSortKey?: string;
  defaultSortDir?: SortDir;
}

type SortDir = "asc" | "desc";

export default function StockTable<T extends Record<string, unknown>>({
  data,
  columns,
  emptyMessage = "データがありません",
  onRowClick,
  defaultSortKey,
  defaultSortDir,
}: StockTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir ?? "desc");

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900">
            {columns.map((col) => {
              const key = col.key as string;
              const isActive = sortKey === key;
              return (
                <th
                  key={key}
                  onClick={col.sortable ? () => handleSort(key) : undefined}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap ${
                    col.sortable
                      ? "cursor-pointer hover:text-white select-none"
                      : ""
                  } ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""}`}
                >
                  {col.label}
                  {col.sortable && (
                    <span className="ml-1 text-gray-600">
                      {isActive ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {sortedData.map((row, idx) => (
            <tr
              key={idx}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`bg-gray-950 hover:bg-gray-900 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
            >
              {columns.map((col) => {
                const key = col.key as string;
                const value = row[key];
                return (
                  <td
                    key={key}
                    className={`px-4 py-3 text-gray-200 whitespace-nowrap ${
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                          ? "text-center"
                          : ""
                    }`}
                  >
                    {col.render ? col.render(value, row) : String(value ?? "-")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
