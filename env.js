const fetchConfig = require('@wdr-data/s3-env-config').configure;

module.exports.fetch = () => fetchConfig();
module.exports.getStage = () => {
  const env = fetchConfig();
  return process.env.SLS_STAGE || env.DEPLOY_ALIAS || 'dev';
};
