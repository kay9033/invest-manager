type AiStatus = "WAITING" | "BUY" | "WATCH" | "SELL";

interface StatusBadgeProps {
  status: AiStatus | null;
}

const STATUS_CONFIG: Record<
  AiStatus,
  { label: string; className: string }
> = {
  BUY: {
    label: "BUY",
    className: "bg-emerald-900 text-emerald-300 border border-emerald-700",
  },
  WATCH: {
    label: "WATCH",
    className: "bg-yellow-900 text-yellow-300 border border-yellow-700",
  },
  SELL: {
    label: "SELL",
    className: "bg-red-900 text-red-300 border border-red-700",
  },
  WAITING: {
    label: "WAITING",
    className: "bg-gray-800 text-gray-400 border border-gray-700",
  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status ?? "WAITING"];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
