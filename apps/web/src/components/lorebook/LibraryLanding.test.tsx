import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LibraryLanding } from './LibraryLanding';

// LibraryLanding calls useNavigate(), so it must render inside a Router
const render: typeof rtlRender = (ui, options) =>
  rtlRender(<MemoryRouter>{ui}</MemoryRouter>, options);

describe('LibraryLanding', () => {
  const mockOnGenerate = vi.fn();
  const mockOnReadBook = vi.fn();
  const mockOnEditBook = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(
      <LibraryLanding onGenerate={mockOnGenerate} />
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders all category buttons', () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    // Each category button renders its label text inside a div — use getByText
    // rather than getByRole because the button's computed accessible name in jsdom
    // includes the description div (not hidden without CSS), making role queries fragile.
    expect(screen.getByText('Full Biography')).toBeInTheDocument();
    expect(screen.getByText('A Person')).toBeInTheDocument();
    expect(screen.getByText('Career')).toBeInTheDocument();
    expect(screen.getByText('Relationship')).toBeInTheDocument();
  });

  it('renders a query input', () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('calls onGenerate with the typed query when Generate is clicked', async () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'my journey with music' } });

    const generateBtn = screen.getByRole('button', { name: /generate/i });
    fireEvent.click(generateBtn);

    expect(mockOnGenerate).toHaveBeenCalledWith('my journey with music');
  });

  it('pre-fills query when a category is clicked', async () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const careerBtn = screen.getByRole('button', { name: /Career/i });
    fireEvent.click(careerBtn);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toMatch(/professional journey/i);
    });
  });

  it('calls onGenerate via Enter key on input', () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'the story of my first job' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(mockOnGenerate).toHaveBeenCalledWith('the story of my first job');
  });

  it('does not call onGenerate when query is empty', () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} />);
    const generateBtn = screen.getByRole('button', { name: /generate/i });
    fireEvent.click(generateBtn);
    expect(mockOnGenerate).not.toHaveBeenCalled();
  });

  it('renders demo books when onReadBook is provided', () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} onReadBook={mockOnReadBook} onEditBook={mockOnEditBook} isMockData={true} />);
    expect(screen.getByText('The Keeper of Marrowvale')).toBeInTheDocument();
  });

  it('calls onReadBook when Read is clicked on a demo book', async () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} onReadBook={mockOnReadBook} onEditBook={mockOnEditBook} isMockData={true} />);
    const readBtn = screen.getAllByRole('button', { name: /^Read$/i })[0];
    fireEvent.click(readBtn);
    await waitFor(() => {
      expect(mockOnReadBook).toHaveBeenCalledWith('demo-1');
    });
  });

  it('calls onEditBook when Edit is clicked on a demo book', async () => {
    render(<LibraryLanding onGenerate={mockOnGenerate} onReadBook={mockOnReadBook} onEditBook={mockOnEditBook} isMockData={true} />);
    const editBtn = screen.getAllByRole('button', { name: /^Edit$/i })[0];
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(mockOnEditBook).toHaveBeenCalledWith('demo-1');
    });
  });
});
