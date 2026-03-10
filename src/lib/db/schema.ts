import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const stocks = sqliteTable("stocks", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  market: text("market"),
  sector: text("sector"),
  sales: real("sales"),
  salesGrowthRate: real("sales_growth_rate"),
  eps: real("eps"),
  epsGrowthRate: real("eps_growth_rate"),
  marketCap: real("market_cap"),
  // 財務ページ由来
  roe: real("roe"),
  marginRatio: real("margin_ratio"),
  hasUpwardRevision: integer("has_upward_revision", { mode: "boolean" }),
  epsAccelerating: integer("eps_accelerating", { mode: "boolean" }),
  salesAccelerating: integer("sales_accelerating", { mode: "boolean" }),
  operatingMarginImproving: integer("operating_margin_improving", { mode: "boolean" }),
  hasInstitutionalIncrease: integer("has_institutional_increase", { mode: "boolean" }),
  annualEpsGrowths: text("annual_eps_growths"), // JSON配列
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const scans = sqliteTable("scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code")
    .notNull()
    .references(() => stocks.code),
  scanDate: text("scan_date").notNull(),
  closePrice: real("close_price"),
  volume: real("volume"),
  avgVolume25: real("avg_volume_25"),
  isNewHigh: integer("is_new_high", { mode: "boolean" }).default(false),
  volumeRatio: real("volume_ratio"),
  tradingValue: real("trading_value"),
  rs3m: real("rs3m"),
  rs6m: real("rs6m"),
  score: integer("score"),
  reasons: text("reasons"), // JSON配列
  passed: integer("passed", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const watchlist = sqliteTable("watchlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code")
    .notNull()
    .references(() => stocks.code),
  addedAt: text("added_at").default(sql`(datetime('now'))`),
  addReason: text("add_reason"),
  aiStatus: text("ai_status", {
    enum: ["WAITING", "BUY", "WATCH", "SELL"],
  }).default("WAITING"),
  aiComment: text("ai_comment"),
  memo: text("memo"),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});
