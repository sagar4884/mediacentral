import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlexPage from './page';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

global.fetch = jest.fn();

describe('PlexPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders plex page and tabs', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ([]),
      ok: true
    });

    render(<PlexPage />);

    expect(screen.getByText('Plex RBAC Management')).toBeInTheDocument();
    
    // Check tabs
    expect(screen.getByText('1. Libraries')).toBeInTheDocument();
    expect(screen.getByText('2. Groups')).toBeInTheDocument();
    expect(screen.getByText('3. Roles')).toBeInTheDocument();
    expect(screen.getByText('4. Users')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('fetches and displays libraries', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/plex/libraries') {
        return Promise.resolve({
          json: async () => ([{ id: '1', name: 'Movies', type: 'movie' }]),
          ok: true
        });
      }
      return Promise.resolve({ json: async () => ([]), ok: true });
    });

    render(<PlexPage />);

    await waitFor(() => {
      expect(screen.getByText('Movies')).toBeInTheDocument();
    });
  });

  it('navigates to groups tab and shows groups', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/plex/groups') {
        return Promise.resolve({
          json: async () => ([{ id: 'g1', name: 'Family Group', libraries: [] }]),
          ok: true
        });
      }
      return Promise.resolve({ json: async () => ([]), ok: true });
    });

    render(<PlexPage />);
    const user = userEvent.setup();

    await user.click(screen.getByText('2. Groups'));

    await waitFor(() => {
      expect(screen.getByText('Family Group')).toBeInTheDocument();
    });
  });

  it('navigates to users tab and shows users', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/plex/users') {
        return Promise.resolve({
          json: async () => ([{ id: 'u1', username: 'john_doe', isImmune: false, warnings: 0, banUntil: null, roleId: null }]),
          ok: true
        });
      }
      return Promise.resolve({ json: async () => ([]), ok: true });
    });

    render(<PlexPage />);
    const user = userEvent.setup();

    await user.click(screen.getByText('4. Users'));

    await waitFor(() => {
      expect(screen.getByText('john_doe')).toBeInTheDocument();
    });
  });
});
