import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';

import { SkillsBook } from './SkillsBook';
import { MockDataProvider } from '../../contexts/MockDataContext';
import { makeStore, type AppStore } from '../../store';
import { skillBookDemoSkills } from '../../mocks/skillBookDemo';
import type { Skill } from '../../types/skill';

vi.mock('../../lib/api', () => ({ fetchJson: vi.fn() }));

vi.mock('../../lib/supabase', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'real-user' }, session: null, loading: false })),
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock('../../contexts/GuestContext', () => ({
  useGuest: vi.fn(() => ({ isGuest: false, guestState: null })),
  GuestProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Keep heavy / network-bound children out of these UI-state focused tests.
vi.mock('./DetectedSkillSuggestions', () => ({
  DetectedSkillSuggestions: () => <div data-testid="detected-skill-suggestions" />,
}));
vi.mock('./SkillDetailModal', () => ({
  SkillDetailModal: ({ skill }: { skill: { skill_name: string } }) => (
    <div data-testid="skill-detail-modal">{skill.skill_name}</div>
  ),
}));
vi.mock('../trust/BookTrustSummary', () => ({
  BookTrustSummary: () => <div data-testid="book-trust-summary" />,
}));

import { fetchJson } from '../../lib/api';

/** Build a complete Skill from the demo fixture's first entry + overrides. */
function mkSkill(overrides: Partial<Skill>): Skill {
  return { ...skillBookDemoSkills[0]!, ...overrides };
}

// Small, fully-controlled dataset (one page) for filter/search/category tests.
const SAMPLE_SKILLS: Skill[] = [
  mkSkill({ id: 's-react', skill_name: 'React Development', skill_category: 'technical', current_level: 8, is_active: true }),
  mkSkill({ id: 's-guitar', skill_name: 'Guitar', skill_category: 'creative', current_level: 5, is_active: true }),
  mkSkill({ id: 's-meditation', skill_name: 'Meditation', skill_category: 'physical', current_level: 3, is_active: false }),
];

function wrap(ui: React.ReactElement, store: AppStore = makeStore()) {
  const utils = render(
    <Provider store={store}>
      <MockDataProvider>
        <BrowserRouter>{ui}</BrowserRouter>
      </MockDataProvider>
    </Provider>
  );
  return { store, ...utils };
}

/** Authenticated server path returning a fixed skills payload — deterministic. */
function serveSkills(skills: Skill[]) {
  vi.mocked(fetchJson).mockResolvedValue({ success: true, skills });
}

const getSearchInput = () => screen.getByPlaceholderText(/search by name/i) as HTMLInputElement;
/** Cards render the name as an <h3> (role heading) — unambiguous vs. autocomplete options. */
const findCard = (name: string) => screen.findByRole('heading', { name });
const queryCard = (name: string) => screen.queryByRole('heading', { name });

describe('SkillsBook (Redux integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom doesn't implement scrollIntoView; the book scrolls into view on page change.
    Element.prototype.scrollIntoView = vi.fn();
    // Keep the MockDataProvider backend health check deterministic (healthy).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }));
    serveSkills(SAMPLE_SKILLS);
  });

  it('renders fetched skills without crashing', async () => {
    wrap(<SkillsBook />);
    expect(await findCard('React Development')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Guitar' })).toBeInTheDocument();
  });

  it('drives the search term through Redux and filters the list', async () => {
    const { store } = wrap(<SkillsBook />);
    await findCard('React Development');

    fireEvent.change(getSearchInput(), { target: { value: 'React' } });

    await waitFor(() => {
      expect(store.getState().skillsBook.searchTerm).toBe('React');
    });
    expect(await findCard('React Development')).toBeInTheDocument();
    expect(queryCard('Guitar')).not.toBeInTheDocument();
  });

  it('shows the empty state when the search matches nothing', async () => {
    wrap(<SkillsBook />);
    await findCard('React Development');

    fireEvent.change(getSearchInput(), { target: { value: 'zzzzz-no-match' } });

    expect(await screen.findByText(/no skills found/i)).toBeInTheDocument();
    expect(queryCard('React Development')).not.toBeInTheDocument();
  });

  it('updates the active category in Redux when a filter pill is clicked', async () => {
    const { store } = wrap(<SkillsBook />);
    await findCard('React Development');

    fireEvent.click(screen.getByRole('button', { name: /^Active/ }));

    await waitFor(() => {
      expect(store.getState().skillsBook.activeCategory).toBe('active');
    });
    // Inactive skill drops out of the active filter.
    expect(queryCard('Meditation')).not.toBeInTheDocument();
  });

  it('updates the sort option in Redux', async () => {
    const { store } = wrap(<SkillsBook />);
    await findCard('React Development');

    fireEvent.change(screen.getByLabelText(/sort skills/i), { target: { value: 'level_desc' } });

    expect(store.getState().skillsBook.sortBy).toBe('level_desc');
  });

  it('toggles the advanced filter panel and clamps an out-of-range level input', async () => {
    const { store } = wrap(<SkillsBook />);
    await findCard('React Development');

    // The advanced-filters toggle is the "More" pill.
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    const spinners = await screen.findAllByRole('spinbutton');

    // 99 is out of range — the reducer clamps it to the max level (20).
    fireEvent.change(spinners[0]!, { target: { value: '99' } });
    expect(store.getState().skillsBook.filterLevelMin).toBe(20);
  });

  it('hydrates view state from a preloaded Redux store (single source of truth)', async () => {
    const store = makeStore({
      skillsBook: { ...makeStore().getState().skillsBook, searchTerm: 'Guitar' },
    });
    wrap(<SkillsBook />, store);

    expect(await findCard('Guitar')).toBeInTheDocument();
    expect(queryCard('React Development')).not.toBeInTheDocument();
    expect(getSearchInput().value).toBe('Guitar');
  });

  it('paginates a large skill set and advances/clamps the page through Redux', async () => {
    const many: Skill[] = Array.from({ length: 30 }, (_, i) =>
      mkSkill({ id: `bulk-${i}`, skill_name: `Bulk Skill ${String(i).padStart(2, '0')}` })
    );
    serveSkills(many);

    const { store } = wrap(<SkillsBook />);

    // 30 skills / 12 per page ⇒ 3 pages ⇒ pagination controls render.
    const next = await screen.findByRole('button', { name: /next/i });
    expect(store.getState().skillsBook.currentPage).toBe(1);

    fireEvent.click(next);
    await waitFor(() => {
      expect(store.getState().skillsBook.currentPage).toBe(2);
    });

    fireEvent.click(screen.getByRole('button', { name: /prev/i }));
    await waitFor(() => {
      expect(store.getState().skillsBook.currentPage).toBe(1);
    });
  });

  it('shows a loading skeleton while the fetch is pending', async () => {
    vi.mocked(fetchJson).mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = wrap(<SkillsBook />);
    await waitFor(() => {
      expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });
  });

  it('renders gracefully when the skills fetch rejects (error handling)', async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error('network error'));
    const { container } = wrap(<SkillsBook />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
    expect(await screen.findByText(/no skills found/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(queryCard('React Development')).not.toBeInTheDocument();
  });

  it('opens the skill detail modal when a card is clicked', async () => {
    wrap(<SkillsBook />);
    const card = await findCard('React Development');

    fireEvent.click(card);

    const modal = await screen.findByTestId('skill-detail-modal');
    expect(within(modal).getByText('React Development')).toBeInTheDocument();
  });
});
