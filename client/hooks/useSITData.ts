import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  SitPendingRecord,
  GeneratedRequirement,
  GenerateRequestPayload,
  TaxType,
  SourceCategory,
} from "@shared/api";

export interface PendingFilters {
  source?: SourceCategory;
  taxType?: TaxType;
  dateFrom?: string; // ISO
  dateTo?: string; // ISO
}

const qs = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => !!v)
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`,
    )
    .join("&");

export function usePendingSIT(filters: PendingFilters) {
  const key = ["sit", "pending", filters];
  return useQuery<SitPendingRecord[]>({
    queryKey: key,
    queryFn: async () => {
      const query = qs({
        source: filters.source,
        taxType: filters.taxType,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });
      try {
        const res = await fetch(`/api/sit/pending${query ? `?${query}` : ""}`);
        if (!res.ok) {
          console.warn("usePendingSIT: server responded with", res.status);
          return [] as SitPendingRecord[];
        }
        const data = (await res.json()) as SitPendingRecord[];
        // Safety: hide missing addresses (critical rule)
        return data.filter((r) => !!r.address);
      } catch (err) {
        console.warn("usePendingSIT: fetch failed", err);
        return [] as SitPendingRecord[];
      }
    },
  });
}

import type { GeneratedBatch } from "@shared/api";

export function useGeneratedRequirements() {
  return useQuery<{
    batches: GeneratedBatch[];
    requirements: GeneratedRequirement[];
  }>({
    queryKey: ["sit", "generated"],
    queryFn: async () => {
      // Fetch server data with graceful error handling (network issues or dev proxy may fail)
      let serverData: {
        batches: GeneratedBatch[];
        requirements: GeneratedRequirement[];
      } = { batches: [], requirements: [] };
      try {
        const res = await fetch("/api/sit/generated");
        if (res.ok) {
          serverData = (await res.json()) as {
            batches: GeneratedBatch[];
            requirements: GeneratedRequirement[];
          };
        } else {
          console.warn(
            "useGeneratedRequirements: server responded with",
            res.status,
          );
        }
      } catch (err) {
        // Network or fetch failed
        console.warn("useGeneratedRequirements: fetch failed", err);
        return { batches: [], requirements: [] };
      }

      // Merge locally simulated batches/requirements so UI simulation persists across refetches
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          const localBatches =
            JSON.parse(
              localStorage.getItem("local_simulated_batches") || "null",
            ) || [];
          const localReqs =
            JSON.parse(
              localStorage.getItem("local_simulated_requirements") || "null",
            ) || [];
          return {
            batches: [...localBatches, ...(serverData.batches || [])],
            requirements: [...localReqs, ...(serverData.requirements || [])],
          };
        }
      } catch (e) {
        console.warn(
          "useGeneratedRequirements: failed merging local simulated data",
          e,
        );
      }

      return serverData;
    },
  });
}

export function useGenerateRequirements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GenerateRequestPayload) => {
      const res = await fetch("/api/requirements/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to generate requirements");
      return res.json();
    },
    onSuccess: () => {
      // Refresh both lists
      qc.invalidateQueries({ queryKey: ["sit", "pending"] });
      qc.invalidateQueries({ queryKey: ["sit", "generated"] });
    },
  });
}
