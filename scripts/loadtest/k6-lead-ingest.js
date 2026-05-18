import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const errors = new Counter('errors');
const successRate = new Rate('success_rate');

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp up
    { duration: '2m',  target: 50 },  // sustained load
    { duration: '30s', target: 100 }, // peak
    { duration: '30s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    success_rate: ['rate>0.99'],       // 99% success rate
    errors: ['count<10'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const INDIAMART_WEBHOOK_KEY = __ENV.INDIAMART_KEY || 'test-key';

export default function () {
  const payload = JSON.stringify({
    QUERY_ID: `K6-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    SENDER_NAME: 'Load Test Lead',
    SENDER_MOBILE: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    SENDER_EMAIL: 'loadtest@example.com',
    SUBJECT: 'Solar Panel Enquiry',
    CITY: 'Coimbatore',
    STATE: 'Tamil Nadu',
  });

  const res = http.post(
    `${BASE_URL}/webhooks/indiamart`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-IndiaMART-Key': INDIAMART_WEBHOOK_KEY,
      },
    },
  );

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'has data': (r) => r.json('data') !== undefined,
  });

  if (!ok) errors.add(1);
  successRate.add(ok);

  sleep(0.1);
}
