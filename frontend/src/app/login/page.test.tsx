import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';

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

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login form correctly', () => {
    render(<LoginPage />);
    expect(screen.getByText('MediaCentral')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('handles successful login', async () => {
    const { toast } = require('sonner');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ success: true }),
    });

    render(<LoginPage />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Enter your username'), 'admin');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    
    const signInBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'password123' })
      }));
    });

    expect(toast.success).toHaveBeenCalledWith('Welcome back!');
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('handles failed login', async () => {
    const { toast } = require('sonner');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ success: false, error: 'Invalid credentials' }),
    });

    render(<LoginPage />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Enter your username'), 'admin');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrong');
    
    const signInBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid credentials');
    });
  });

  it('handles network error', async () => {
    const { toast } = require('sonner');

    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<LoginPage />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Enter your username'), 'admin');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password');
    
    const signInBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network error. Please try again.');
    });
  });
});
