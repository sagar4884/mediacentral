import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CurationPage from './page';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

global.fetch = jest.fn();

describe('CurationPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders curation page and basic controls', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ([]),
      ok: true
    });

    render(<CurationPage />);

    expect(screen.getByText('Curation Dashboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /movies/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /shows/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /waiting/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marked delete/i })).toBeInTheDocument();
  });

  it('fetches and displays media items', async () => {
    const mockMedia = [
      {
        id: '1',
        name: 'The Matrix',
        year: 1999,
        sizeOnDisk: 1500000000,
        path: '/movies/The Matrix (1999)',
        aiScore: 90,
        keepStatus: 'waiting',
        source: 'Radarr',
        metadata: '{}',
        tags: '[]'
      }
    ];

    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => (mockMedia),
      ok: true
    });

    render(<CurationPage />);

    await waitFor(() => {
      expect(screen.getByText('The Matrix')).toBeInTheDocument();
    });
  });

  it('triggers manual curate sync', async () => {
    const { toast } = require('sonner');
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/media?')) {
        return Promise.resolve({ json: async () => ([]), ok: true });
      }
      if (url === '/api/media/manual-curate') {
        return Promise.resolve({
          json: async () => ({ updatedCount: 5 }),
          ok: true
        });
      }
      return Promise.resolve({ json: async () => ({}), ok: true });
    });

    render(<CurationPage />);
    const user = userEvent.setup();

    const manualCurateBtn = screen.getByRole('button', { name: /manual curate all/i });
    await user.click(manualCurateBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/media/manual-curate', expect.any(Object));
      expect(toast.success).toHaveBeenCalledWith('Successfully curated 5 watched items');
    });
  });
});
