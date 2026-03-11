import React from "react";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold text-emerald-400 border-b border-gray-800 pb-2">{title}</h2>
      {children}
    </section>
  );
}

export function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {children}
    </div>
  );
}

export function Tag({ color, children }: { color: "red" | "yellow" | "green" | "gray"; children: React.ReactNode }) {
  const cls = {
    red: "bg-red-900/40 text-red-300 border border-red-800",
    yellow: "bg-yellow-900/40 text-yellow-300 border border-yellow-800",
    green: "bg-emerald-900/40 text-emerald-300 border border-emerald-800",
    gray: "bg-gray-800 text-gray-400 border border-gray-700",
  }[color];
  return <span className={`inline-block text-xs px-2 py-0.5 rounded font-mono ${cls}`}>{children}</span>;
}

export function RulesTable({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700">
            {headers.map((h, i) => (
              <th key={i} className="text-left py-2 px-3 text-xs text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-3 text-gray-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
