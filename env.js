const envConfig = require('@wdr-data/s3-env-config');

const service = () => 'hackingstudio-informant-amp';

const fetchConfig = envConfig.configure;

const getStage = async () => {
  const env = await fetchConfig();
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