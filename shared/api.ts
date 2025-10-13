/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

// Domain types for SIT intake and requirement generation
export type SourceCategory = "Notarias" | "Agencias" | "Sorteos";

export type TaxType =
  | "Impuesto sobre Adquisición de Bienes Inmuebles"
  | "Impuesto sobre Vehículos Nuevos"
  | "Impuesto sobre Juegos con Apuestas";

export interface SourceInfo {
  category: SourceCategory; // e.g., Notarias, Agencias, Sorteos
  name: string; // e.g., "Notaría Pública No. 3", "Agencia Automotriz XYZ"
}

export interface SitPendingRecord {
  id: string; // internal SIT report line id
  rfc: string; // RFC from third-party report
  fullName: string; // Full legal name
  source: SourceInfo; // Fuente de obligación
  taxType: TaxType; // Tipo de impuesto
  totalAmount: number; // Calculated tax + penalties
  address: string | null; // Address from source report; if null -> must be hidden in UI
  sitReportId: string; // e.g., REP-NOT-789456
  registeredAt: string; // ISO date when registered in SIT
  notRegisteredInStateRoll: true; // always true for this module
  hasDigitalInbox: false; // always false for this module
}

export interface GeneratedRequirement {
  requirementId: string; // e.g., REQ-EST-2025-00123
  rfc: string;
  fullName: string;
  source: SourceInfo;
  taxType: TaxType;
  totalAmount: number;
  sitReportId: string;
  generatedAt: string; // ISO timestamp
  batchObservation?: string; // optional common observation
  batchId?: string; // associated batch id
}

// New: Batch metadata returned by /api/sit/generated
export interface GeneratedBatch {
  batchId: string; // e.g., BATCH-2025-00001
  generatedAt: string; // ISO timestamp
  generatedBy: string; // e.g., "SIT-AUTO" or username
  count: number; // number of requirements generated in this batch
  requirementTypes: string[]; // list of requirement type labels generated in this batch
  periodStart?: string; // ISO date for earliest registeredAt among selected records
  periodEnd?: string; // ISO date for latest registeredAt among selected records
  progress?: number; // 0-100 progress percentage for batch processing (semáforo)
}

export interface GenerateRequestPayload {
  ids: string[]; // pending record ids to convert
  observation?: string;
  generatedBy?: string; // who triggered generation (e.g., username or system)
  extraRequirementTypes?: string[]; // additional requirement types to include in the batch
  periodStart?: string; // ISO date for the start of the period (optional override)
  periodEnd?: string; // ISO date for the end of the period (optional override)
}

export interface GenerateResponse {
  generated: GeneratedRequirement[];
}
