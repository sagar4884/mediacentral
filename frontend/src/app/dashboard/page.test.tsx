import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';

// Mock Recharts to avoid ResizeObserver issues in jsdom
jest.mock('recharts', () => {
  const OriginalRecharts = jest.requireActual('recharts');
  return {
    ...OriginalRecharts,
    ResponsiveContainer: ({ children }: any) => (
      <div style={{ width: 800, height: 800 }}>{children}</div>
    ),
  };
});

global.fetch = jest.fn();

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {})); // Never resolves
    render(<DashboardPage />);
    expect(screen.getByText('Loading dashboard data...')).toBeInTheDocument();
  });

  it('renders dashboard with stats data', async () => {
    const mockStats = {
      totalMovies: 120,
      totalShows: 45,
      storageBytes: 1000000000, // 1GB
      moviesBytes: 600000000,
      showsBytes: 300000000,
      totalSpace: 2000000000, // 2GB
      freeSpace: 1000000000,
      recent: [
        { id: 1, name: 'Inception', year: 2010, source: 'radarr', sizeOnDisk: 5000000, keepStatus: 'kept' }
      ]
    };

    const mockRealtime = {
      success: true,
      tautulli: { activeStreams: 2, totalBandwidth: 15000 },
      unraid: { cpuLoad: 45.5, cpuTemp: 60, ramTotal: 32000000000, ramUsed: 16000000000, gpuLoad: 20, gpuTemp: 55, gpuMemTotal: 8000000000, gpuMemUsed: 2000000000 }
    };

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/media/stats') {
        return Promise.resolve({ json: () => Promise.resolve(mockStats) });
      }
      if (url === '/api/realtime') {
        return Promise.resolve({ json: () => Promise.resolve(mockRealtime) });
      }
      return Promise.reject(new Error('not found'));
    });

    render(<DashboardPage />);

    // Wait for the data to load
    await waitFor(() => {
      expect(screen.queryByText('Loading dashboard data...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Total Storage Overview')).toBeInTheDocument();
    
    // Check specific stats
    expect(screen.getByText('120')).toBeInTheDocument(); // total movies
    expect(screen.getByText('45')).toBeInTheDocument(); // total shows

    // Check realtime
    expect(screen.getByText('45.5%')).toBeInTheDocument(); // CPU
    expect(screen.getByText('50.0%')).toBeInTheDocument(); // RAM used % (16 / 32)
    expect(screen.getByText('2')).toBeInTheDocument(); // Streams

    // Check recent curation item
    expect(screen.getByText('Inception')).toBeInTheDocument();
    expect(screen.getByText('(2010)')).toBeInTheDocument();
    expect(screen.getByText('KEPT')).toBeInTheDocument();
  });
});
