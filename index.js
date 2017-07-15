const path = require('path');
const fs = require('fs');
const https = require('follow-redirects').https;

const marked = require('marked');

const DEFAULT_TAG_MATRIX = [
  0, 0, 0,
  0, 0, 0, 1,
  1, 1, 1,
];

class ModuleQuery {
  constructor({dirname = __dirname, modulePath = ''} = {}) {
    this.dirname = dirname;
    this.modulePath = modulePath;
  }

  search(q = '', {keywords = [], includeScoped = false} = {}) {
    const {dirname, modulePath} = this;

    const _requestAllLocalModules = () => new Promise((accept, reject) => {
      fs.readdir(path.join(dirname, modulePath), (err, files) => {
        if (!err || err.code === 'ENOENT') {
          files = files || [];

          if (files.length > 0) {
            const result = [];
            let pending = files.length;
            const pend = () => {
              if (--pending === 0) {
                accept(result.sort((a, b) => path.basename(a).localeCompare(path.basename(b))));
              }
            };

            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const filePath = path.join(modulePath, file);

              fs.lstat(path.join(dirname, filePath), (err, stats) => {
                if (!err) {
                  if (stats.isDirectory()) {
                    result.push(filePath);
                  }
                } else {
                  console.warn(err);
                }

                pend();
              });
            }
          } else {
            accept([]);
          }
        } else {
          reject(err);
        }
      });
    });
    const _getModules = mods => Promise.all(mods.map(mod => this.getModule(mod)));
    const _requestLocalModules = q => _requestAllLocalModules()
      .then(modules => modules.filter(module => {
        const name = path.basename(module);
        return name.indexOf(q) !== -1;
      }))
      .then(_getModules);
    const _requestNpmModules = q => new Promise((accept, reject) => {
      const _rejectApiError = _makeRejectApiError(reject);

      https.get({
        hostname: 'registry.npmjs.org',
        path: '/-/v1/search?text=' + encodeURIComponent(q) + '+keywords:' + keywords.join(','),
      }, proxyRes => {
        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
          _getResponseJson(proxyRes, (err, j) => {
            if (!err) {
              if (typeof j === 'object' && j !== null) {
                const {objects} = j;

                if (Array.isArray(objects)) {
                  const mods = objects.map(({package: {name}}) => name);
                  accept(mods);
                } else {
                  _rejectApiError();
                }
              } else {
                _rejectApiError();
              }
            } else {
              _rejectApiError(500, err.stack);
            }
          });
        } else {
          _rejectApiError(proxyRes.statusCode);
        }
      }).on('error', err => {
        _rejectApiError(500, err.stack);
      });
    })
    .then(modules => {
      if (includeScoped) {
        return modules;
      } else {
        return modules.filter(module => !/^@/.test(module));
      }
    })
    .then(_getModules);

    return Promise.all([
      _requestLocalModules(q),
      _requestNpmModules(q),
    ])
      .then(([
        localModSpecs,
        npmModSpecs,
      ]) => {
        const modSpecs = localModSpecs.concat(npmModSpecs);
        return Promise.resolve(modSpecs);
      });
  }

  getModule(mod) {
    const {dirname, modulePath} = this;

    const _getModulePackageJson = plugin => {
      const _getLocalModulePackageJson = plugin => new Promise((accept, reject) => {
        fs.readFile(path.join(dirname, plugin, 'package.json'), 'utf8', (err, s) => {
          if (!err) {
            const j = _jsonParse(s);

            if (j !== null) {
              accept(j);
            } else {
              const err = new Error('Failed to parse package.json for ' + JSON.stringify(plugin));
              reject(err);
            }
          } else {
            reject(err);
          }
        });
      });
      const _getNpmModulePackageJson = module => new Promise((accept, reject) => {
        const _rejectApiError = _makeRejectApiError(reject);

        https.get({
          hostname: 'unpkg.com',
          path: '/' + module + '/package.json',
        }, proxyRes => {
          if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
            _getResponseJson(proxyRes, (err, j) => {
              if (!err) {
                if (typeof j === 'object' && j !== null) {
                  accept(j);
                } else {
                  _rejectApiError();
                }
              } else {
                _rejectApiError(proxyRes.statusCode);
              }
            });
          } else {
            _rejectApiError(proxyRes.statusCode);
          }
        }).on('error', err => {
          _rejectApiError(500, err.stack);
        });
      });

      if (path.isAbsolute(plugin)) {
        return _getLocalModulePackageJson(plugin);
      } else {
        return _getNpmModulePackageJson(plugin);
      }
    };
    const _getModuleVersions = plugin => {
      const _getLocalModuleVersions = plugin => new Promise((accept, reject) => {
        fs.readFile(path.join(dirname, plugin, 'package.json'), 'utf8', (err, s) => {
          if (!err) {
            const j = _jsonParse(s);

            if (j !== null) {
              const {version = '0.0.1'} = j;
              const versions = [version];

              accept(versions);
            } else {
              const err = new Error('Failed to parse package.json for ' + JSON.stringify(plugin));
              reject(err);
            }
          } else {
            reject(err);
          }
        });
      });
      const _getNpmModuleVersions = module => new Promise((accept, reject) => {
        const _rejectApiError = _makeRejectApiError(reject);

        https.get({
          hostname: 'registry.npmjs.org',
          path: '/' + module,
        }, proxyRes => {
          if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
            _getResponseJson(proxyRes, (err, j) => {
              if (!err) {
                if (typeof j === 'object' && j !== null && typeof j.versions === 'object' && j.versions !== null) {
                  const versions = Object.keys(j.versions);
                  accept(versions);
                } else {
                  _rejectApiError();
                }
              } else {
                _rejectApiError(proxyRes.statusCode);
              }
            });
          } else {
            _rejectApiError(proxyRes.statusCode);
          }
        }).on('error', err => {
          _rejectApiError(500, err.stack);
        });
      });

      if (path.isAbsolute(plugin)) {
        return _getLocalModuleVersions(plugin);
      } else {
        return _getNpmModuleVersions(plugin);
      }
    };
    const _getModuleReadme = plugin => {
      const _getLocalModuleReadme = module => new Promise((accept, reject) => {
        if (plugin.indexOf(modulePath) === 0) {
          fs.readFile(path.join(dirname, plugin, 'README.md'), 'utf8', (err, s) => {
            if (!err) {
              accept(s);
            } else if (err.code === 'ENOENT') {
              accept(null);
            } else {
              reject(err);
            }
          });
        } else {
          const err = new Error('Invalid local module path: ' + JSON.stringify(plugin));
          reject(err);
        }
      });
      const _getNpmModuleReadme = module => new Promise((accept, reject) => {
        const _rejectApiError = _makeRejectApiError(reject);

        https.get({
          hostname: 'unpkg.com',
          path: '/' + module + '/README.md',
        }, proxyRes => {
          if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
            _getResponseString(proxyRes, (err, s) => {
              if (!err) {
                accept(s);
              } else {
                _rejectApiError(proxyRes.statusCode);
              }
            });
          } else if (proxyRes.statusCode === 404) {
            accept(null);
          } else {
            _rejectApiError(proxyRes.statusCode);
          }
        }).on('error', err => {
          _rejectApiError(500, err.stack);
        });
      });

      if (path.isAbsolute(plugin)) {
        return _getLocalModuleReadme(plugin);
      } else {
        return _getNpmModuleReadme(plugin);
      }
    };

    return Promise.all([
      _getModulePackageJson(mod),
      _getModuleVersions(mod),
      _getModuleReadme(mod),
    ])
      .then(([
        packageJson,
        versions,
        readme,
      ]) => ({
        type: 'module',
        id: mod,
        name: mod,
        displayName: packageJson.name,
        version: packageJson.version,
        versions: versions,
        description: packageJson.description || null,
        readme: readme ? marked(readme) : null,
        asset: packageJson.asset || null,
        hasClient: Boolean(packageJson.client),
        hasServer: Boolean(packageJson.server),
        hasWorker: Boolean(packageJson.worker),
        local: path.isAbsolute(mod),
        matrix: DEFAULT_TAG_MATRIX,
        metadata: {},
      }));
  }
}

const _jsonParse = s => {
  let error = null;
  let result;
  try {
    result = JSON.parse(s);
  } catch (err) {
    error = err;
  }
  if (!error) {
    return result;
  } else {
    return null;
  }
};
const _makeRejectApiError = reject => (statusCode = 500, message = 'API Error: ' + statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  reject(err); 
};
const _getResponseString = (res, cb) => {
  const bs = [];
  res.on('data', d => {
    bs.push(d);
  });
  res.on('end', () => {
    const b = Buffer.concat(bs);
    const s = b.toString('utf8');

    cb(null, s);
  });
  res.on('error', err => {
    cb(err);
  });
};
const _getResponseJson = (res, cb) => {
  _getResponseString(res, (err, s) => {
    if (!err) {
      const j = _jsonParse(s);

      cb(null, j);
    } else {
      cb(err);
    }
  });
};
/* const _renderMarkdown = s => showdownConverter
  .makeHtml(s)
  .replace(/&mdash;/g, '-')
  .replace(/(<code\s*[^>]*?>)([^>]*?)(<\/code>)/g, (all, start, mid, end) => start + mid.replace(/\n/g, '<br/>') + end)
  .replace(/\n+/g, ' '); */

const _makeModuleQuery = opts => new ModuleQuery(opts);
module.exports = _makeModuleQuery;
