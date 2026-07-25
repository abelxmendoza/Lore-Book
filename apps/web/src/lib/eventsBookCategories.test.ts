import { describe, expect, it } from 'vitest';
import {
  CATEGORY_SUB_TABS,
  eventMatchesCategory,
} from './eventsBookCategories';

describe('eventsBookCategories', () => {
  it('exposes nested celebration classifiers for parties and shows', () => {
    const partySubs = CATEGORY_SUB_TABS.parties?.map((s) => s.value) ?? [];
    expect(partySubs).toEqual(
      expect.arrayContaining(['weddings', 'baby_showers', 'raves', 'house_parties']),
    );
    const showSubs = CATEGORY_SUB_TABS.concerts_shows?.map((s) => s.value) ?? [];
    expect(showSubs).toEqual(
      expect.arrayContaining(['backyard_shows', 'fight_nights', 'concerts', 'local_scene']),
    );
    expect(CATEGORY_SUB_TABS.work?.some((s) => s.value === 'meetings')).toBe(true);
    expect(CATEGORY_SUB_TABS.festivals?.some((s) => s.value === 'rave_festivals')).toBe(true);
  });

  it('matches birthday parties, weddings, and baby showers under Parties', () => {
    expect(
      eventMatchesCategory(
        { title: 'Marcus Birthday Party Celebration', summary: 'Whole night story' },
        'parties',
        'all',
      ),
    ).toBe(true);
    expect(
      eventMatchesCategory(
        { title: 'Jamie and Taylor Wedding Reception', summary: 'Family celebration' },
        'parties',
        'weddings',
      ),
    ).toBe(true);
    expect(
      eventMatchesCategory(
        { title: 'Baby Shower for Alex', activities: ['celebrating'] },
        'parties',
        'baby_showers',
      ),
    ).toBe(true);
  });

  it('matches backyard shows, Fight Night, concerts, and conventions', () => {
    expect(
      eventMatchesCategory(
        { title: 'Backyard Show at Northwind', summary: 'Local scene gig' },
        'concerts_shows',
        'backyard_shows',
      ),
    ).toBe(true);
    expect(
      eventMatchesCategory(
        { title: 'Fight Night Downtown', summary: 'Boxing card' },
        'concerts_shows',
        'fight_nights',
      ),
    ).toBe(true);
    expect(
      eventMatchesCategory(
        { title: 'Neon Harbor Club Concert', type: 'social' },
        'concerts_shows',
        'concerts',
      ),
    ).toBe(true);
    expect(
      eventMatchesCategory(
        { title: 'Anime Expo Convention', summary: 'Fan con weekend' },
        'conventions',
        'fan_cons',
      ),
    ).toBe(true);
  });

  it('matches meetings under Work and rave festivals under Festivals', () => {
    expect(
      eventMatchesCategory(
        { title: 'Team Sync Meeting', type: 'work' },
        'work',
        'meetings',
      ),
    ).toBe(true);
    expect(
      eventMatchesCategory(
        { title: 'Desert Rave Festival', summary: 'Multi-day EDM festival' },
        'festivals',
        'rave_festivals',
      ),
    ).toBe(true);
  });
});
