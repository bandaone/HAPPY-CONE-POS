import { defineConfig, devices } from '@playwright/test';

const apiPython = process.env.API_PYTHON || '../api/.venv/bin/python';
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      channel: process.env.CI ? undefined : 'chrome',
    },
  }],
  webServer: [
    {command:`${shellQuote(apiPython)} e2e/server.py`,url:'http://127.0.0.1:8001/health',timeout:30_000,reuseExistingServer:false},
    {command:'npm run preview -- --host 127.0.0.1 --port 5174',url:'http://127.0.0.1:5174',env:{HAPPY_CONE_API_TARGET:'http://127.0.0.1:8001'},timeout:30_000,reuseExistingServer:false},
  ],
});
