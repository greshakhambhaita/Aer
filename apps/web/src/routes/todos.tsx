import { Badge } from "@Aer/ui/components/badge";
import { Button } from "@Aer/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@Aer/ui/components/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@Aer/ui/components/dialog";
import { Input } from "@Aer/ui/components/input";
import { Label } from "@Aer/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@Aer/ui/components/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Trash2, Edit2 } from "lucide-react";
import { useState, type FormEvent, useEffect } from "react";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/todos")({
  component: TodosRoute,
});

const STATUS_OPTIONS = ["created", "completed", "cancelled", "delayed"] as const;
type Status = (typeof STATUS_OPTIONS)[number];
type Priority = "low" | "medium" | "high";

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

function TodosRoute() {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [editingTodo, setEditingTodo] = useState<any>(null);
  
  // Edit form states
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<Status>("created");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");

  const todos = useQuery(trpc.todo.getAll.queryOptions());

  const createMutation = useMutation(
    trpc.todo.create.mutationOptions({
      onSuccess: () => {
        todos.refetch();
        setText("");
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.todo.update.mutationOptions({
      onSuccess: () => {
        todos.refetch();
        setEditingTodo(null);
      },
    }),
  );

  const deleteMutation = useMutation(
    trpc.todo.delete.mutationOptions({ onSuccess: () => todos.refetch() }),
  );

  useEffect(() => {
    if (editingTodo) {
      setEditTitle(editingTodo.text);
      setEditStatus(editingTodo.status as Status);
      if (editingTodo.dueDate) {
        const date = new Date(editingTodo.dueDate);
        setEditDate(date.toISOString().split("T")[0]);
        setEditTime(date.toTimeString().split(" ")[0].slice(0, 5));
      } else {
        setEditDate("");
        setEditTime("");
      }
    }
  }, [editingTodo]);

  const handleAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (text.trim()) createMutation.mutate({ text, priority });
  };

  const handleSaveEdit = () => {
    if (!editingTodo) return;
    
    let dueDateISO: string | null = null;
    if (editDate) {
      const combined = editTime ? `${editDate}T${editTime}:00` : `${editDate}T00:00:00`;
      dueDateISO = new Date(combined).toISOString();
    }

    updateMutation.mutate({
      id: editingTodo.id,
      text: editTitle,
      status: editStatus,
      dueDate: dueDateISO,
    });
  };

  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <Card>
        <CardHeader>
          <CardTitle>Todos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add form */}
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="New task…"
              disabled={createMutation.isPending}
              className="flex-1"
            />
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
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
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </form>

          {/* List */}
          {todos.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : todos.data?.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No todos yet.</p>
          ) : (
            <ul className="space-y-2">
              {todos.data?.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 flex flex-col gap-1 cursor-pointer" onClick={() => setEditingTodo(t)}>
                    <span className={`text-sm font-medium ${t.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                      {t.text}
                    </span>
                    {t.dueDate && (
                      <span className="text-xs text-muted-foreground">
                        Due: {new Date(t.dueDate).toLocaleString()}
                      </span>
                    )}
                  </div>

                  <Badge variant={statusVariant[t.status as Status] || "outline"}>
                    {statusLabel[t.status as Status] || t.status}
                  </Badge>

                  <Badge variant={priorityVariant[t.priority as Priority]}>{t.priority}</Badge>

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingTodo(t)}
                      aria-label="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate({ id: t.id })}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={!!editingTodo} onOpenChange={(open) => !open && setEditingTodo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Todo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="time">Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as Status)}>
                <SelectTrigger id="status">
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
            <Button variant="outline" onClick={() => setEditingTodo(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
