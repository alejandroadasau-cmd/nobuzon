import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import DonutChart from "@/components/ui/donut";
import { ArrowLeft } from "lucide-react";
import { useGeneratedRequirements } from "@/hooks/useSITData";
import { formatDate, formatCurrencyMXN } from "@/lib/formatters";

export default function BatchDetail() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { data: generated = { batches: [], requirements: [] }, isLoading } =
    useGeneratedRequirements();

  const batch = React.useMemo(
    () => generated.batches?.find((b: any) => b.batchId === batchId),
    [generated, batchId],
  );
  const requirements = React.useMemo(
    () =>
      (generated.requirements || []).filter((r: any) => r.batchId === batchId),
    [generated, batchId],
  );

  if (isLoading) return <div className="p-6">Cargando…</div>;
  if (!batch)
    return (
      <div className="p-6">
        <Button
          variant="ghost"
          size="sm"
          className="px-2 py-1 inline-flex items-center gap-2"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <h2 className="text-xl font-semibold mt-4">Batch no encontrado</h2>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white">
      <main className="container py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              Detalle de lote {batch.batchId}
            </h1>
            <div className="text-sm text-muted-foreground">
              Periodo:{" "}
              {batch.periodStart && batch.periodEnd
                ? `${formatDate(batch.periodStart)} — ${formatDate(batch.periodEnd)}`
                : formatDate(batch.generatedAt)}
            </div>
            <div className="text-sm text-muted-foreground">
              Generado por: {batch.generatedBy}
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

        <div className="rounded-lg border bg-card p-4 mb-6">
          <h3 className="font-medium">Resumen por obligación</h3>

          <div className="mt-3 overflow-auto">
            {(() => {
              const groups = new Map<
                string,
                { count: number; total: number; types: Set<string> }
              >();
              let grandTotal = 0;

              (requirements || []).forEach((r: any) => {
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
                if (r.requirementType) cur.types.add(r.requirementType);
                groups.set(key, cur);
              });

              // if no requirements, but batch has requirementTypes, show them with zero totals
              if (
                groups.size === 0 &&
                (batch.requirementTypes || []).length > 0
              ) {
                (batch.requirementTypes || []).forEach((t: string) => {
                  groups.set(t, {
                    count: 0,
                    total: 0,
                    types: new Set<string>([t]),
                  });
                });
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
                return (
                  <div className="p-6 text-center text-muted-foreground">
                    No hay datos para este lote.
                  </div>
                );

              return (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b bg-sky-50">
                      <th className="p-3 text-sky-800">Obligación</th>
                      <th className="p-3 text-sky-800"># Requerimientos</th>
                      <th className="p-3 text-sky-800">Importe total</th>
                      <th className="p-3 text-sky-800">% del lote</th>
                      <th className="p-3 text-sky-800">Tipos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const pct =
                        grandTotal > 0
                          ? Math.round((r.total / grandTotal) * 100)
                          : Math.round(
                              (r.count / Math.max(1, batch.count)) * 100,
                            );
                      return (
                        <tr
                          key={r.obligation}
                          className="border-b hover:bg-sky-50"
                        >
                          <td className="p-3 font-medium">{r.obligation}</td>
                          <td className="p-3">{r.count}</td>
                          <td className="p-3">
                            {formatCurrencyMXN(r.total || 0)}
                          </td>
                          <td className="p-3">{pct}%</td>
                          <td className="p-3">{(r.types || []).join(" • ")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      </main>
    </div>
  );
}
