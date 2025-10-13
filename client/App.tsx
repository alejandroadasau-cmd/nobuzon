import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import BatchDetail from "./pages/BatchDetail";
import BatchProcess from "./pages/BatchProcess";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Wrap window.fetch to safely ignore failing analytics scripts like FullStory
if (typeof window !== "undefined" && "fetch" in window) {
  const _fetch = window.fetch.bind(window);
  window.fetch = async (...args: any[]) => {
    try {
      return await _fetch(...args);
    } catch (err) {
      try {
        const url = args[0];
        if (typeof url === "string" && url.includes("fullstory.com")) {
          // swallow the error from FullStory to avoid noisy console errors
          // return an empty successful response so callers that await fetch don't throw
          return new Response(null, { status: 204 });
        }
      } catch (e) {
        // ignore
      }
      throw err;
    }
  };
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/batches/:batchId" element={<BatchDetail />} />
          <Route path="/process/:batchId" element={<BatchProcess />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
