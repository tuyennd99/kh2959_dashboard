import { QueryClient } from '@tanstack/react-query';
import { useSessionStore } from '../stores/session-store';
import { ApiError } from './api-error';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
        failureCount < 1,
    },
  },
});

useSessionStore.subscribe((state, previous) => {
  if (state.session?.user.id !== previous.session?.user.id) {
    queryClient.clear();
  }
});
