import { Badge } from "@Aer/ui/components/badge";
import { Button } from "@Aer/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@Aer/ui/components/card";
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
import { Edit2, Loader2, Trash2 } from "lucide-react";
import { useReducer } from "react";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/todos")({
  component: TodosRoute,
});

// ─── Types ────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["created", "completed", "cancelled", "delayed"] as const;
type Status = (typeof STATUS_OPTIONS)[number];
type Priority = "low" | "medium" | "high";

// Minimal shape needed from the query result
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

const statusVariant: Record<Status, "outline" | "default" | "destructive" | "secondary"> = {
  created: "outline",
  completed: "default",
  cancelled: "destructive",
  delayed: "secondary",
};

const priorityVariant: Record<Priority, "outline" | "secondary" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

type State = {
  text: string;
  priority: Priority;
  editingTodo: TodoItem | null;
  // Edit form — derived from editingTodo on OPEN_EDIT, not stored separately
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
      // Derive edit fields here — no useEffect needed
      const todo = action.payload;
      let editDate = "";
      let editTime = "";
      if (todo.dueDate) {
        const d = new Date(todo.dueDate);
        editDate = d.toISOString().split("T")[0];
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

// Hoisted to module scope — Intl constructors are expensive (dozens of objects
// per locale lookup), recreating them per call wastes memory needlessly.
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

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (text.trim()) createMutation.mutate({ text, priority });
  };

  const handleSaveEdit = () => {
    if (!editingTodo) return;
    const dueDateISO = editDate
      ? new Date(editTime ? `${editDate}T${editTime}:00` : `${editDate}T00:00:00`).toISOString()
      : null;
    updateMutation.mutate({ id: editingTodo.id, text: editTitle, status: editStatus, dueDate: dueDateISO });
  };

  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <Card>
        <CardHeader>
          <CardTitle className="font-semibold">Todos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add form */}
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => dispatch({ type: "SET_TEXT", payload: e.target.value })}
              placeholder="New task…"
              disabled={createMutation.isPending}
              className="flex-1"
            />
            <Select
              value={priority}
              onValueChange={(v) => dispatch({ type: "SET_PRIORITY", payload: v as Priority })}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={createMutation.isPending || !text.trim()}>
              {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Add"}
            </Button>
          </form>

          {/* List */}
          {todos.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : todos.data?.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No todos yet.</p>
          ) : (
            <ul className="space-y-2">
              {todos.data?.map((t) => {
                const due = formatDueDate(t.dueDate);
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50"
                  >
                    {/* Accessible: button instead of div */}
                    <button
                      type="button"
                      className="flex flex-1 flex-col gap-1 text-left"
                      onClick={() => dispatch({ type: "OPEN_EDIT", payload: t as TodoItem })}
                    >
                      <span
                        className={`text-sm font-medium ${t.status === "completed" ? "text-muted-foreground line-through" : ""}`}
                      >
                        {t.text}
                      </span>
                      {due && (
                        <span className="text-xs text-muted-foreground">Due: {due}</span>
                      )}
                    </button>

                    <Badge variant={statusVariant[t.status as Status] ?? "outline"}>
                      {statusLabel[t.status as Status] ?? t.status}
                    </Badge>

                    <Badge variant={priorityVariant[t.priority as Priority]}>
                      {t.priority}
                    </Badge>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit todo"
                        onClick={() => dispatch({ type: "OPEN_EDIT", payload: t as TodoItem })}
                      >
                        <Edit2 className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete todo"
                        onClick={() => deleteMutation.mutate({ id: t.id })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog
        open={!!editingTodo}
        onOpenChange={(open) => !open && dispatch({ type: "CLOSE_EDIT" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-semibold">Edit Todo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => dispatch({ type: "SET_EDIT_TITLE", payload: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => dispatch({ type: "SET_EDIT_DATE", payload: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-time">Time</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editTime}
                  onChange={(e) => dispatch({ type: "SET_EDIT_TIME", payload: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editStatus}
                onValueChange={(v) => dispatch({ type: "SET_EDIT_STATUS", payload: v as Status })}
              >
                <SelectTrigger id="edit-status">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => dispatch({ type: "CLOSE_EDIT" })}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
