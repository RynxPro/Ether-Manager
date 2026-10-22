import React from "react";
import ReactDOM from "react-dom/client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { installErrorLogging, logLine, reportQueryFailure } from "./lib/log";
import "./styles/global.css";

installErrorLogging();
logLine("app started");

// Every failed query and mutation lands in the log file, named by its key.
//
// Wired on the caches rather than per call, because the faults worth reading about later are the
// ones nobody thought to handle — a component that shows a spinner forever has, by definition, no
// handler that would have logged anything. These fire whatever the component does with the error
// afterwards, so a surface that swallows a failure still leaves a record of it.
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (cause, query) => reportQueryFailure("query", query.queryKey, cause),
  }),
  mutationCache: new MutationCache({
    onError: (cause, _vars, _ctx, mutation) =>
      reportQueryFailure("mutation", mutation.options.mutationKey ?? "unkeyed", cause),
  }),
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
