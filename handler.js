const handlebars = require('handlebars');
const fs = require('mz/fs');
const request = require('request-promise-native');
const imageSize = require('probe-image-size');
const aws = require('aws-sdk');
const slugify = require('slugify');

class BadRequestError extends Error {
    toLambdaResponse() {
        return {
            statusCode: 400,
            body: this.message,
            headers: {
                "content-type": "text/plain",
            }
        }
    }
}

module.exports.updateReport = async function(event) {
    let payload;
    try {
        payload = JSON.parse(event.body);
    } catch(e) {
        return new BadRequestError('Invalid JSON payload').toLambdaResponse();
    }
    if (!payload) {
        return new BadRequestError('Missing JSON payload').toLambdaResponse();
    }
    if (!payload.id) {
        return new BadRequestError('ID is missing').toLambdaResponse();
    }

    const report = await request({
        uri: `${process.env.CMS_API_URL}v1/reports/${payload.id}`,
        json: true,
    });

    const fragments = await request({
        uri: `${process.env.CMS_API_URL}v1/reports/fragments/?report=${payload.id}`,
        json: true,
    })

    if (report.media) {
        report.mediaSize = await imageSize(report.media);
    }
    for (f of fragments) {
        if (f.media) {
            f.mediaSize = await imageSize(f.media);
        }
    }

    const data = {
        report,
        fragments,
    };

    const template = (await fs.readFile('template.html.handlebars')).toString();
    const out = handlebars.compile(template)(data);
    
    const s3 = new aws.S3({params: {Bucket: process.env.BUCKET_NAME}});
    const defaultOpts = {
        Body: out,
        ContentType: "text/html",
        ACL: "public-read",
    }
    const date = new Date(report.created);
    const url = `${date.getFullYear()}/${date.getMonth()+1}/${payload.id}-${slugify(report.headline)}`;
    const list = await s3.listObjects({
        Prefix: `${date.getFullYear()}/${date.getMonth()+1}/${payload.id}-`,
    }).promise();
    
    await s3.putObject({
        ...defaultOpts,
        Key: url,
    }).promise();

    for (e of list.Contents) {
        if (e.Key === url) {
            continue;
        }
        await s3.putObject({
            ...defaultOpts,
            Key: e.Key,
            WebsiteRedirectLocation: url,
        }).promise();
    }

    return {
        body: JSON.stringify({success: true}),
        statusCode: 200,
    }
};
