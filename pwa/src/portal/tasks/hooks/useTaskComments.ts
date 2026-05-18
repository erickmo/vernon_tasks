import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTaskComments,
  addComment as apiAddComment,
  deleteComment as apiDeleteComment,
} from "../api/tasks";
import type { ActivityEntry } from "../api/types";

import { trackCommentAdded, trackCommentDeleted } from "../../../telemetry";

export function useTaskComments(taskName: string | null) {
  const qc = useQueryClient();
  const key = ["taskComments", taskName];

  const query = useQuery<ActivityEntry[]>({
    queryKey: key,
    queryFn: () => getTaskComments(taskName!),
    enabled: !!taskName,
    staleTime: 10_000,
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) => apiAddComment(taskName!, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      trackCommentAdded(taskName!);
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (comment_name: string) => apiDeleteComment(comment_name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      trackCommentDeleted(taskName!);
    },
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    addComment: (content: string) => addCommentMutation.mutateAsync(content),
    deleteComment: (comment_name: string) => deleteCommentMutation.mutateAsync(comment_name),
    isAddingComment: addCommentMutation.isPending,
    isDeletingComment: deleteCommentMutation.isPending,
  };
}
