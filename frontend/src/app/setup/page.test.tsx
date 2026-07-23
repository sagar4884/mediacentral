import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetupPage from './page';

// Mock next/navigation
const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    refresh: mockRefresh,
  })),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('SetupPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders setup form correctly', () => {
    render(<SetupPage />);
    expect(screen.getByText('Welcome to MediaCentral')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin')).toBeInTheDocument();
    
    // There are two password fields (password, confirmPassword), but they don't have placeholders, they have labels
    expect(screen.getByText('Admin Username')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete setup/i })).toBeInTheDocument();
  });

  it('prevents submission if passwords do not match', async () => {
    const { toast } = require('sonner');
    render(<SetupPage />);

    const user = userEvent.setup();
    const usernameInput = screen.getByPlaceholderText('admin');
    const passwordInputs = screen.getAllByRole('textbox', { hidden: true }); // Using hidden true because type="password" is not accessible by default via textbox
    
    // Fallback to querySelector for precise targeting
    const passInput = document.querySelector('input[type="password"]:not([placeholder])') as HTMLInputElement;
    const confirmPassInputs = document.querySelectorAll('input[type="password"]');
    
    await user.type(usernameInput, 'admin');
    await user.type(confirmPassInputs[0], 'password123');
    await user.type(confirmPassInputs[1], 'password124');
    
    const submitBtn = screen.getByRole('button', { name: /complete setup/i });
    expect(submitBtn).toBeDisabled();
    
    // In our UI, it's disabled so click shouldn't do anything, but let's test the react logic
    fireEvent.click(submitBtn);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('handles successful setup', async () => {
    const { toast } = require('sonner');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ success: true }),
    });

    render(<SetupPage />);
    const user = userEvent.setup();
    const usernameInput = screen.getByPlaceholderText('admin');
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    await user.type(usernameInput, 'admin');
    await user.type(passwordInputs[0], 'password123');
    await user.type(passwordInputs[1], 'password123');
    
    const submitBtn = screen.getByRole('button', { name: /complete setup/i });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/setup', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'password123' })
      }));
    });

    expect(toast.success).toHaveBeenCalledWith('Setup complete! Welcome.');
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockRefresh).toHaveBeenCalled();
  });
});
