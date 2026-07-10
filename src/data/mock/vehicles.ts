import type { Vehicle } from "@/types/vehicle";

export const mockVehicles: Vehicle[] = [
  { id: "vec-001", customerId: "cli-001", model: "BMW X1", color: "Preto", plateMasked: "SMA-**23" },
  { id: "vec-002", customerId: "cli-002", model: "Jeep Compass", color: "Branco", plateMasked: "SMB-**87" },
  { id: "vec-003", customerId: "cli-003", model: "VW Golf GTI", color: "Cinza", plateMasked: "SMC-**41" },
  { id: "vec-004", customerId: "cli-004", model: "Toyota Corolla", color: "Prata", plateMasked: "SMD-**09" },
  { id: "vec-005", customerId: "cli-005", model: "Audi A3", color: "Preto", plateMasked: "SME-**56" },
  { id: "vec-006", customerId: "cli-006", model: "Porsche Macan", color: "Azul", plateMasked: "SMF-**12" },
];
