const service = () => 'hackingstudio-informant-amp';

const fetchConfig = require('@wdr-data/s3-env-config').configure;

const getStage = async (envParam = null) => {
  const env = envParam || await fetchConfig();
  return process.env.SLS_STAGE || env.DEPLOY_ALIAS || 'dev';
};

const getBucketName = async () => `${service()}-web-${await getStage()}`;

const fetch = async () => {
  const env = await fetchConfig();
  return {
    ...env,
    BUCKET_NAME: await getBucketName(),
  };
};

module.exports = {
  service,
  fetch,
  getStage,
  getBucketName,
};