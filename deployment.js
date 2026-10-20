function normalizedBaseUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.search || url.hash || !/^(?:\/[A-Za-z0-9_-]+)*\/?$/.test(url.pathname)) {
    throw new Error('APP_BASE_URL에는 쿼리 없는 HTTP/HTTPS 앱 주소를 설정하세요.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

function applicationBasePath(value) {
  return normalizedBaseUrl(value).pathname.replace(/\/$/, '');
}

function publicPageUrl(baseUrl, page) {
  return new URL(page.replace(/^\/+/, ''), normalizedBaseUrl(baseUrl));
}

function additionalOrigins(value = '') {
  return value.split(',').map((origin) => origin.trim()).filter(Boolean).map((origin) => {
    const url = normalizedBaseUrl(origin);
    if (url.pathname !== '/') throw new Error('APP_ALLOWED_ORIGINS에는 경로 없이 접속 주소만 설정하세요.');
    return url.origin;
  });
}

function mountApplication(express, app, basePath) {
  if (!basePath) return app;
  const host = express();
  host.get(basePath, (req, res, next) => {
    if (req.path !== basePath) return next();
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex < 0 ? '' : req.originalUrl.slice(queryIndex);
    res.redirect(308, `${basePath}/${query}`);
  });
  host.use(basePath, app);
  return host;
}

module.exports = { applicationBasePath, publicPageUrl, mountApplication, additionalOrigins };
