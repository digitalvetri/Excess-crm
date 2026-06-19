import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Prevent all stale queries refetching simultaneously on tab focus —
      // this caused visible "refresh" flashes on the dashboard.
      refetchOnWindowFocus: false,
    },
  },
});
