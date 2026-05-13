import { db } from "@Aer/db";
import { todo } from "@Aer/db/schema/todo";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../index";

export type Task = typeof todo.$inferSelect;

const now = () => new Date();

const isToday = (date?: Date | null) => {
  if (!date) return false;
  const t = new Date();
  return (
    date.getDate() === t.getDate() &&
    date.getMonth() === t.getMonth() &&
    date.getFullYear() === t.getFullYear()
  );
};

export function getNeedsAttention(tasks: Task[]) {
  const current = now();
  return tasks.filter(
    (t) =>
      t.status === "delayed" ||
      (t.dueDate && t.dueDate < current && t.status !== "completed")
  );
}

export function getHighPriority(tasks: Task[]) {
  return tasks.filter(
    (t) => t.priority === "high" && t.status !== "completed"
  );
}

export function getQuickWins(tasks: Task[]) {
  return tasks.filter(
    (t) => t.priority === "low" && t.status !== "completed"
  );
}

export function getAgingTasks(tasks: Task[]) {
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  const current = now().getTime();

  return tasks.filter(
    (t) =>
      t.dueDate &&
      current - t.dueDate.getTime() > THREE_DAYS &&
      t.status !== "completed"
  );
}

export function getTodayTasks(tasks: Task[]) {
  return tasks.filter((t) => isToday(t.dueDate));
}

export function getCompletionStats(tasks: Task[]) {
  const completed = tasks.filter((t) => t.status === "completed");

  const onTime = completed.filter(
    (t) => t.dueDate && t.updatedAt <= t.dueDate
  );

  const avgTime =
    completed.length === 0
      ? 0
      : completed.reduce(
        (acc, t) => acc + (t.updatedAt.getTime() - t.createdAt.getTime()),
        0
      ) / completed.length;

  return {
    completionRate:
      completed.length === 0
        ? 0
        : Math.round((onTime.length / completed.length) * 100),
    avgCompletionTime: Number((avgTime / (1000 * 60 * 60)).toFixed(1)), // hours
  };
}

export function getDelayFrequency(tasks: Task[]) {
  return tasks.filter((t) => t.status === "delayed").length;
}

export const analyticsRouter = router({
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const tasks = await db
      .select()
      .from(todo)
      .where(eq(todo.userId, ctx.session.user.id));

    return {
      needsAttention: getNeedsAttention(tasks),
      highPriority: getHighPriority(tasks),
      quickWins: getQuickWins(tasks),
      aging: getAgingTasks(tasks),
      today: getTodayTasks(tasks),
      stats: getCompletionStats(tasks),
      delays: getDelayFrequency(tasks),
    };
  }),
});
