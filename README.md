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
