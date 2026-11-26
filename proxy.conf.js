const { apiUrl: target } = require('./src/environments/environment.development.json');

if (!target) {
  throw new Error('Set apiUrl in src/environments/environment.development.json before starting Angular.');
}

const targetUrl = new URL(target);
if (!['http:', 'https:'].includes(targetUrl.protocol)) {
  throw new Error('The development apiUrl must use HTTP or HTTPS.');
}

module.exports = {
  '/bff/**': {
    target,
    secure: false,
    changeOrigin: false
  }
};
