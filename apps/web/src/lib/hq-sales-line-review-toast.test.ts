import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translations } from '@/i18n/translations';

describe('HQ Sales line review toast translations', () => {
  const keys = [
    'branchProductRequest.lineReviewApproved',
    'branchProductRequest.lineReviewRejected',
    'branchProductRequest.lineReviewSaveFailed',
  ] as const;

  for (const language of ['ky', 'ru', 'en'] as const) {
    it(`defines ${language} line review toast messages`, () => {
      const dict = translations[language];
      for (const key of keys) {
        assert.equal(typeof dict[key], 'string');
        assert.ok(dict[key]!.length > 0);
      }
    });
  }

  it('uses recommended RU approval/rejection copy', () => {
    assert.equal(translations.ru['branchProductRequest.lineReviewApproved'], 'Позиция утверждена');
    assert.equal(translations.ru['branchProductRequest.lineReviewRejected'], 'Позиция отклонена');
    assert.equal(translations.ru['branchProductRequest.lineReviewSaveFailed'], 'Не удалось сохранить позицию');
  });
});
