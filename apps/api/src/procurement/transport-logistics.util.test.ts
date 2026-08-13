import {
  convertChinaDomesticTransportYuanToKgs,
  resolveChinaDomesticTransport,
  resolveEffectiveYuanRate,
  resolveProcurementLogisticsInput,
} from './transport-logistics.util';

describe('transport-logistics.util', () => {
  it('converts yuan to kgs using effective rate', () => {
    expect(convertChinaDomesticTransportYuanToKgs(1000, 12.5)).toBe(12500);
  });

  it('uses weighted average rate when supplier payments exist', () => {
    expect(resolveEffectiveYuanRate(12.34, 500, 11)).toBe(12.34);
  });

  it('falls back to estimated yuan rate when no payments exist', () => {
    expect(resolveEffectiveYuanRate(null, 0, 11.5)).toBe(11.5);
  });

  it('recalculates china domestic transport kgs from yuan', () => {
    const result = resolveChinaDomesticTransport({
      chinaDomesticTransportYuan: 200,
      chinaDomesticTransportKgs: 100,
      effectiveYuanRate: 12,
    });
    expect(result.yuan).toBe(200);
    expect(result.kgs).toBe(2400);
  });

  it('keeps legacy kgs when yuan is zero', () => {
    const result = resolveChinaDomesticTransport({
      chinaDomesticTransportYuan: 0,
      chinaDomesticTransportKgs: 1500,
      effectiveYuanRate: 12,
    });
    expect(result.kgs).toBe(1500);
  });

  it('requires yuan rate when yuan cost is positive', () => {
    expect(() =>
      resolveChinaDomesticTransport({
        chinaDomesticTransportYuan: 100,
        effectiveYuanRate: 0,
      }),
    ).toThrow('WEIGHTED_YUAN_RATE_REQUIRED');
  });

  it('builds procurement logistics with converted domestic transport', () => {
    const resolved = resolveProcurementLogisticsInput(
      { chinaDomesticTransportYuan: 50, localTransportKgs: 300 },
      undefined,
      10,
    );
    expect(resolved.chinaDomesticTransportYuan).toBe(50);
    expect(resolved.chinaDomesticTransportKgs).toBe(500);
    expect(resolved.localTransportKgs).toBe(300);
    expect(resolved.logistics.chinaDomesticTransportKgs).toBe(500);
  });
});
