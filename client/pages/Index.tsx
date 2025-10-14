import { FormEvent, useMemo, useState } from "react";
import GeneracionMasivaHeader from "@/components/GeneracionMasivaHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePendingSIT,
  useGenerateRequirements,
  useGeneratedRequirements,
} from "@/hooks/useSITData";
import { useNavigate } from "react-router-dom";
import { formatCurrencyMXN, formatRFC, formatDate } from "@/lib/formatters";
import type { TaxType } from "@shared/api";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Clock } from "lucide-react";

const TAX_DISPLAY: Record<TaxType, string> = {
  "Impuesto sobre Adquisición de Bienes Inmuebles":
    "Adquisición de Bienes Inmuebles",
  "Impuesto sobre Vehículos Nuevos": "Vehículos Nuevos",
  "Impuesto sobre Juegos con Apuestas": "Juegos con Apuestas",
};

export default function Index() {
  const { data: pending = [], isLoading: loadingPending } = usePendingSIT({});
  const {
    data: generatedResp = { batches: [], requirements: [] },
    isLoading: loadingGenerated,
  } = useGeneratedRequirements();
  const generate = useGenerateRequirements();

  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  const totalPending = pending.length;
  const allIds = useMemo(() => pending.map((p) => p.id), [pending]);

  // modal & extras
  const [open, setOpen] = useState(false);
  const [observation, setObservation] = useState("");
  const [generatedBy, setGeneratedBy] = useState("SIT-AUTO");
  const [extraTypesSelected, setExtraTypesSelected] = useState<string[]>([]);

  const EXTRA_TYPES = [
    "Requerimiento de declaración omitida (����nica, por operación puntual)",
    "Requerimiento de información – Para acreditar exención o dato faltante (ej. escritura, factura)",
  ];

  const onConfirmGenerateAll = async () => {
    if (allIds.length === 0) return;
    await generate.mutateAsync({
      ids: allIds,
      observation: observation.trim() || undefined,
      generatedBy: generatedBy.trim() || undefined,
      extraRequirementTypes: extraTypesSelected,
    });
    setOpen(false);
    setObservation("");
    setGeneratedBy("SIT-AUTO");
    setExtraTypesSelected([]);
  };

  // Start generation and navigate to processing screen
  const handleGenerateClick = async () => {
    // refresh pending ids from server when generating
    let ids = allIds;
    try {
      const pendingRes = await fetch("/api/sit/pending");
      if (pendingRes.ok) {
        const pendingData = await pendingRes.json();
        if (Array.isArray(pendingData)) {
          const serverIds = pendingData.map((p: any) => p.id).filter(Boolean);
          if (serverIds.length > 0) ids = serverIds;
        }
      } else {
        console.warn("Failed to fetch pending from server", pendingRes.status);
      }
    } catch (e) {
      console.error("Error fetching pending", e);
    }

    try {
      // trigger generation on server
      const result = await generate.mutateAsync({
        ids,
        observation: observation.trim() || undefined,
        generatedBy: generatedBy.trim() || undefined,
        extraRequirementTypes: extraTypesSelected,
      });

      const batch = result?.batch;
      const generatedItems = Array.isArray(result?.generated)
        ? result.generated.map((g: any) => ({
            ...g,
            status: "pending",
            failed: false,
          }))
        : [];

      // insert batch in cache with initial progress 0 and do not count generated items as processed yet
      qc.setQueryData(["sit", "generated"], (old: any) => {
        const prev = old || { batches: [], requirements: [] };
        const placeholder = { ...batch, progress: 0 };
        return {
          batches: [placeholder, ...(prev.batches || [])],
          requirements: [...generatedItems, ...(prev.requirements || [])],
        };
      });

      // navigate to processing page
      try {
        navigate(`/process/${batch.batchId}`);
      } catch (e) {
        /* ignore */
      }

      // simulate progress until completion
      let progress = 0;
      const iv = setInterval(() => {
        progress += Math.floor(Math.random() * 10) + 5; // 5-14%
        if (progress >= 95) progress = 95;
        qc.setQueryData(["sit", "generated"], (old: any) => {
          if (!old) return old;
          const batches = (old.batches || []).map((b: any) => {
            if (b.batchId !== batch.batchId) return b;
            const prevProg = typeof b.progress === "number" ? b.progress : 0;
            const nextProg = Math.max(prevProg, progress);
            return { ...b, progress: nextProg };
          });
          return { ...old, batches };
        });
      }, 600);

      // finalize after a short delay
      setTimeout(() => {
        clearInterval(iv);
        // set to 100
        qc.setQueryData(["sit", "generated"], (old: any) => {
          if (!old) return old;
          const batches = (old.batches || []).map((b: any) => {
            if (b.batchId !== batch.batchId) return b;
            const prevProg = typeof b.progress === "number" ? b.progress : 0;
            const nextProg = Math.max(prevProg, 100);
            return { ...b, progress: nextProg };
          });
          return { ...old, batches };
        });
        setObservation("");
        setGeneratedBy("SIT-AUTO");
        setExtraTypesSelected([]);
      }, 4000);
    } catch (err) {
      console.error("Generate exception", err);
      toast({
        title: "Error",
        description: "Error al generar requerimientos.",
        variant: "destructive",
      });
    }
  };

  // batches table helpers (kept in file but not changed)
  const batches = generatedResp.batches || [];
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filteredBatches = batches.filter((b: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(b.batchId).toLowerCase().includes(q) ||
      String(b.generatedBy).toLowerCase().includes(q) ||
      (b.requirementTypes || []).some((t: string) =>
        t.toLowerCase().includes(q),
      )
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredBatches.length / pageSize));
  const pageItems = filteredBatches.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const exportCSV = () => {
    const rows = [
      [
        "Folio",
        "Periodo de creación",
        "Quien generó",
        "# Requerimientos",
        "Progreso",
        "Tipos de requerimientos",
      ],
      ...filteredBatches.map((b: any) => [
        b.batchId,
        b.periodStart && b.periodEnd
          ? `${formatDate(b.periodStart)} — ${formatDate(b.periodEnd)}`
          : new Date(b.generatedAt).toLocaleString("es-MX"),
        b.generatedBy,
        String(b.count),
        String(typeof b.progress === "number" ? b.progress : ""),
        (b.requirementTypes || []).join(" | "),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "requerimientos_lotes.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 to-white">
      <main className="container flex flex-col flex-1 py-0">
        <div className="mt-8">
          <GeneracionMasivaHeader />
        </div>

        <Tabs defaultValue="generar">
          <TabsList className="bg-emerald-100/50" />

          <TabsContent value="generar" className="mt-0">
            <div className="flex items-center justify-between mb-0">
              <div />
            </div>

            <div className="flex justify-end -mt-8 mb-2">
              <Button
                variant="default"
                size="sm"
                className="text-sm px-3 py-2"
                disabled={
                  (generate as any).isPending || (generate as any).isLoading
                }
                onClick={handleGenerateClick}
              >
                Nuevo proceso
              </Button>
            </div>

            {/* Batch log starts the module */}
            <div className="rounded-lg border bg-card p-8 mb-2 flex flex-col flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Bitácora de batches</h3>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="border rounded-md px-3 py-2 text-sm"
                    placeholder="Buscar por folio, generador o tipo..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 flex-1">
                {loadingGenerated ? (
                  <div>Cargando…</div>
                ) : (
                  <div className="overflow-auto flex-1 h-full">
                    <table className="w-full text-base">
                      <thead>
                        <tr className="text-left border-b bg-sky-50">
                          <th className="p-5 text-sky-800">Folio</th>
                          <th className="p-5 text-sky-800">
                            Periodo de creación
                          </th>
                          <th className="p-5 text-sky-800">Quien generó</th>
                          <th className="p-5 text-sky-800 text-center">
                            # Requerimientos
                          </th>
                          <th className="p-5 text-sky-800 text-center">
                            Tiempo ejecución
                          </th>
                          <th className="p-5 text-sky-800">Estatus</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="p-6 text-center text-sm text-muted-foreground"
                            >
                              Sin lotes generados aún.
                            </td>
                          </tr>
                        ) : (
                          pageItems.map((b: any) => {
                            const reqs = (
                              generatedResp.requirements || []
                            ).filter((r: any) => r.batchId === b.batchId);
                            const failedCount = reqs.filter(
                              (r: any) =>
                                r.status === "failed" ||
                                r.failed === true ||
                                !!r.error,
                            ).length;
                            const prog =
                              typeof b.progress === "number"
                                ? Math.max(0, Math.min(100, b.progress))
                                : 0;
                            let status = "En proceso";
                            if (prog >= 100)
                              status = failedCount > 0 ? "Errores" : "Exitoso";

                            const start = b.generatedAt
                              ? new Date(b.generatedAt).getTime()
                              : 0;
                            const latest = reqs.reduce(
                              (acc: number, r: any) => {
                                const t = r.generatedAt
                                  ? new Date(r.generatedAt).getTime()
                                  : 0;
                                return t > acc ? t : acc;
                              },
                              0,
                            );
                            const end =
                              latest > 0
                                ? latest
                                : prog >= 100
                                  ? start
                                  : Date.now();
                            const execMs = start
                              ? Math.max(0, end - start)
                              : null;

                            return (
                              <tr
                                key={b.batchId}
                                role="button"
                                tabIndex={0}
                                onClick={() =>
                                  navigate(`/process/${b.batchId}`)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ")
                                    navigate(`/process/${b.batchId}`);
                                }}
                                className="border-b hover:bg-sky-50 cursor-pointer"
                              >
                                <td className="p-6 font-semibold">
                                  {b.batchId}
                                </td>
                                <td className="p-6">
                                  {b.periodStart && b.periodEnd
                                    ? `${formatDate(b.periodStart)} — ${formatDate(b.periodEnd)}`
                                    : new Date(b.generatedAt).toLocaleString(
                                        "es-MX",
                                      )}
                                </td>
                                <td className="p-6">{b.generatedBy}</td>
                                <td className="p-6 text-center">{b.count}</td>
                                <td className="p-6 text-base text-muted-foreground text-center">
                                  {execMs === null
                                    ? "—"
                                    : execMs < 1000
                                      ? `${Math.floor(execMs / 1000)}s`
                                      : `${Math.floor(execMs / 60000)}m ${Math.floor((execMs % 60000) / 1000)}s`}
                                </td>
                                <td className="p-6 flex items-center gap-3">
                                  {status === "Exitoso" ? (
                                    <CheckCircle className="h-6 w-6 text-emerald-600" />
                                  ) : status === "Errores" ? (
                                    <XCircle className="h-6 w-6 text-red-600" />
                                  ) : (
                                    <Clock className="h-6 w-6 text-amber-600" />
                                  )}
                                  <span
                                    className={`${status === "Exitoso" ? "text-emerald-600" : status === "Errores" ? "text-red-600" : "text-amber-600"} font-semibold`}
                                  >
                                    {status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Mostrando {filteredBatches.length} lotes
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-2 py-1 border rounded"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          Anterior
                        </button>
                        <div className="px-3">
                          {page} / {totalPages}
                        </div>
                        <button
                          className="px-2 py-1 border rounded"
                          onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                          }
                          disabled={page === totalPages}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>

                    {/* View dialog for batch details */}
                    <Dialog open={viewOpen} onOpenChange={setViewOpen}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Detalle de lote</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2">
                          {selectedBatch ? (
                            (() => {
                              const requirementsForBatch = (
                                generatedResp.requirements || []
                              ).filter(
                                (r: any) => r.batchId === selectedBatch.batchId,
                              );
                              const groups = new Map<
                                string,
                                {
                                  count: number;
                                  total: number;
                                  types: Set<string>;
                                }
                              >();
                              let grandTotal = 0;
                              requirementsForBatch.forEach((r: any) => {
                                const key = r.taxType || "Otros";
                                const amt = Number(r.totalAmount) || 0;
                                grandTotal += amt;
                                const cur = groups.get(key) || {
                                  count: 0,
                                  total: 0,
                                  types: new Set<string>(),
                                };
                                cur.count += 1;
                                cur.total += amt;
                                if (r.requirementType)
                                  cur.types.add(r.requirementType);
                                groups.set(key, cur);
                              });

                              if (
                                groups.size === 0 &&
                                (selectedBatch.requirementTypes || []).length >
                                  0
                              ) {
                                (selectedBatch.requirementTypes || []).forEach(
                                  (t: string) => {
                                    groups.set(t, {
                                      count: 0,
                                      total: 0,
                                      types: new Set<string>([t]),
                                    });
                                  },
                                );
                              }

                              const rows = Array.from(groups.entries()).map(
                                ([obligation, v]) => ({
                                  obligation,
                                  count: v.count,
                                  total: v.total,
                                  types: Array.from(v.types),
                                }),
                              );

                              if (rows.length === 0)
                                return <div>No hay datos para este lote.</div>;

                              return (
                                <div>
                                  <div>
                                    <strong>Folio:</strong>{" "}
                                    {selectedBatch.batchId}
                                  </div>
                                  <div>
                                    <strong>Periodo:</strong>{" "}
                                    {selectedBatch.periodStart &&
                                    selectedBatch.periodEnd
                                      ? `${formatDate(selectedBatch.periodStart)} — ${formatDate(selectedBatch.periodEnd)}`
                                      : formatDate(selectedBatch.generatedAt)}
                                  </div>
                                  <div>
                                    <strong>Generado por:</strong>{" "}
                                    {selectedBatch.generatedBy}
                                  </div>
                                  <div className="mt-3 overflow-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-left border-b bg-sky-50">
                                          <th className="p-3 text-sky-800">
                                            Obligación
                                          </th>
                                          <th className="p-3 text-sky-800">
                                            # Requerimientos
                                          </th>
                                          <th className="p-3 text-sky-800">
                                            Importe total
                                          </th>
                                          <th className="p-3 text-sky-800">
                                            % del lote
                                          </th>
                                          <th className="p-3 text-sky-800">
                                            Tipos
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {rows.map((r) => {
                                          const pct =
                                            grandTotal > 0
                                              ? Math.round(
                                                  (r.total / grandTotal) * 100,
                                                )
                                              : Math.round(
                                                  (r.count /
                                                    Math.max(
                                                      1,
                                                      selectedBatch.count,
                                                    )) *
                                                    100,
                                                );
                                          return (
                                            <tr
                                              key={r.obligation}
                                              className="border-b hover:bg-sky-50"
                                            >
                                              <td className="p-3 font-medium">
                                                {r.obligation}
                                              </td>
                                              <td className="p-3">{r.count}</td>
                                              <td className="p-3">
                                                {formatCurrencyMXN(
                                                  r.total || 0,
                                                )}
                                              </td>
                                              <td className="p-3">{pct}%</td>
                                              <td className="p-3">
                                                {(r.types || []).join(" • ")}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <div>No hay lote seleccionado</div>
                          )}
                        </div>
                        <DialogFooter className="mt-4">
                          <Button onClick={() => setViewOpen(false)}>
                            Cerrar
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
