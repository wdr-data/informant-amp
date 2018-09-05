# informant-amp
Exporting AMP pages of content created for the Informant news bot

## Deployment

```bash
# Staging
aws s3 mb s3://hackingstudio-informant-amp-staging-serverlessdeployment --region eu-central-1

# Production
aws s3 mb s3://hackingstudio-informant-amp-prod-serverlessdeployment --region eu-central-1
```

```bash
export SLS_STAGE=prod
sls package
sls deploy -p .serverless
```

For local testing deployment:

- If exists: Delete existing Deployment-Bucket in S3 and Serverless-Stack in CloudFormation
- Make sure that a personal deploy alias is set in `.env.yml`
- In S3, create a new Deployment-Bucket using the scheme `hackingstudio-informant-amp-{deployalias}-serverlessdeployment`
- In `serverless.yml` delete key `provider > role` (DO NOT COMMIT)
- `yarn sls deploy` should deploy now
