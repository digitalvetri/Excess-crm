import axios from 'axios';

export const api = axios.create({
  // Relative baseURL: browser calls /api/v1/... on same origin.
  // Next.js rewrites in next.config.mjs proxy these to INTERNAL_API_URL at runtime.
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Let FormData requests set their own Content-Type (with boundary)
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
