import { env } from "@Aer/env/web";
import { Button } from "@Aer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@Aer/ui/components/dialog";
import { Input } from "@Aer/ui/components/input";
import { Label } from "@Aer/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@Aer/ui/components/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Edit2, Loader2, Trash2, X } from "lucide-react";
import { useReducer } from "react";

import { MicRecorder } from "@/components/voice-recorder";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/todos")({
  component: TodosRoute,
});

// ─── Types ────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["created", "completed", "cancelled", "delayed"] as const;
type Status = (typeof STATUS_OPTIONS)[number];
type Priority = "low" | "medium" | "high";

type TodoItem = {
  id: number;
  text: string;
  status: string;
  priority: string;
  dueDate?: Date | string | null;
};

// ─── Display maps ─────────────────────────────────────────────────────────────

const statusLabel: Record<Status, string> = {
  created: "Created",
  completed: "Completed",
  cancelled: "Cancelled",
  delayed: "Delayed",
};

const statusStyle: Record<Status, string> = {
  created: "bg-zinc-100 text-zinc-600 border-zinc-200",
  completed: "bg-green-50 text-green-700 border-green-100",
  cancelled: "bg-red-50 text-red-600 border-red-100",
  delayed: "bg-amber-50 text-amber-700 border-amber-100",
};

const priorityStyle: Record<Priority, string> = {
  low: "bg-zinc-100 text-zinc-500 border-zinc-200",
  medium: "bg-blue-50 text-blue-600 border-blue-100",
  high: "bg-orange-50 text-orange-600 border-orange-100",
};

const priorityDot: Record<Priority, string> = {
  low: "bg-zinc-300",
  medium: "bg-blue-400",
  high: "bg-orange-400",
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

type State = {
  text: string;
  priority: Priority;
  editingTodo: TodoItem | null;
  editTitle: string;
  editStatus: Status;
  editDate: string;
  editTime: string;
};

type Action =
  | { type: "SET_TEXT"; payload: string }
  | { type: "SET_PRIORITY"; payload: Priority }
  | { type: "RESET_CREATE" }
  | { type: "OPEN_EDIT"; payload: TodoItem }
  | { type: "CLOSE_EDIT" }
  | { type: "SET_EDIT_TITLE"; payload: string }
  | { type: "SET_EDIT_STATUS"; payload: Status }
  | { type: "SET_EDIT_DATE"; payload: string }
  | { type: "SET_EDIT_TIME"; payload: string };

const initialState: State = {
  text: "",
  priority: "medium",
  editingTodo: null,
  editTitle: "",
  editStatus: "created",
  editDate: "",
  editTime: "",
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_TEXT":
      return { ...state, text: action.payload };
    case "SET_PRIORITY":
      return { ...state, priority: action.payload };
    case "RESET_CREATE":
      return { ...state, text: "" };
    case "OPEN_EDIT": {
      const todo = action.payload;
      let editDate = "";
      let editTime = "";
      if (todo.dueDate) {
        const d = new Date(todo.dueDate);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        editDate = `${yyyy}-${mm}-${dd}`;
        editTime = d.toTimeString().split(" ")[0].slice(0, 5);
      }
      return {
        ...state,
        editingTodo: todo,
        editTitle: todo.text,
        editStatus: todo.status as Status,
        editDate,
        editTime,
      };
    }
    case "CLOSE_EDIT":
      return {
        ...state,
        editingTodo: null,
        editTitle: "",
        editStatus: "created",
        editDate: "",
        editTime: "",
      };
    case "SET_EDIT_TITLE":
      return { ...state, editTitle: action.payload };
    case "SET_EDIT_STATUS":
      return { ...state, editStatus: action.payload };
    case "SET_EDIT_DATE":
      return { ...state, editDate: action.payload };
    case "SET_EDIT_TIME":
      return { ...state, editTime: action.payload };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dueDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDueDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  try {
    return dueDateFormatter.format(new Date(value));
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

function TodosRoute() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { text, priority, editingTodo, editTitle, editStatus, editDate, editTime } = state;

  const todos = useQuery(trpc.todo.getAll.queryOptions());

  const createMutation = useMutation(
    trpc.todo.create.mutationOptions({
      onSuccess: () => {
        todos.refetch();
        dispatch({ type: "RESET_CREATE" });
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.todo.update.mutationOptions({
      onSuccess: () => {
        todos.refetch();
        dispatch({ type: "CLOSE_EDIT" });
      },
    }),
  );

  const deleteMutation = useMutation(
    trpc.todo.delete.mutationOptions({ onSuccess: () => todos.refetch() }),
  );

  const updateStatusMutation = useMutation(
    trpc.todo.updateStatus.mutationOptions({ onSuccess: () => todos.refetch() }),
  );

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (text.trim()) createMutation.mutate({ text, priority });
  };

  const handleSaveEdit = () => {
    if (!editingTodo) return;
    const dueDateISO = editDate
      ? new Date(editTime ? `${editDate}T${editTime}:00` : `${editDate}T00:00:00`).toISOString()
      : null;
    updateMutation.mutate({
      id: editingTodo.id,
      text: editTitle,
      status: editStatus,
      dueDate: dueDateISO,
    });
  };

  const activeTodos = todos.data?.filter((t) => t.status !== "completed" && t.status !== "cancelled") ?? [];
  const doneTodos = todos.data?.filter((t) => t.status === "completed" || t.status === "cancelled") ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-4">

        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-400 mb-1">Workspace</p>
            <h1 className="text-2xl font-semibold text-zinc-900">Todos</h1>
          </div>
          <MicRecorder
            uploadUrl={`${env.VITE_SERVER_URL}/api/audio/upload`}
            onTasksSaved={() => todos.refetch()}
          />
        </div>

        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 flex gap-2"
        >
          <Input
            value={text}
            onChange={(e) => dispatch({ type: "SET_TEXT", payload: e.target.value })}
            placeholder="Add a new task…"
            disabled={createMutation.isPending}
            className="flex-1 border-zinc-200 rounded-xl bg-zinc-50 text-sm placeholder:text-zinc-400 focus-visible:ring-1 focus-visible:ring-zinc-400"
          />
          <Select
            value={priority}
            onValueChange={(v) => dispatch({ type: "SET_PRIORITY", payload: v as Priority })}
          >
            <SelectTrigger className="w-28 rounded-xl border-zinc-200 text-sm bg-zinc-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="submit"
            disabled={createMutation.isPending || !text.trim()}
            className="rounded-xl bg-zinc-900 text-white hover:bg-zinc-700 transition-colors duration-150 text-sm px-4"
          >
            {createMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Add"
            )}
          </Button>
        </form>

        {/* Todo list */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          {todos.isLoading ? (
            <div className="flex justify-center items-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-zinc-200 border-t-zinc-600 animate-spin" />
                <p className="text-xs text-zinc-400">Loading tasks</p>
              </div>
            </div>
          ) : todos.data?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center mb-1">
                <span className="text-zinc-400 text-sm">✓</span>
              </div>
              <p className="text-sm text-zinc-400">No todos yet. Add one above.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {/* Active todos first */}
              {activeTodos.map((t) => (
                <TodoRow
                  key={t.id}
                  t={t as TodoItem}
                  onEdit={() => dispatch({ type: "OPEN_EDIT", payload: t as TodoItem })}
                  onToggle={() =>
                    updateStatusMutation.mutate({
                      id: t.id,
                      status: t.status === "completed" ? "created" : "completed",
                    })
                  }
                  onCancel={() => updateStatusMutation.mutate({ id: t.id, status: "cancelled" })}
                  onDelete={() => deleteMutation.mutate({ id: t.id })}
                />
              ))}

              {/* Completed / cancelled section */}
              {doneTodos.length > 0 && activeTodos.length > 0 && (
                <li className="px-5 py-2 bg-zinc-50">
                  <p className="text-xs uppercase tracking-widest text-zinc-400">Done</p>
                </li>
              )}
              {doneTodos.map((t) => (
                <TodoRow
                  key={t.id}
                  t={t as TodoItem}
                  onEdit={() => dispatch({ type: "OPEN_EDIT", payload: t as TodoItem })}
                  onToggle={() =>
                    updateStatusMutation.mutate({
                      id: t.id,
                      status: t.status === "completed" ? "created" : "completed",
                    })
                  }
                  onCancel={() => updateStatusMutation.mutate({ id: t.id, status: "cancelled" })}
                  onDelete={() => deleteMutation.mutate({ id: t.id })}
                  muted
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer count */}
        {(todos.data?.length ?? 0) > 0 && (
          <p className="text-xs text-zinc-400 text-center tabular-nums">
            {activeTodos.length} remaining · {doneTodos.length} done
          </p>
        )}
      </div>

      {/* Edit Modal */}
      <Dialog
        open={!!editingTodo}
        onOpenChange={(open) => !open && dispatch({ type: "CLOSE_EDIT" })}
      >
        <DialogContent className="rounded-2xl border border-zinc-200 shadow-xl bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-zinc-900">Edit task</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-title" className="text-xs text-zinc-500 uppercase tracking-wider">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => dispatch({ type: "SET_EDIT_TITLE", payload: e.target.value })}
                className="rounded-xl border-zinc-200 bg-zinc-50 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-date" className="text-xs text-zinc-500 uppercase tracking-wider">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => dispatch({ type: "SET_EDIT_DATE", payload: e.target.value })}
                  className="rounded-xl border-zinc-200 bg-zinc-50 text-sm"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-time" className="text-xs text-zinc-500 uppercase tracking-wider">Time</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editTime}
                  onChange={(e) => dispatch({ type: "SET_EDIT_TIME", payload: e.target.value })}
                  className="rounded-xl border-zinc-200 bg-zinc-50 text-sm"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-status" className="text-xs text-zinc-500 uppercase tracking-wider">Status</Label>
              <Select
                value={editStatus}
                onValueChange={(v) => dispatch({ type: "SET_EDIT_STATUS", payload: v as Status })}
              >
                <SelectTrigger id="edit-status" className="rounded-xl border-zinc-200 bg-zinc-50 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => dispatch({ type: "CLOSE_EDIT" })}
              className="rounded-xl border-zinc-200 text-zinc-600 hover:bg-zinc-50 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              className="rounded-xl bg-zinc-900 text-white hover:bg-zinc-700 transition-colors duration-150 text-sm"
            >
              {updateMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── TodoRow sub-component ────────────────────────────────────────────────────

function TodoRow({
  t,
  onEdit,
  onToggle,
  onCancel,
  onDelete,
  muted = false,
}: {
  t: TodoItem;
  onEdit: () => void;
  onToggle: () => void;
  onCancel: () => void;
  onDelete: () => void;
  muted?: boolean;
}) {
  const due = formatDueDate(t.dueDate);
  const isCompleted = t.status === "completed";

  return (
    <li className="group flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-50 transition-colors duration-150">
      {/* Circle toggle */}
      <button
        type="button"
        aria-label={isCompleted ? "Mark as created" : "Mark as completed"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200
          ${isCompleted
            ? "bg-green-500 border-green-500"
            : "border-zinc-300 hover:border-zinc-500 bg-white"
          }`}
      >
        {isCompleted && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Priority dot */}
      <span
        className={`shrink-0 w-1.5 h-1.5 rounded-full ${priorityDot[t.priority as Priority] ?? "bg-zinc-300"}`}
      />

      {/* Text */}
      <button
        type="button"
        className="flex flex-1 flex-col gap-0.5 text-left min-w-0"
        onClick={onEdit}
      >
        <span
          className={`text-sm leading-snug truncate transition-colors duration-150 ${
            muted ? "text-zinc-400 line-through" : "text-zinc-800"
          }`}
        >
          {t.text}
        </span>
        {due && (
          <span className="text-xs text-zinc-400">Due {due}</span>
        )}
      </button>

      {/* Badges */}
      <span
        className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border
          ${statusStyle[t.status as Status] ?? statusStyle.created}`}
      >
        {statusLabel[t.status as Status] ?? t.status}
      </span>
      <span
        className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border
          ${priorityStyle[t.priority as Priority] ?? priorityStyle.medium}`}
      >
        {t.priority}
      </span>

      {/* Actions — fade in on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
        <button
          type="button"
          aria-label="Edit task"
          onClick={onEdit}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all duration-150"
        >
          <Edit2 className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Cancel task"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition-all duration-150"
        >
          <X className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Delete task"
          onClick={onDelete}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-all duration-150"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}