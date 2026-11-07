import { useQueryClient } from "@tanstack/react-query";
import {
  getGetStatsQueryKey,
  useProcessVoice,
  useResetSessionStats,
  useSetStat,
  useUpdateStat,
} from "@workspace/api-client-react";

/**
 * A stat write changes three things: the session view, the season totals, and
 * whichever player detail page is open. Rather than track each one, invalidate
 * everything under the stats and players prefixes and let React Query refetch
 * what is actually mounted.
 */
function useInvalidateStats() {
  const queryClient = useQueryClient();

  return () => {
    const statsPrefix = getGetStatsQueryKey()[0];
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const first = query.queryKey[0];
        return (
          typeof first === "string" &&
          (first === statsPrefix || first.startsWith("/api/players"))
        );
      },
    });
  };
}

export function useUpdateStatMutation() {
  const invalidate = useInvalidateStats();
  return useUpdateStat({ mutation: { onSuccess: invalidate } });
}

export function useSetStatMutation() {
  const invalidate = useInvalidateStats();
  return useSetStat({ mutation: { onSuccess: invalidate } });
}

export function useProcessVoiceMutation() {
  const invalidate = useInvalidateStats();
  return useProcessVoice({ mutation: { onSuccess: invalidate } });
}

export function useResetSessionStatsMutation() {
  const invalidate = useInvalidateStats();
  return useResetSessionStats({ mutation: { onSuccess: invalidate } });
}
