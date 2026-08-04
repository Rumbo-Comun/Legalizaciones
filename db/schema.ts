import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("revisor"),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settlements = sqliteTable("settlements", {
  id: text("id").primaryKey(),
  employee: text("employee").notNull(),
  department: text("department").notNull().default(""),
  fundCode: text("fund_code").notNull().default(""),
  fundType: text("fund_type").notNull().default("caja menor"),
  projectName: text("project_name").notNull().default(""),
  depositDate: text("deposit_date").notNull().default(""),
  depositReference: text("deposit_reference").notNull().default(""),
  depositSource: text("deposit_source").notNull().default(""),
  periodStart: text("period_start").notNull().default(""),
  periodEnd: text("period_end").notNull().default(""),
  status: text("status").notNull().default("borrador"),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  currency: text("currency").notNull().default("COP"),
  advanceCents: integer("advance_cents").notNull().default(0),
  cashReturnedCents: integer("cash_returned_cents").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settlementAccess = sqliteTable("settlement_access", {
  id: text("id").primaryKey(),
  settlementId: text("settlement_id")
    .notNull()
    .references(() => settlements.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  permission: text("permission").notNull().default("revisar"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reviewComments = sqliteTable("review_comments", {
  id: text("id").primaryKey(),
  settlementId: text("settlement_id")
    .notNull()
    .references(() => settlements.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  comment: text("comment").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
