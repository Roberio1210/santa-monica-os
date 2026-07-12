import { describe, expect, it } from "vitest";
import { generateAccountsPayableFromTemplate } from "@/lib/finance/service";

/**
 * Testa generateAccountsPayableFromTemplate via getFinanceRepository() (singleton do
 * repository-factory.ts) — sem DATABASE_URL no ambiente de teste, resolve automaticamente para
 * StaticFinanceRepository. Isolado em arquivo próprio porque o vitest não reinicia o singleton
 * entre `it()` do mesmo arquivo (só entre arquivos).
 */
describe("Recorrência sem duplicidade", () => {
  it("gerar a mesma competência duas vezes não cria uma segunda conta a pagar", async () => {
    const templateId = "recorrencia-aluguel-iptu";
    const competenceDate = "2026-07-01";

    const first = await generateAccountsPayableFromTemplate(templateId, competenceDate);
    const second = await generateAccountsPayableFromTemplate(templateId, competenceDate);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.id).toBe(first!.id); // mesma conta reaproveitada, não duplicada
  });

  it("competências diferentes do mesmo modelo geram contas diferentes", async () => {
    const templateId = "recorrencia-jumppark";

    const july = await generateAccountsPayableFromTemplate(templateId, "2026-07-01");
    const august = await generateAccountsPayableFromTemplate(templateId, "2026-08-01");

    expect(july!.id).not.toBe(august!.id);
    expect(july!.competenceDate).toBe("2026-07-01");
    expect(august!.competenceDate).toBe("2026-08-01");
  });

  it("modelo de valor variável (água/energia) exige valor informado — nunca repete o último valor como fixo", async () => {
    await expect(generateAccountsPayableFromTemplate("recorrencia-agua-casan", "2026-07-01")).rejects.toThrow(/valor variável/);
  });

  it("modelo de valor variável aceita valor informado explicitamente para a competência", async () => {
    const created = await generateAccountsPayableFromTemplate("recorrencia-energia-celesc", "2026-09-01", 312.45);
    expect(created?.originalAmount).toBe(312.45);
  });
});
