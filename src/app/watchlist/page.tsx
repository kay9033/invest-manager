"use client";

import { useState, useEffect, useCallback } from "react";
import StatusBadge from "@/components/StatusBadge";

type AiStatus = "WAITING" | "BUY" | "WATCH" | "SELL";

interface WatchlistItem {
  id: number;
  code: string;
  name: string;
  addedAt: string | null;
  addReason: string | null;
  aiStatus: AiStatus | null;
  aiComment: string | null;
  memo: string | null;
  updatedAt: string | null;
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [judging, setJudging] = useState<Record<number, boolean>>({});
  const [editingMemo, setEditingMemo] = useState<Record<number, string>>({});
  const [savingMemo, setSavingMemo] = useState<Record<number, boolean>>({});

  const fetchWatchlist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as WatchlistItem[];
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  async function handleJudge(id: number) {
    setJudging((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlistId: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      await fetchWatchlist();
    } catch (err) {
      alert(`AI判定失敗: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setJudging((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleJudgeAll() {
    const waitingItems = items.filter((i) => i.aiStatus === "WAITING");
    for (const item of waitingItems) {
      await handleJudge(item.id);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("この銘柄を監視リストから削除しますか？")) return;
    try {
      const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      alert(`削除失敗: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleSaveMemo(id: number, memo: string) {
    setSavingMemo((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/watchlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, memo } : i))
      );
      setEditingMemo((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      alert(
        `メモ保存失敗: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setSavingMemo((prev) => ({ ...prev, [id]: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">監視リスト</h1>
          <p className="mt-1 text-sm text-gray-400">
            {items.length}銘柄を監視中
          </p>
        </div>
        <div className="flex items-center gap-3">
          {items.some((i) => i.aiStatus === "WAITING") && (
            <button
              onClick={handleJudgeAll}
              className="px-4 py-2 text-sm bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition-colors"
            >
              一括AI判定
            </button>
          )}
          <a href="/" className="text-sm text-gray-400 hover:text-white">
            ← ホーム
          </a>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
          エラー: {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-24 text-gray-500">
          <p>監視リストに銘柄がありません。</p>
          <a
            href="/scan"
            className="mt-4 inline-block text-emerald-400 hover:underline"
          >
            スキャンページから追加する →
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isEditingMemo = item.id in editingMemo;
            return (
              <div
                key={item.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3"
              >
                {/* ヘッダー行 */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-emerald-400 text-lg">
                      {item.code}
                    </span>
                    <span className="font-medium text-white">{item.name}</span>
                    <StatusBadge status={item.aiStatus} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleJudge(item.id)}
                      disabled={judging[item.id]}
                      className="px-3 py-1.5 text-xs bg-purple-800 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors"
                    >
                      {judging[item.id] ? "判定中..." : "AI判定"}
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="px-3 py-1.5 text-xs bg-red-900 hover:bg-red-800 text-red-300 rounded-md transition-colors"
                    >
                      削除
                    </button>
                  </div>
                </div>

                {/* AI判定結果 */}
                {item.aiComment && (
                  <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-300">
                    <span className="text-xs text-gray-500 block mb-1">
                      AI判定コメント
                    </span>
                    {item.aiComment}
                  </div>
                )}

                {/* メタ情報 */}
                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                  {item.addedAt && (
                    <span>追加日: {item.addedAt.split("T")[0]}</span>
                  )}
                  {item.addReason && <span>理由: {item.addReason}</span>}
                </div>

                {/* メモ */}
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">メモ</p>
                  {isEditingMemo ? (
                    <div className="flex gap-2">
                      <textarea
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-emerald-500"
                        rows={2}
                        value={editingMemo[item.id]}
                        onChange={(e) =>
                          setEditingMemo((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() =>
                            handleSaveMemo(item.id, editingMemo[item.id])
                          }
                          disabled={savingMemo[item.id]}
                          className="px-3 py-1 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-md"
                        >
                          {savingMemo[item.id] ? "保存中..." : "保存"}
                        </button>
                        <button
                          onClick={() =>
                            setEditingMemo((prev) => {
                              const next = { ...prev };
                              delete next[item.id];
                              return next;
                            })
                          }
                          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() =>
                        setEditingMemo((prev) => ({
                          ...prev,
                          [item.id]: item.memo ?? "",
                        }))
                      }
                      className="min-h-[2rem] bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 cursor-pointer transition-colors"
                    >
                      {item.memo || (
                        <span className="text-gray-600">
                          クリックしてメモを追加...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
