import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

describe('sales motivation ui', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const settingsPage = readFileSync(join(root, 'app/branch-ceo/settings/motivation/page.tsx'), 'utf8');
  const sellersPage = readFileSync(join(root, 'app/branch-ceo/settings/motivation/sellers/page.tsx'), 'utf8');
  const myBonusesPage = readFileSync(join(root, 'app/sales/my-bonuses/page.tsx'), 'utf8');
  const recommendationCard = readFileSync(
    join(root, 'components/sales-motivation/EmotorsRecommendationCard.tsx'),
    'utf8',
  );
  const nav = readFileSync(join(root, 'lib/unified-nav.ts'), 'utf8');

  it('settings page has recommendation cards and apply action', () => {
    assert.match(settingsPage, /EmotorsRecommendationCard/);
    assert.match(settingsPage, /Применить рекомендацию|applyRecommendationValues/);
    assert.match(settingsPage, /fullPaymentCommissionPercent/);
    assert.match(settingsPage, /installmentApprovalCommissionPercent/);
    assert.match(settingsPage, /planLevels/);
    assert.match(settingsPage, /averageReceiptLevels/);
    assert.match(settingsPage, /returningCustomerDays/);
    assert.match(settingsPage, /История версий/);
  });

  it('recommendation card shows EMOTORS branding and impact', () => {
    assert.match(recommendationCard, /Рекомендуется EMOTORS/);
    assert.match(recommendationCard, /Применить рекомендацию/);
    assert.match(recommendationCard, /Почему рекомендуется именно это значение/);
  });

  it('ceo sellers dashboard and sales my-bonuses pages exist', () => {
    assert.match(sellersPage, /sales-motivation\/dashboard/);
    assert.match(sellersPage, /Сотрудник/);
    assert.match(myBonusesPage, /sales-motivation\/my-bonuses/);
    assert.match(myBonusesPage, /Мои бонусы|nav\.myBonuses/);
  });

  it('nav includes Branch CEO settings and Branch Sales my bonuses', () => {
    assert.match(nav, /branch-ceo\/settings\/motivation/);
    assert.match(nav, /nav\.salesMotivation/);
    assert.match(nav, /sales\/my-bonuses/);
    assert.match(nav, /nav\.myBonuses/);
  });
});
