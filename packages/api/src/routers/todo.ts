import { db } from "@Aer/db";
import { todo } from "@Aer/db/schema/todo";
import { eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, router } from "../index";

const statusEnum = z.enum(["created", "completed", "cancelled", "delayed"]);
const priorityEnum = z.enum(["low", "medium", "high"]);

export const todoRouter = router({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return await db
      .select()
      .from(todo)
      .where(eq(todo.userId, ctx.session.user.id));
  }),

  create: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1),
        priority: priorityEnum.optional().default("medium"),
        dueDate: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      return await db.insert(todo).values({
        userId: ctx.session.user.id,
        text: input.text,
        status: "created",
        priority: input.priority,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        createdAt: now,
        updatedAt: now,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        text: z.string().optional(),
        status: statusEnum.optional(),
        priority: priorityEnum.optional(),
        dueDate: z.string().datetime().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const updateData: any = {
        updatedAt: new Date(),
      };
      if (input.text !== undefined) updateData.text = input.text;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.dueDate !== undefined) {
        updateData.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      }

      return await db
        .update(todo)
        .set(updateData)
        .where(eq(todo.id, input.id));
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: statusEnum }))
    .mutation(async ({ input }) => {
      return await db
        .update(todo)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(todo.id, input.id));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await db.delete(todo).where(eq(todo.id, input.id));
    }),
});
