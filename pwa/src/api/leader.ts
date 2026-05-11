import { api } from "./client";

const PAGE = "vernon_tasks.task.page.leader_review.leader_review";

export interface ReviewItem {
  name: string;
  title: string;
  project: string;
  priority?: string;
  deadline?: string;
  assigned_to: string;
  pdca_phase: string;
  kanban_status: string;
  estimated_hours?: number;
  review_scheduled_date?: string;
}

export const fetchReviewQueue = () =>
  api.get<ReviewItem[]>(`/api/method/${PAGE}.get_review_queue`);

export const approveTask = (task_name: string) =>
  api.post<{ status: string }>(`/api/method/${PAGE}.approve_task`, { task_name });

export const rejectTask = (task_name: string, reason: string) =>
  api.post<{ status: string }>(`/api/method/${PAGE}.reject_task`, {
    task_name,
    reason,
  });
