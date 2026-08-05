import { describe, expect, it } from 'vitest';
import {
  CATEGORY_SUB_TABS,
  eventMatchesCategory,
} from './eventsBookCategories';

describe('eventsBookCategories', () => {
  it('exposes nested celebration classifiers for parties and shows', () => {
    const partySubs = CATEGORY_SUB_TABS.parties?.map((s) => s.value) ?? [];
    expect(partySubs).toEqual(
      expect.arrayContaining(['baby_showers', 'raves', 'house_parties']),
    );
    const showSubs = CATEGORY_SUB_TABS.concerts_shows?.map((s) => s.value) ?? [];
    expect(showSubs).toEqual(
      expect.arrayContaining(['backyard_shows', 'fight_nights', 'concerts', 'local_scene']),
    );
    expect(CATEGORY_SUB_TABS.work?.some((s) => s.value === 'meetings')).toBe(true);
    expect(CATEGORY_SUB_TABS.festivals?.some((s) => s.value === 'rave_festivals')).toBe(true);
  });

  it('matches birthday parties and baby showers under Parties', () => {
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
        'all',
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

  it('exposes nested classifiers for quinceañeras and sports', () => {
    const quinceSubs = CATEGORY_SUB_TABS.quinceaneras?.map((s) => s.value) ?? [];
    expect(quinceSubs).toEqual(expect.arrayContaining(['mine', 'family', 'friends']));
    const sportsSubs = CATEGORY_SUB_TABS.sports?.map((s) => s.value) ?? [];
    expect(sportsSubs).toEqual(expect.arrayContaining(['games', 'tournaments', 'playing', 'watching']));
  });

  it('matches quinceañeras regardless of accent or spelling', () => {
    expect(
      eventMatchesCategory(
        { title: "Elena's Quinceañera at the Ballroom", summary: 'Court, dances, dinner' },
        'quinceaneras',
      ),
    ).toBe(true);
    expect(
      eventMatchesCategory(
        { title: 'Sofia Quinceanera Celebration' },
        'quinceaneras',
      ),
    ).toBe(true);
    expect(
      eventMatchesCategory(
        { title: "My Cousin's Quince Años Party" },
        'quinceaneras',
        'family',
      ),
    ).toBe(true);
  });

  it('matches sports games and tournaments under Sports', () => {
    expect(
      eventMatchesCategory(
        { title: 'Rangers Baseball Game with Dad', summary: 'Watched from the upper deck' },
        'sports',
      ),
    ).toBe(true);
    expect(
      eventMatchesCategory(
        { title: 'Rec League Basketball Championship', summary: 'Tournament bracket final' },
        'sports',
        'tournaments',
      ),
    ).toBe(true);
    expect(
      eventMatchesCategory(
        { title: 'Watch Party for the World Cup Final' },
        'sports',
        'watching',
      ),
    ).toBe(true);
  });

  it('does not cross-match quinceañeras and birthdays', () => {
    expect(
      eventMatchesCategory({ title: "Elena's Quinceañera" }, 'birthdays'),
    ).toBe(false);
    expect(
      eventMatchesCategory({ title: 'Marcus Birthday Party' }, 'quinceaneras'),
    ).toBe(false);
  });

  it('exposes nested classifiers for weddings, graduations, religious milestones, and holidays', () => {
    const weddingSubs = CATEGORY_SUB_TABS.weddings?.map((s) => s.value) ?? [];
    expect(weddingSubs).toEqual(expect.arrayContaining(['ceremony', 'reception', 'destination']));
    const gradSubs = CATEGORY_SUB_TABS.graduations?.map((s) => s.value) ?? [];
    expect(gradSubs).toEqual(expect.arrayContaining(['high_school', 'college', 'grad_school']));
    const religiousSubs = CATEGORY_SUB_TABS.religious_milestones?.map((s) => s.value) ?? [];
    expect(religiousSubs).toEqual(
      expect.arrayContaining(['baptism', 'bar_bat_mitzvah', 'first_communion', 'other_religious']),
    );
    const holidaySubs = CATEGORY_SUB_TABS.holidays?.map((s) => s.value) ?? [];
    expect(holidaySubs).toEqual(
      expect.arrayContaining(['christmas', 'thanksgiving', 'new_year', 'other_holiday']),
    );
  });

  it('matches weddings under its own top-level category', () => {
    expect(
      eventMatchesCategory({ title: "Priya's Wedding Day", summary: 'Vows outside, dinner after' }, 'weddings'),
    ).toBe(true);
    expect(
      eventMatchesCategory(
        { title: 'Dancing at the Wedding Reception Until 2am' },
        'weddings',
        'reception',
      ),
    ).toBe(true);
    expect(
      eventMatchesCategory({ title: 'Destination Wedding in Mexico' }, 'weddings', 'destination'),
    ).toBe(true);
  });

  it('matches graduations by ceremony language', () => {
    expect(
      eventMatchesCategory({ title: 'College Graduation Ceremony' }, 'graduations'),
    ).toBe(true);
    expect(
      eventMatchesCategory({ title: 'Grad School Commencement', summary: 'PhD finally done' }, 'graduations', 'grad_school'),
    ).toBe(true);
  });

  it('matches religious and cultural milestones', () => {
    expect(
      eventMatchesCategory({ title: "My Nephew's Baptism" }, 'religious_milestones', 'baptism'),
    ).toBe(true);
    expect(
      eventMatchesCategory({ title: 'Bar Mitzvah at the Temple' }, 'religious_milestones', 'bar_bat_mitzvah'),
    ).toBe(true);
    expect(
      eventMatchesCategory({ title: 'First Communion Sunday' }, 'religious_milestones', 'first_communion'),
    ).toBe(true);
  });

  it('matches holidays under its own top-level category', () => {
    expect(
      eventMatchesCategory({ title: "Christmas Morning at Mom's" }, 'holidays', 'christmas'),
    ).toBe(true);
    expect(
      eventMatchesCategory({ title: 'Thanksgiving Dinner, Tense as Usual' }, 'holidays', 'thanksgiving'),
    ).toBe(true);
    expect(
      eventMatchesCategory({ title: "Halloween Party at the Neighbors'" }, 'holidays', 'other_holiday'),
    ).toBe(true);
  });

  it('exposes nested classifiers for community and government & civic', () => {
    const communitySubs = CATEGORY_SUB_TABS.community?.map((s) => s.value) ?? [];
    expect(communitySubs).toEqual(
      expect.arrayContaining(['volunteering', 'fundraisers', 'neighborhood']),
    );
    const civicSubs = CATEGORY_SUB_TABS.government_civic?.map((s) => s.value) ?? [];
    expect(civicSubs).toEqual(
      expect.arrayContaining(['voting', 'civic_duty', 'public_meetings']),
    );
  });

  it('matches community events like volunteering and fundraisers', () => {
    expect(
      eventMatchesCategory({ title: 'Volunteering at the Food Bank' }, 'community', 'volunteering'),
    ).toBe(true);
    expect(
      eventMatchesCategory({ title: 'Charity Fundraiser Gala' }, 'community', 'fundraisers'),
    ).toBe(true);
    expect(
      eventMatchesCategory({ title: 'Neighborhood Cleanup Day' }, 'community', 'neighborhood'),
    ).toBe(true);
  });

  it('matches government & civic events like voting and jury duty', () => {
    expect(
      eventMatchesCategory({ title: 'Voting on Election Day' }, 'government_civic', 'voting'),
    ).toBe(true);
    expect(
      eventMatchesCategory({ title: 'Jury Duty Week' }, 'government_civic', 'civic_duty'),
    ).toBe(true);
    expect(
      eventMatchesCategory({ title: 'Town Hall on the School Budget' }, 'government_civic', 'public_meetings'),
    ).toBe(true);
  });
});
