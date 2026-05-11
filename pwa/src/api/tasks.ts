import { api } from "./client";
import { cacheGet, cachePut } from "../cache/idb";
import { stamp } from "../cache/sync-time";

export interface TaskCard {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  due_date?: string;
  project?: string;
  sprint?: string;
  points?: number;
}

export interface MyWork {
  overdue: TaskCard[];
  today: TaskCard[];
  upcoming: TaskCard[];
}

export interface TaskDetail extends TaskCard {
  description?: string;
  activity: Array<{
    content: string;
    comment_type: string;
    creation: string;
    owner: string;
  }>;
}

export async function fetchMyWork(): Promise<MyWork> {
  try {
    const data = await api.get<MyWork>("/api/method/vernon_tasks.task.api.my_work.list");
    await cachePut("my-work", data);
    stamp("my-work");
    return data;
  } catch (e) {
    const cached = await cacheGet<MyWork>("my-work");
    if (cached) return cached;
    throw e;
  }
}

export async function fetchTaskDetail(id: string): Promise<TaskDetail> {
  const key = `task:${id}`;
  try {
    const data = await api.get<TaskDetail>(
      `/api/method/vernon_tasks.task.api.my_work.detail?task_id=${encodeURIComponent(id)}`,
    );
    await cachePut(key, data);
    stamp(key);
    return data;
  } catch (e) {
    const cached = await cacheGet<TaskDetail>(key);
    if (cached) return cached;
    throw e;
  }
}
