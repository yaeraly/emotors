import {
  buildHqReceivingValidationResult,
  validateCargoReceiptComplete,
  validateSvhToHqTransportComplete,
} from './hq-receiving-validation.util';

const completeCargo = {
  cargoTotalWeightKg: 100,
  cargoRateUsdPerKg: 2,
  defaultUsdRate: 89,
  cargoReceiptNumber: 'CR-001',
  cargoReceiptDate: '2026-06-01',
  cargoAttachmentCount: 1,
};

const completeSvh = {
  transportCompanyId: 'company-1',
  transportCostKgs: 5000,
  dispatchDate: '2026-06-02',
  arrivalDate: '2026-06-03',
  status: 'COMPLETED',
  transportCompanyStatus: 'ACTIVE',
};

console.assert(validateCargoReceiptComplete(completeCargo).valid === true);
console.assert(validateCargoReceiptComplete({ ...completeCargo, cargoReceiptNumber: '' }).valid === false);
console.assert(validateSvhToHqTransportComplete(completeSvh).valid === true);
console.assert(validateSvhToHqTransportComplete({ ...completeSvh, status: 'WAITING' }).valid === false);

const readiness = buildHqReceivingValidationResult({ cargo: completeCargo, svh: completeSvh });
console.assert(readiness.canReceiveToHq === true);
console.assert(
  buildHqReceivingValidationResult({ cargo: { ...completeCargo, cargoAttachmentCount: 0 }, svh: completeSvh })
    .canReceiveToHq === false,
);

console.log('hq-receiving-validation.util.test.ts passed');
