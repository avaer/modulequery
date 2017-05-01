const path = require('path');
const fs = require('fs');

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
    // const localModulePath = path.join(dirname, 'plugins');
  }

  search({q = ''} = {}) {
    const {dirname, modulePath} = this;

    const _requestAllLocalModules = () => new Promise((accept, reject) => {
      fs.readdir(path.join(dirname, modulePath), (err, files) => {
        if (!err) {
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
              const filePath = path.join('/', 'plugins', file);

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
      .then(modules => {
        const filteredModules = plugins.filter(plugin => {
          const name = path.basename(plugin);
          return name.indexOf(q) !== -1;
        });

        return _getModules(filteredModules);
      });
    const _requestNpmModules = q => npm.requestSearch(q)
      .then(results => {
        const mods = results.map(({package: {name}}) => name);

        return _getModules(mods);
      });

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

  const getModule(mod) {
    // const {dirname, modulePath} = this;

    const _getModulePackageJson = plugin => new Promise((accept, reject) => {
    if (path.isAbsolute(plugin)) {
      if (plugin.indexOf(modulePath) === 0) {
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
      } else {
        const err = new Error('Invalid local module path: ' + JSON.stringify(plugin));
        reject(err);
      }
    } else {
      npm.requestPackageJson(plugin)
        .then(accept)
        .catch(reject);
    }
  });
  const _getModuleVersions = plugin => new Promise((accept, reject) => {
    if (path.isAbsolute(plugin)) {
      if (plugin.indexOf(modulePath) === 0) {
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
      } else {
        const err = new Error('Invalid local module path: ' + JSON.stringify(plugin));
        reject(err);
      }
    } else {
      npm.requestPackageVersions(plugin)
        .then(accept)
        .catch(reject);
    }
  });
  const _getModuleReadme = plugin => new Promise((accept, reject) => {
    if (path.isAbsolute(plugin)) {
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
    } else {
      npm.requestReadme(plugin)
        .then(accept)
        .catch(reject);
    }
  });

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
        hasClient: Boolean(packageJson.client),
        hasServer: Boolean(packageJson.server),
        hasWorker: Boolean(packageJson.worker),
        local: path.isAbsolute(mod),
        matrix: DEFAULT_TAG_MATRIX,
        metadata: {},
      }));
  }

  /* const _getModuleReadmeMd = plugin => new Promise((accept, reject) => {
    if (path.isAbsolute(plugin)) {
      fs.readFile(path.join(dirname, plugin, 'README.md'), 'utf8', (err, s) => {
        if (!err) {
          accept(_renderMarkdown(s));
        } else if (err.code === 'ENOENT') {
           accept('');
        } else {
          reject(err);
        }
      });
    } else {
      npm.requestReadmeMd(plugin)
        .then(s => {
          accept(_renderMarkdown(s));
        })
        .catch(reject);
    }
  }); */
  /* const _getModules = mod => Promise.all([
    _getModulePackageJson(mod),
    _getModuleReadmeMd(mod),
  ])
    .then(([
      packageJson,
      readmeMd,
    ]) => ({
      type: 'element',
      id: mod,
      name: mod,
      displayName: packageJson.name,
      version: packageJson.version,
      description: packageJson.description || null,
      readme: readmeMd || '',
      hasClient: Boolean(packageJson.client),
      hasServer: Boolean(packageJson.server),
      hasWorker: Boolean(packageJson.worker),
      local: path.isAbsolute(mod),
      matrix: DEFAULT_TAG_MATRIX,
    })); */
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
/* const _renderMarkdown = s => showdownConverter
  .makeHtml(s)
  .replace(/&mdash;/g, '-')
  .replace(/(<code\s*[^>]*?>)([^>]*?)(<\/code>)/g, (all, start, mid, end) => start + mid.replace(/\n/g, '<br/>') + end)
  .replace(/\n+/g, ' '); */

module.exports = ModuleQuery;
