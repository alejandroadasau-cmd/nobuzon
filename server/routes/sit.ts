import { RequestHandler } from "express";
import {
  GeneratedRequirement,
  GenerateRequestPayload,
  SitPendingRecord,
  SourceCategory,
  TaxType,
} from "@shared/api";

// In-memory mock data for prototype purposes
let counter = 125; // sequence for requirement ids

const nowISO = () => new Date().toISOString();

const samplePending: SitPendingRecord[] = [
  {
    id: "PEND-001",
    rfc: "XYZ010101AB1",
    fullName: "María Fernanda López",
    source: { category: "Notarias", name: "Notaría Pública No. 3" },
    taxType: "Impuesto sobre Adquisición de Bienes Inmuebles",
    totalAmount: 18450.75,
    address: "Calle Hidalgo 123, Col. Centro, Zacatecas, Zac.",
    sitReportId: "REP-NOT-789456",
    registeredAt: "2025-01-21T10:24:00.000Z",
    notRegisteredInStateRoll: true,
    hasDigitalInbox: false,
  },
  {
    id: "PEND-002",
    rfc: "ABC990909CD2",
    fullName: "Juan Carlos Ramírez",
    source: { category: "Agencias", name: "Agencia Automotriz XYZ" },
    taxType: "Impuesto sobre Vehículos Nuevos",
    totalAmount: 35600,
    address: "Av. Universidad 456, Col. Alma Máter, Zacatecas, Zac.",
    sitReportId: "REP-AGE-123987",
    registeredAt: "2025-01-25T09:10:00.000Z",
    notRegisteredInStateRoll: true,
    hasDigitalInbox: false,
  },
  {
    id: "PEND-003",
    rfc: "LMN850101EF3",
    fullName: "Ana Sofía Martínez",
    source: { category: "Sorteos", name: "Lotería de Zacatecas" },
    taxType: "Impuesto sobre Juegos con Apuestas",
    totalAmount: 9200.4,
    address: null, // Missing address -> should be excluded by UI and server
    sitReportId: "REP-SOR-456321",
    registeredAt: "2025-01-26T12:30:00.000Z",
    notRegisteredInStateRoll: true,
    hasDigitalInbox: false,
  },
  {
    id: "PEND-004",
    rfc: "DEF040202GH4",
    fullName: "Carlos Alberto Reyes",
    source: { category: "Notarias", name: "Notaría Pública No. 7" },
    taxType: "Impuesto sobre Adquisición de Bienes Inmuebles",
    totalAmount: 26750.0,
    address: "Callejón del Oro 45, Col. Mineros, Zacatecas, Zac.",
    sitReportId: "REP-NOT-654987",
    registeredAt: "2025-01-27T16:45:00.000Z",
    notRegisteredInStateRoll: true,
    hasDigitalInbox: false,
  },
];

let pendingRecords: SitPendingRecord[] = samplePending.filter(
  (r) => !!r.address,
);
let generatedRecords: GeneratedRequirement[] = [];
let generatedBatches: any[] = [];
let batchCounter = 0;

const toRequirementId = () => {
  counter += 1;
  return `REQ-EST-2025-${String(counter).padStart(5, "0")}`;
};

export const getPending: RequestHandler = (req, res) => {
  const { source, taxType, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  let results = [...pendingRecords];

  if (source) {
    results = results.filter((r) => r.source.category === source);
  }
  if (taxType) {
    results = results.filter((r) => r.taxType === taxType);
  }
  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    results = results.filter((r) => new Date(r.registeredAt).getTime() >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo).getTime();
    results = results.filter((r) => new Date(r.registeredAt).getTime() <= to);
  }

  // Enforce critical rules server-side as well
  results = results.filter(
    (r) => r.notRegisteredInStateRoll && !r.hasDigitalInbox && !!r.address,
  );

  res.status(200).json(results);
};

export const getGenerated: RequestHandler = (_req, res) => {
  res.status(200).json({ batches: generatedBatches, requirements: generatedRecords });
};

export const deleteBatch: RequestHandler = (req, res) => {
  const { batchId } = req.params as { batchId?: string };
  if (!batchId) return res.status(400).json({ error: "batchId required" });
  const prevLen = generatedBatches.length;
  generatedBatches = generatedBatches.filter((b) => b.batchId !== batchId);
  if (generatedBatches.length === prevLen) return res.status(404).json({ error: "batch not found" });
  return res.status(200).json({ ok: true });
};

// Map taxType to detailed requirement type labels (user-specified list)
const REQUIREMENT_TYPE_MAP: Record<TaxType, string> = {
  "Impuesto sobre Adquisición de Bienes Inmuebles": "Requerimiento de pago – Impuesto sobre adquisición de bienes inmuebles",
  "Impuesto sobre Vehículos Nuevos": "Requerimiento de pago – Impuesto sobre vehículos nuevos",
  "Impuesto sobre Juegos con Apuestas": "Requerimiento de pago – Impuesto sobre juegos con apuestas y sorteos",
};

export const postGenerate: RequestHandler = (req, res) => {
  const body = req.body as GenerateRequestPayload | undefined;
  const idsArray: string[] = Array.isArray(body?.ids) ? body!.ids : [];

  const selected = idsArray.length > 0 ? pendingRecords.filter((p) => idsArray.includes(p.id) && !!p.address) : [];

  // Create batch id first so we can attach it to generated requirements
  batchCounter += 1;
  const batchId = `BATCH-2025-${String(batchCounter).padStart(5, "0")}`;

  // Transform to generated requirements (may be empty)
  const newlyGenerated: GeneratedRequirement[] = selected.map((p) => ({
    requirementId: toRequirementId(),
    rfc: p.rfc,
    fullName: p.fullName,
    source: p.source,
    taxType: p.taxType,
    totalAmount: p.totalAmount,
    sitReportId: p.sitReportId,
    generatedAt: nowISO(),
    batchObservation: body?.observation?.trim() || undefined,
    batchId,
  }));

  const requirementTypesFromTax = newlyGenerated.map((g) => REQUIREMENT_TYPE_MAP[g.taxType] || String(g.taxType));
  const extraTypes = Array.isArray(body.extraRequirementTypes) ? body.extraRequirementTypes.map((t) => String(t)) : [];
  const requirementTypes = Array.from(new Set([...requirementTypesFromTax, ...extraTypes]));
  // determine period start/end: prefer explicit payload values, otherwise compute from selected pending records
  let periodStart = undefined;
  let periodEnd = undefined;
  if (body?.periodStart) {
    try { periodStart = new Date(body.periodStart).toISOString(); } catch { periodStart = undefined; }
  }
  if (body?.periodEnd) {
    try { periodEnd = new Date(body.periodEnd).toISOString(); } catch { periodEnd = undefined; }
  }

  if (!periodStart || !periodEnd) {
    const registeredDates = selected.map((p) => new Date(p.registeredAt).getTime()).filter(Boolean);
    if (registeredDates.length) {
      if (!periodStart) periodStart = new Date(Math.min(...registeredDates)).toISOString();
      if (!periodEnd) periodEnd = new Date(Math.max(...registeredDates)).toISOString();
    }
  }

  const batch = {
    batchId,
    generatedAt: nowISO(),
    generatedBy: body.generatedBy?.trim() || "SIT-AUTO",
    count: newlyGenerated.length,
    requirementTypes,
    periodStart,
    periodEnd,
    progress: 100, // default: batch completed
  };

  // Remove from pending (only if ids were provided)
  if (idsArray.length > 0) {
    const remaining = pendingRecords.filter((p) => !idsArray.includes(p.id));
    pendingRecords = remaining;
  }
  generatedRecords = [...newlyGenerated, ...generatedRecords];
  generatedBatches = [batch, ...generatedBatches];

  res.status(200).json({ generated: newlyGenerated, batch });
};
