import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from './page';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

global.fetch = jest.fn();

// Mock window.confirm
window.confirm = jest.fn(() => true);

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders settings page and tabs', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({}),
      ok: true
    });

    render(<SettingsPage />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    
    // Check tabs
    expect(screen.getByText('Unraid')).toBeInTheDocument();
    expect(screen.getByText('Media Services')).toBeInTheDocument();
    expect(screen.getByText('Metadata APIs')).toBeInTheDocument();
    expect(screen.getByText('Plex & Tautulli')).toBeInTheDocument();
    expect(screen.getByText('Google AI')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Backup & Restore')).toBeInTheDocument();
    
    // Check initial tab content
    expect(screen.getByText('Unraid Storage Integration')).toBeInTheDocument();
  });

  it('navigates between tabs', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({}),
      ok: true
    });

    render(<SettingsPage />);
    const user = userEvent.setup();

    // Click Media Services
    await user.click(screen.getByText('Media Services'));
    expect(screen.getByText('Radarr Integration')).toBeInTheDocument();

    // Click Plex & Tautulli
    await user.click(screen.getByText('Plex & Tautulli'));
    expect(screen.getByText('Plex Integration')).toBeInTheDocument();
    expect(screen.getByText('Tautulli Integration')).toBeInTheDocument();
  });

  it('tests connection for a service', async () => {
    const { toast } = require('sonner');
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/settings/test') {
        return Promise.resolve({
          json: async () => ({ success: true, message: 'Connection successful!' })
        });
      }
      return Promise.resolve({ json: async () => ({}) });
    });

    render(<SettingsPage />);
    const user = userEvent.setup();

    // There might be multiple "Test Connection" buttons depending on which tab is active. 
    // Unraid tab is active by default.
    const testBtns = screen.getAllByRole('button', { name: /test connection/i });
    await user.click(testBtns[0]); // Unraid Test

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/settings/test', expect.any(Object));
      expect(toast.success).toHaveBeenCalledWith('Connection successful!');
    });
  });
});
