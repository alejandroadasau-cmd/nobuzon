import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGeneratedRequirements } from "@/hooks/useSITData";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle, XCircle, Clock, ArrowLeft } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

// Simple donut component
function Donut({ groups }: { groups: { type: string; count: number }[] }) {
  const size = 140;
  const radius = size / 2;
  const thickness = 30;
  const innerR = radius - thickness / 2;
  const circumference = 2 * Math.PI * innerR;
  const total = groups.reduce((s, g) => s + g.count, 0);
  const colors = ["#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6"];
  let acc = 0;

  return (
    <div className="relative w-[140px] h-[140px] flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={radius}
          cy={radius}
          r={innerR}
          fill="none"
          stroke="#E6EEF5"
          strokeWidth={thickness}
        />
        {groups.map((g, i) => {
          const value = g.count;
          if (value <= 0) return null;
          const dash = circumference * (value / Math.max(1, total));
          const offset = acc;
          acc += dash;
          const stroke = colors[i % colors.length];
          return (
            <g key={g.type} transform={`rotate(-90 ${radius} ${radius})`}>
              <circle
                cx={radius}
                cy={radius}
                r={innerR}
                fill="none"
                stroke={stroke}
                strokeWidth={thickness}
                strokeLinecap="butt"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={circumference - offset}
                style={{
                  transition:
                    "stroke-dashoffset 400ms ease, stroke-dasharray 400ms ease",
                }}
              />
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {total === 0 ? (
          <div className="text-sm text-muted-foreground">Sin datos</div>
        ) : (
          <>
            <div className="text-lg font-semibold">{total}</div>
            <div className="text-xs text-muted-foreground">requerimientos</div>
          </>
        )}
      </div>
    </div>
  );
}

export default function BatchProcess() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: generated = { batches: [], requirements: [] }, isLoading } =
    useGeneratedRequirements();

  const batch = useMemo(
    () => generated.batches?.find((b: any) => b.batchId === batchId),
    [generated, batchId],
  );
  const requirements = useMemo(
    () =>
      (generated.requirements || []).filter((r: any) => r.batchId === batchId),
    [generated, batchId],
  );

  const isReady = (r: any) =>
    r && (r.status === "ok" || r.status === "failed" || r.generatedAt);
  const readyRequirements = (requirements || []).filter(isReady);

  const typeGroups = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    readyRequirements.forEach((r: any) => {
      const key = r.requirementType || r.taxType || "Otros";
      const amt = Number(r.totalAmount) || 0;
      const cur = map.get(key) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += amt;
      map.set(key, cur);
    });
    (batch?.requirementTypes || []).forEach((t: string) => {
      if (!map.has(t)) map.set(t, { count: 0, total: 0 });
    });
    return Array.from(map.entries()).map(([k, v]) => ({ type: k, ...v }));
  }, [readyRequirements, batch]);

  const totalCount = typeGroups.reduce((s, g) => s + g.count, 0) || 0;
  const failedCount = readyRequirements.filter(
    (r: any) => r.status === "failed" || r.failed === true || !!r.error,
  ).length;
  const successCount = Math.max(0, totalCount - failedCount);

  // computed progress and hue for dynamic heatmap color (0 = red, 120 = green)
  const prog = Math.max(
    0,
    Math.min(
      100,
      batch && typeof batch.progress === "number" ? batch.progress : 0,
    ),
  );
  const hue = Math.round((prog / 100) * 120);

  // only show progress after user starts processing
  const [processingStarted, setProcessingStarted] = useState(false);
  const displayProg = processingStarted ? prog : 0;

  // If processing hasn't started, show zeros. Otherwise show ready requirement counts
  const hasRequirements = readyRequirements.length > 0;
  const displayTotal = processingStarted
    ? hasRequirements
      ? totalCount
      : 0
    : 0;
  const displaySuccess = processingStarted
    ? hasRequirements
      ? successCount
      : 0
    : 0;
  const displayFailed = processingStarted
    ? hasRequirements
      ? failedCount
      : 0
    : 0;

  const [events, setEvents] = useState<{ ts: string; text: string }[]>([]);
  const [selectedTab, setSelectedTab] = useState<"log" | "exceptions">("log");
  const simulationStartedRef = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneMessage, setDoneMessage] = useState("");
  const [completedSuccessfully, setCompletedSuccessfully] = useState(false);

  const pushEvent = useCallback((text: string) => {
    const ts = new Date().toLocaleTimeString("es-MX");
    setEvents((s) => [{ ts, text }, ...s].slice(0, 500));
  }, []);

  const handleRetry = useCallback(async () => {
    if (retrying) return;
    try {
      const updated = qc.getQueryData(["sit", "generated"]) as any;
      const currentBatch = (updated?.batches || []).find(
        (b: any) => b.batchId === batch.batchId,
      );
      if (currentBatch && (currentBatch.progress ?? 0) >= 100) {
        // only show modal if the last run completed successfully (no failures)
        if (completedSuccessfully) {
          setDoneMessage("Ya no hay requerimientos");
          setDoneOpen(true);
          return;
        }
        // otherwise allow re-processing attempts when there were errors
      }
    } catch (e) {}

    // user initiated: mark processing started so UI tiles and progress display start from zero and animate
    setProcessingStarted(true);
    setRetrying(true);
    // clear previous successful completion flag when starting a new run
    setCompletedSuccessfully(false);
    try {
      // mark requirements as generated for this batch
      qc.setQueryData(["sit", "generated"], (old: any) => {
        if (!old) return old;
        const reqs = (old.requirements || []).map((r: any) => {
          if (r.batchId !== batch.batchId) return r;
          const now = new Date().toISOString();
          return {
            ...r,
            status: "ok",
            failed: false,
            error: undefined,
            generatedAt: now,
            totalAmount:
              typeof r.totalAmount === "number" && r.totalAmount > 0
                ? r.totalAmount
                : Math.floor(Math.random() * 10000) / 100,
          };
        });
        const batches = (old.batches || []).map((b: any) =>
          b.batchId === batch.batchId ? { ...b, progress: 0 } : b,
        );
        return { ...old, requirements: reqs, batches };
      });

      pushEvent("Procesamiento iniciado");
      toast({ title: "Procesamiento iniciado" });

      // animate progress to 100
      let current = batch?.progress ?? 0;
      const iv = setInterval(() => {
        current = Math.min(100, current + Math.floor(Math.random() * 10) + 5);
        // indicate processing has started so UI shows progress
        setProcessingStarted(true);
        qc.setQueryData(["sit", "generated"], (old: any) => {
          if (!old) return old;
          const batches = (old.batches || []).map((b: any) =>
            b.batchId === batch.batchId ? { ...b, progress: current } : b,
          );
          return { ...old, batches };
        });
        if (current >= 100) {
          clearInterval(iv);
          // finalise: ensure all requirements marked ok
          qc.setQueryData(["sit", "generated"], (old: any) => {
            if (!old) return old;
            const reqs = (old.requirements || []).map((r: any) => {
              if (r.batchId !== batch.batchId) return r;
              return { ...r, status: "ok", failed: false, error: undefined };
            });
            const batches = (old.batches || []).map((b: any) =>
              b.batchId === batch.batchId ? { ...b, progress: 100 } : b,
            );
            return { ...old, requirements: reqs, batches };
          });

          // determine if completed successfully (no failed requirements)
          try {
            const updated = qc.getQueryData(["sit", "generated"]) as any;
            const hasFailed = (updated?.requirements || []).some(
              (r: any) =>
                r.batchId === batch.batchId &&
                (r.status === "failed" || r.failed === true || !!r.error),
            );
            if (!hasFailed) {
              setCompletedSuccessfully(true);
              pushEvent("Procesamiento completado correctamente");
              toast({ title: "Procesamiento completado" });
            } else {
              setCompletedSuccessfully(false);
              pushEvent("Procesamiento finalizado con errores");
              toast({
                title: "Procesamiento finalizado",
                description: "Existen requerimientos con errores.",
              });
            }
          } catch (e) {
            setCompletedSuccessfully(true);
            pushEvent("Procesamiento completado");
          }

          setRetrying(false);
        }
      }, 400);
    } catch (e) {
      toast({
        title: "Error",
        description: "No se pudo procesar",
        variant: "destructive",
      });
      setRetrying(false);
    }
  }, [retrying, qc, batch, pushEvent, completedSuccessfully]);

  // Simulation (detailed logs): simulate validation and generation with step-by-step events
  // Simulation (detailed logs): simulate validation and generation with step-by-step events
  useEffect(() => {
    if (!batch) return;
    let cancelled = false;

    const alreadyComplete = (batch.progress ?? 0) >= 100;
    const hasReqs = (requirements || []).length > 0;

    const run = async () => {
      // If simulation already started, avoid re-running unless there are no requirements (we want to reconstruct)
      if (simulationStartedRef.current) {
        if (hasReqs) {
          // already ran and data exists
          pushEvent("Lote ya completado.");
          return;
        }
        // else: allow reconstruction when there are no requirements
      }
      simulationStartedRef.current = true;

      // If already complete but no requirements, run in fast mode to recreate logs
      const fastMode = alreadyComplete && !hasReqs;
      // do not force tab selection during simulation; preserve user's current tab
      if (fastMode)
        pushEvent("Lote marcado como completado, reconstruyendo bitácora...");
      else pushEvent(`Iniciando procesamiento: ${batch.batchId}`);

      const toProcess = Math.max(3, Number(batch.count) || 5);
      const items = Array.from({ length: toProcess }).map((_, i) => ({
        rfc: `RFC-SIM-${Math.floor(100000 + Math.random() * 899999)}`,
        idx: i + 1,
      }));

      // VALIDATION PHASE
      pushEvent(`Iniciando Validación de ${items.length} registros`);
      let passed: typeof items = [] as any;
      let failed: typeof items = [] as any;
      for (const it of items) {
        if (cancelled) return;
        // simulate time
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) =>
          setTimeout(r, fastMode ? 20 : 200 + Math.floor(Math.random() * 200)),
        );
        const fail = Math.random() < 0.15; // 15% fail
        if (fail) {
          pushEvent(`Validación ERROR: ${it.rfc} - dato faltante`);
          failed.push(it);
        } else {
          pushEvent(`Validación OK: ${it.rfc}`);
          passed.push(it);
        }

        const validationProgress = Math.round(
          ((passed.length + failed.length) / items.length) * 40,
        );
        qc.setQueryData(["sit", "generated"], (old: any) => {
          if (!old) return old;
          const batches = (old.batches || []).map((b: any) => {
            if (b.batchId !== batch.batchId) return b;
            const prevProg = typeof b.progress === "number" ? b.progress : 0;
            const nextProg = Math.max(prevProg, validationProgress);
            return { ...b, progress: nextProg };
          });
          return { ...old, batches };
        });
      }

      pushEvent(
        `Validación completada: ${passed.length} OK, ${failed.length} con errores`,
      );

      // GENERATION PHASE
      if (cancelled) return;
      pushEvent(
        `Iniciando Generación de requerimientos para ${passed.length} registros`,
      );
      let genCount = 0;
      for (const it of passed) {
        if (cancelled) return;
        // simulate time
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) =>
          setTimeout(r, fastMode ? 20 : 150 + Math.floor(Math.random() * 250)),
        );
        const genFail = Math.random() < 0.07; // 7% generation fail
        if (genFail) {
          pushEvent(`Generación ERROR: ${it.rfc} - fallo al generar documento`);
          const now = new Date().toISOString();
          const reqId = `SIM-REQ-FAIL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const newReq = {
            requirementId: reqId,
            rfc: it.rfc,
            fullName: `Simulado ${reqId}`,
            source: { category: "Simulado", name: "Local" },
            taxType: batch?.requirementTypes?.[0] || "Requerimiento",
            totalAmount: 0,
            sitReportId: `SIM-REP-${Date.now()}`,
            generatedAt: now,
            batchObservation: undefined,
            batchId: batch.batchId,
            status: "failed",
            error: "Fallo en servicio externo",
          };
          qc.setQueryData(["sit", "generated"], (old: any) => {
            const prev = old || { batches: [], requirements: [] };
            const batches = (prev.batches || []).map((b: any) =>
              b.batchId === batch.batchId
                ? { ...b, count: (Number(b.count) || 0) + 1 }
                : b,
            );
            try {
              localStorage.setItem(
                "local_simulated_requirements",
                JSON.stringify([
                  newReq,
                  ...(JSON.parse(
                    localStorage.getItem("local_simulated_requirements") ||
                      "null",
                  ) || []),
                ]),
              );
            } catch (e) {}
            return {
              batches,
              requirements: [newReq, ...(prev.requirements || [])],
            };
          });
        } else {
          genCount += 1;
          const now = new Date().toISOString();
          const reqId = `SIM-REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const newReq = {
            requirementId: reqId,
            rfc: it.rfc,
            fullName: `Simulado ${reqId}`,
            source: { category: "Simulado", name: "Local" },
            taxType: batch?.requirementTypes?.[0] || "Requerimiento",
            totalAmount: Math.floor(Math.random() * 10000) / 100,
            sitReportId: `SIM-REP-${Date.now()}`,
            generatedAt: now,
            batchObservation: undefined,
            batchId: batch.batchId,
            status: "ok",
          };
          qc.setQueryData(["sit", "generated"], (old: any) => {
            const prev = old || { batches: [], requirements: [] };
            const batches = (prev.batches || []).map((b: any) =>
              b.batchId === batch.batchId
                ? { ...b, count: (Number(b.count) || 0) + 1 }
                : b,
            );
            try {
              localStorage.setItem(
                "local_simulated_requirements",
                JSON.stringify([
                  newReq,
                  ...(JSON.parse(
                    localStorage.getItem("local_simulated_requirements") ||
                      "null",
                  ) || []),
                ]),
              );
            } catch (e) {}
            return {
              batches,
              requirements: [newReq, ...(prev.requirements || [])],
            };
          });

          pushEvent(`Requerimiento generado: ${reqId} (${it.rfc})`);
        }

        const genProgress =
          40 + Math.round((genCount / Math.max(1, passed.length)) * 55);
        qc.setQueryData(["sit", "generated"], (old: any) => {
          if (!old) return old;
          const batches = (old.batches || []).map((b: any) => {
            if (b.batchId !== batch.batchId) return b;
            const prevProg = typeof b.progress === "number" ? b.progress : 0;
            const nextProg = Math.max(prevProg, genProgress);
            return { ...b, progress: nextProg };
          });
          return { ...old, batches };
        });
      }

      if (cancelled) return;
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

      pushEvent(
        `Generación completada: ${genCount} generados, ${failed.length + (passed.length - genCount)} con errores`,
      );
    };

    run().catch((e) => console.warn("Simulation error", e));

    return () => {
      cancelled = true;
    };
  }, [batch, qc, pushEvent, requirements]);

  // Live tick to update elapsed time while processing
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!batch) return;
    if ((batch.progress ?? 0) >= 100) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [batch]);

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "—";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const executionMs = useMemo(() => {
    if (!batch || !batch.generatedAt) return null;
    const start = new Date(batch.generatedAt).getTime();
    const latestReq = (requirements || []).reduce((acc, r) => {
      const t = r.generatedAt ? new Date(r.generatedAt).getTime() : 0;
      return t > acc ? t : acc;
    }, 0);
    const end = latestReq > 0 ? latestReq : Date.now();
    return Math.max(0, end - start);
  }, [batch, requirements, tick]);

  if (isLoading) return <div className="p-6">Cargando…</div>;
  if (!batch)
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold">Batch no encontrado</h2>
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            className="px-2 py-1 inline-flex items-center gap-2"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white">
      <main className="container py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{batch.batchId}</h1>
            <div className="text-sm text-muted-foreground">
              Inicio: {formatDate(batch.generatedAt)}
            </div>
          </div>
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="px-2 py-1 inline-flex items-center gap-2"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <div className="text-sm text-muted-foreground">
            Progreso de generación
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="w-full bg-sky-100 h-4 rounded-full overflow-hidden">
                    <div
                      className="h-4"
                      style={{
                        width: `${displayProg}%`,
                        transition: "width 400ms ease",
                        background: `linear-gradient(90deg, hsl(${hue} 60% 50%), hsl(${Math.min(120, hue + 15)} 55% 50%))`,
                      }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    {displayProg}%
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-white border rounded-lg shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg flex items-center justify-center bg-sky-50">
                    <FileText className="h-6 w-6 text-sky-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground truncate">
                      Total de registros procesados
                    </div>
                    <div className="mt-1 text-2xl font-semibold">
                      {displayTotal}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white border rounded-lg shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg flex items-center justify-center bg-emerald-50">
                    <CheckCircle className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground truncate">
                      Registros exitosos
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-emerald-600">
                      {displaySuccess}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white border rounded-lg shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg flex items-center justify-center bg-red-50">
                    <XCircle className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground truncate">
                      Registros fallidos
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-red-600">
                      {displayFailed}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white border rounded-lg shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg flex items-center justify-center bg-sky-50">
                    <Clock className="h-6 w-6 text-sky-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground truncate">
                      Tiempo de ejecución
                    </div>
                    <div className="mt-1 text-2xl font-semibold">
                      {formatDuration(executionMs)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-3">
                <Button
                  variant="default"
                  size="sm"
                  className="text-sm"
                  onClick={handleRetry}
                  disabled={retrying}
                >
                  {retrying ? "Procesando…" : "Procesar"}
                </Button>
              </div>

              {batch.progress >= 100 && (
                <div className="mt-6">
                  <div className="mt-4">
                    <div className="flex w-full items-center justify-start gap-2">
                      <button
                        className={`px-3 py-1 rounded text-sm border ${selectedTab === "log" ? "bg-sky-100" : "bg-white"}`}
                        onClick={() => setSelectedTab("log")}
                      >
                        Bitácora
                      </button>
                      <button
                        className={`px-3 py-1 rounded text-sm border ${selectedTab === "exceptions" ? "bg-sky-100" : "bg-white"}`}
                        onClick={() => setSelectedTab("exceptions")}
                      >
                        Exepciones
                      </button>
                    </div>

                    <div className="mt-3 p-3 bg-white border rounded w-full max-w-full">
                      {selectedTab === "log" ? (
                        <div className="h-48 overflow-auto text-sm w-full">
                          {events.length === 0 ? (
                            <div className="text-muted-foreground">
                              Sin eventos aún.
                            </div>
                          ) : (
                            <ul className="space-y-2">
                              {events.map((e, i) => (
                                <li
                                  key={`${e.ts}-${i}`}
                                  className="flex items-start gap-3"
                                >
                                  <div className="text-xs text-muted-foreground w-14">
                                    {e.ts}
                                  </div>
                                  <div className="flex-1">{e.text}</div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <div className="overflow-auto w-full">
                          {(
                            (requirements || []).filter(
                              (r: any) =>
                                r.status === "failed" ||
                                r.failed === true ||
                                !!r.error,
                            ) || []
                          ).length === 0 ? (
                            <div className="p-8 flex flex-col items-center justify-center text-center text-muted-foreground">
                              <img
                                src="https://cdn.builder.io/api/v1/image/assets%2F2ef710f818e74580bbe1a47432231376%2Fed765edc13a748e5a174078622e4c563?format=webp&width=800"
                                alt="check"
                                className="h-24 w-24 object-contain"
                              />
                              <div className="mt-4 text-lg font-medium">
                                No hay excepciones que mostrar.
                              </div>
                            </div>
                          ) : (
                            <table className="w-full table-auto text-sm">
                              <thead>
                                <tr className="text-left border-b bg-sky-50">
                                  <th className="p-2 w-72">ID Requerimiento</th>
                                  <th className="p-2 w-40">Fecha</th>
                                  <th className="p-2">Mensaje de error</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(requirements || [])
                                  .filter(
                                    (r: any) =>
                                      r.status === "failed" ||
                                      r.failed === true ||
                                      !!r.error,
                                  )
                                  .map((r: any) => {
                                    const errMsg =
                                      r.error ||
                                      r.errorMessage ||
                                      "Error desconocido";
                                    const errDate =
                                      r.failedAt ||
                                      r.updatedAt ||
                                      r.generatedAt ||
                                      null;
                                    return (
                                      <tr
                                        key={r.requirementId}
                                        className={`border-b hover:bg-sky-50 bg-red-50`}
                                      >
                                        <td className="p-2 align-top truncate max-w-[240px]">
                                          {r.requirementId}
                                        </td>
                                        <td className="p-2 align-top">
                                          {errDate ? formatDate(errDate) : "—"}
                                        </td>
                                        <td className="p-2 align-top">
                                          {errMsg}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Dialog open={doneOpen} onOpenChange={setDoneOpen}>
            <DialogContent className="fixed left-[50%] top-24 translate-x-[-50%] translate-y-0 z-[9999] flex flex-col items-center justify-center text-center max-w-lg">
              <DialogHeader className="items-center">
                <DialogTitle>Proceso finalizado</DialogTitle>
              </DialogHeader>
              <div className="mt-4 text-lg">
                {doneMessage || "Ya no hay requerimientos"}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
}
