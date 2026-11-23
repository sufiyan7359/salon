// Frontend and backend deploy as separate Render services (see
// render.yaml at the repo root), so these need to be absolute URLs
// rather than same-origin relative paths.
export const environment = {
  production: true,
  apiUrl: 'https://shadab-yaseen-salon-api.onrender.com/api',
  socketUrl: 'https://shadab-yaseen-salon-api.onrender.com',
};
