import {
  calculateApprovedChinaTransportKgsFromRate,
  CHINA_TRANSPORT_CNY_RATE_REQUIRED_MESSAGE,
  resolveChinaTransportApprovalExchangeRate,
} from './china-domestic-transport-approval.util';

function assertClose(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertThrows(fn: () => unknown, message: string, label: string) {
  try {
    fn();
    throw new Error(`${label}: expected throw`);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== message) {
      throw new Error(`${label}: expected "${message}", got ${String(error)}`);
    }
  }
}

assertClose(
  calculateApprovedChinaTransportKgsFromRate(600, 13),
  7800,
  '600 × 13 = 7800',
);
assertClose(
  calculateApprovedChinaTransportKgsFromRate(600, 13.1),
  7860,
  '600 × 13.1 = 7860',
);
assertClose(resolveChinaTransportApprovalExchangeRate(13.25), 13.25, 'rate rounds to 4 dp');
assertThrows(
  () => resolveChinaTransportApprovalExchangeRate(0),
  CHINA_TRANSPORT_CNY_RATE_REQUIRED_MESSAGE,
  'missing rate',
);

console.log('china-domestic-transport-approval.util.test.ts passed');
