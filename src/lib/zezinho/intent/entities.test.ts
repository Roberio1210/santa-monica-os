import { describe, expect, it } from "vitest";
import { extractEntities } from "@/lib/zezinho/intent/entities";

const REFERENCE = new Date("2026-07-19T15:00:00.000Z");

describe("extractEntities — tópicos", () => {
  it("reconhece tópico preço", () => {
    expect(extractEntities("Vale aumentar o preço?", REFERENCE).topic).toBe("preco");
  });

  it("reconhece tópico equipe", () => {
    expect(extractEntities("Vale contratar mais gente?", REFERENCE).topic).toBe("equipe");
  });

  it("reconhece tópico clientes", () => {
    expect(extractEntities("Quem devemos ligar hoje?", REFERENCE).topic).toBe("clientes");
  });

  it("prioriza preço sobre outros tópicos quando ambos aparecem", () => {
    expect(extractEntities("Vale aumentar o preço para os clientes?", REFERENCE).topic).toBe("preco");
  });

  it("retorna null quando nenhum tópico é reconhecido", () => {
    expect(extractEntities("Compare julho com junho.", REFERENCE).topic).toBeNull();
  });
});

describe("extractEntities — pacotes", () => {
  it("reconhece Bronze", () => {
    expect(extractEntities("Devemos vender mais Bronze?", REFERENCE).packageMentioned).toBe("Bronze");
  });

  it("reconhece Silver", () => {
    expect(extractEntities("Devemos vender mais Silver?", REFERENCE).packageMentioned).toBe("Silver");
  });

  it("reconhece Gold", () => {
    expect(extractEntities("Devemos vender mais Gold?", REFERENCE).packageMentioned).toBe("Gold");
  });

  it("retorna null quando nenhum pacote é citado", () => {
    expect(extractEntities("Como foi a semana?", REFERENCE).packageMentioned).toBeNull();
  });
});

describe("extractEntities — período/comparação (reaproveita date-parser)", () => {
  it("reconhece a comparação da pergunta obrigatória da sprint anterior", () => {
    const result = extractEntities(
      "o que você está achando da performance destes 19 dias do mês de julho em relação aos 19 dias do mês de junho?",
      REFERENCE,
    );
    expect(result.comparison).not.toBeNull();
    expect(result.comparison!.periodA).toMatchObject({ from: "2026-07-01", to: "2026-07-19" });
  });

  it("reconhece filtro de área", () => {
    expect(extractEntities("E só a lavação?", REFERENCE).areaFilter).toBe("lavacao");
    expect(extractEntities("E só o estacionamento?", REFERENCE).areaFilter).toBe("estacionamento");
  });
});
