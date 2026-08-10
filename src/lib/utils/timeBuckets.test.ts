import { describe, expect, it } from "vitest";
import { dailyBuckets, isoWeekBucket, monthlyBuckets, timeBucketOf, weeklyBuckets } from "@/lib/utils/timeBuckets";

describe("timeBucketOf", () => {
  it("day retorna a própria data", () => {
    expect(timeBucketOf("2026-08-05", "day")).toBe("2026-08-05");
  });

  it("month retorna YYYY-MM", () => {
    expect(timeBucketOf("2026-08-05", "month")).toBe("2026-08");
  });

  it("week retorna o mesmo bucket para datas na mesma semana ISO", () => {
    expect(timeBucketOf("2026-08-03", "week")).toBe(timeBucketOf("2026-08-05", "week"));
  });
});

describe("isoWeekBucket", () => {
  it("datas em semanas diferentes produzem buckets diferentes", () => {
    expect(isoWeekBucket("2026-08-03")).not.toBe(isoWeekBucket("2026-08-11"));
  });
});

describe("dailyBuckets", () => {
  it("gera um bucket por dia, inclusive as pontas", () => {
    expect(dailyBuckets("2026-08-01", "2026-08-03")).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });

  it("intervalo de 1 dia -> 1 bucket", () => {
    expect(dailyBuckets("2026-08-01", "2026-08-01")).toEqual(["2026-08-01"]);
  });
});

describe("weeklyBuckets", () => {
  it("cobre todas as semanas ISO tocadas pelo intervalo, sem pular nem repetir", () => {
    const buckets = weeklyBuckets("2026-08-05", "2026-08-20");
    expect(buckets).toHaveLength(3);
    expect(new Set(buckets).size).toBe(3); // sem duplicatas
  });

  it("intervalo dentro de uma única semana -> 1 bucket", () => {
    expect(weeklyBuckets("2026-08-03", "2026-08-05")).toHaveLength(1);
  });
});

describe("monthlyBuckets", () => {
  it("gera N meses terminando em asOfMonth, em ordem cronológica", () => {
    expect(monthlyBuckets(3, "2026-08")).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("atravessa virada de ano corretamente", () => {
    expect(monthlyBuckets(3, "2026-01")).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});
