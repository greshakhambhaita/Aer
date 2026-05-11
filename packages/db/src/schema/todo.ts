import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const todo = sqliteTable("todo", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  text: text("text").notNull(),
  status: text("status").notNull().default("created"),
  priority: text("priority").notNull().default("medium"),
  dueDate: integer("due_date", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});