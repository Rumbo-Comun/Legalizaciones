import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settlements = sqliteTable("settlements", {
  id: text("id").primaryKey(),
  employee: text("employee").notNull(),
  department: text("department").notNull().default(""),
  fundCode: text("fund_code").notNull().default(""),
  depositDate: text("deposit_date").notNull().default(""),
  depositReference: text("deposit_reference").notNull().default(""),
  depositSource: text("deposit_source").notNull().default(""),
  periodStart: text("period_start").notNull().default(""),
  periodEnd: text("period_end").notNull().default(""),
  status: text("status").notNull().default("borrador"),
  advanceCents: integer("advance_cents").notNull().default(0),
  cashReturnedCents: integer("cash_returned_cents").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  settlementId: text("settlement_id")
    .notNull()
    .references(() => settlements.id, { onDelete: "cascade" }),
  date: text("date").notNull().default(""),
  category: text("category").notNull().default(""),
  vendor: text("vendor").notNull().default(""),
  invoice: text("invoice").notNull().default(""),
  description: text("description").notNull().default(""),
  amountCents: integer("amount_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  paymentMethod: text("payment_method").notNull().default("efectivo"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const evidences = sqliteTable("evidences", {
  id: text("id").primaryKey(),
  settlementId: text("settlement_id")
    .notNull()
    .references(() => settlements.id, { onDelete: "cascade" }),
  expenseId: text("expense_id").references(() => expenses.id, {
    onDelete: "set null",
  }),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  r2Key: text("r2_key").notNull(),
  uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
