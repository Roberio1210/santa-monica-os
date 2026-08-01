/** Placa maiúscula, sem espaços — identidade do veículo nesta fase (o JumpPark não expõe id estável de veículo). */
export function normalizePlate(plate: string | null | undefined): string | null {
  if (!plate) return null;
  const clean = plate.trim().toUpperCase().replace(/\s+/g, "");
  return clean.length > 0 ? clean : null;
}

/** Slug estável a partir de um texto de serviço JumpPark — usado como external_id do primeiro registro automático. */
export function slugifyServiceName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
