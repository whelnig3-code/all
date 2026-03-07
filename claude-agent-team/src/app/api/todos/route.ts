import { NextRequest } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { createTodoSchema, updateTodoSchema } from "@/lib/schemas";
import { getTenantTodosFile } from "@/lib/tenant/tenant-paths";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

interface Todo {
  id: string;
  text: string;
  done: boolean;
  priority: "low" | "medium" | "high";
  createdAt: number;
}

async function loadTodos(tenantId?: string): Promise<Todo[]> {
  try {
    const raw = await fsp.readFile(getTenantTodosFile(tenantId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveTodos(todos: Todo[], tenantId?: string): Promise<void> {
  const file = getTenantTodosFile(tenantId);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(todos, null, 2), "utf-8");
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const todos = await loadTodos(tenantId);
  return Response.json({ todos });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const body = await req.json();
  const parsed = createTodoSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { text, priority } = parsed.data;

  const todos = await loadTodos(tenantId);
  const todo: Todo = {
    id: crypto.randomUUID(),
    text: text.trim(),
    done: false,
    priority,
    createdAt: Date.now(),
  };
  await saveTodos([todo, ...todos], tenantId);
  return Response.json({ todo }, { status: 201 });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const body = await req.json();
  const parsed = updateTodoSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { id, done, text, priority } = parsed.data;

  const todos = await loadTodos(tenantId);
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) {
    throw AppError.notFound("Todo not found");
  }

  const updatedTodos = todos.map((t) =>
    t.id === id
      ? {
          ...t,
          ...(done !== undefined && { done }),
          ...(text !== undefined && { text }),
          ...(priority !== undefined && { priority }),
        }
      : t
  );
  await saveTodos(updatedTodos, tenantId);
  const updatedTodo = updatedTodos.find((t) => t.id === id);
  return Response.json({ todo: updatedTodo });
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const tenantId = getTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    throw AppError.badRequest("id required");
  }

  const todos = await loadTodos(tenantId);
  await saveTodos(todos.filter((t) => t.id !== id), tenantId);
  return Response.json({ ok: true });
});
