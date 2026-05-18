import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const successRate = new Rate('success_rate');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m',  target: 30 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    success_rate: ['rate>0.95'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export function setup() {
  // Login to get a session token
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      email: __ENV.TEST_EMAIL || 'admin@excess.test',
      password: __ENV.TEST_PASSWORD || 'TestPass123!',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(loginRes, { 'login ok': (r) => r.status === 200 });

  const token = loginRes.json('data.token');
  return { token };
}

export default function ({ token }) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // List leads
  const leadsRes = http.get(`${BASE_URL}/leads?take=20`, { headers });
  check(leadsRes, { 'leads 200': (r) => r.status === 200 });
  successRate.add(leadsRes.status === 200);

  sleep(0.5);

  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health ok': (r) => r.status === 200 });

  sleep(0.5);
}
