import { describe, expect, it } from "vitest";
import { listServiceMappings, registerSeenServiceNames } from "@/lib/orders/service-mapping";

describe("service-mapping — honesto sem Postgres configurado", () => {
  it("listServiceMappings retorna vazio, nunca inventado", async () => {
    expect(await listServiceMappings()).toEqual([]);
  });

  it("registerSeenServiceNames nunca lança sem Postgres — só não persiste", async () => {
    await expect(registerSeenServiceNames(["Lavagem Gold"])).resolves.toBeUndefined();
  });
});
