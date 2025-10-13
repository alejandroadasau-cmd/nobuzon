export const formatCurrencyMXN = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    value,
  );

export const formatRFC = (rfc: string) => rfc.trim().toUpperCase();

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
