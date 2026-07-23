import {
  buildHqReceivingValidationResult,
  CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE,
  hqReceivingBlockedMessage,
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
console.assert(readiness.cargoReceiptCompleted === true);

// Attachment from payment request is enough — Import Logistics form fields must not block HQ receive.
const attachmentOnly = buildHqReceivingValidationResult({
  cargo: { cargoAttachmentCount: 1 },
  svh: null,
});
console.assert(attachmentOnly.canReceiveToHq === true);
console.assert(attachmentOnly.cargoReceiptCompleted === true);
console.assert(attachmentOnly.svhToHqTransportCompleted === false);
console.assert(hqReceivingBlockedMessage(attachmentOnly) === null);

// Missing SVH must not block receiving.
const missingSvh = buildHqReceivingValidationResult({
  cargo: completeCargo,
  svh: { ...completeSvh, status: 'WAITING' },
});
console.assert(missingSvh.canReceiveToHq === true);
console.assert(hqReceivingBlockedMessage(missingSvh) === null);

// Incomplete cargo form must not block receiving when attachment exists.
const incompleteForm = buildHqReceivingValidationResult({
  cargo: { ...completeCargo, cargoReceiptNumber: '', cargoTotalWeightKg: 0 },
  svh: completeSvh,
});
console.assert(incompleteForm.canReceiveToHq === true);
console.assert(incompleteForm.cargoReceiptCompleted === true);
console.assert(hqReceivingBlockedMessage(incompleteForm) === null);

const missingAttachment = buildHqReceivingValidationResult({
  cargo: { ...completeCargo, cargoAttachmentCount: 0 },
  svh: completeSvh,
});
console.assert(missingAttachment.canReceiveToHq === true);
console.assert(missingAttachment.cargoReceiptCompleted === false);
console.assert(hqReceivingBlockedMessage(missingAttachment) === null);
console.assert(CARGO_RECEIPT_ATTACHMENT_REQUIRED_MESSAGE.length > 0);

console.log('hq-receiving-validation.util.test.ts passed');
