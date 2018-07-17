const handlebars = require('handlebars');
const fs = require('mz/fs');
const request = require('request-promise-native');
const imageSize = require('probe-image-size');
const aws = require('aws-sdk');
const slugify = require('slugify');
const { js2xml, xml2js } = require('xml-js');

const LambdaResponseMixin = (Base) =>
    class extends Base {
        toLambdaResponse() {
            return {
                statusCode: this.statusCode || 500,
                body: this.message,
                headers: {
                    "content-type": "text/plain",
                }
            }
        }
    };

class BadRequestError extends LambdaResponseMixin(Error) {
    constructor(message) {
        super(message);
        this.statusCode = 500;
    }
}

const s3 = new aws.S3({params: {Bucket: process.env.BUCKET_NAME}});

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

    const apiData = await getData(payload.id);
    const { report, fragments } = apiData;

    const date = new Date(report.created);
    const urlBase = `${date.getFullYear()}/${date.getMonth()+1}`;
    const url = `${urlBase}/${payload.id}-${slugify(report.headline)}`;

    const template = (await fs.readFile('template.html.handlebars')).toString();
    const out = handlebars.compile(template)({
        ...apiData,
        url,
    });
    await storeArticle(out, urlBase, url, payload.id);

    await storeMonthSitemap(urlBase, url);

    return {
        body: JSON.stringify({success: true}),
        statusCode: 200,
    }
};

async function getData(id) {
    const report = await request({
        uri: `${process.env.CMS_API_URL}v1/reports/${id}`,
        json: true,
    });

    const fragments = await request({
        uri: `${process.env.CMS_API_URL}v1/reports/fragments/?report=${id}`,
        json: true,
    });

    for (f of fragments.concat(report)) {
        if (f.media) {
            f.mediaSize = await imageSize(f.media);
        }
    }

    return {
        report,
        fragments,
    }
}

async function storeArticle(content, urlBase, url, id) {
    const defaultOpts = {
        Body: content,
        ContentType: "text/html",
        ACL: "public-read",
    };

    const list = await s3.listObjects({
        Prefix: `${urlBase}/${id}-`,
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
            WebsiteRedirectLocation: `/${url}`,
        }).promise();
    }
}

async function storeMonthSitemap(urlBase, url) {
    let sitemapExisting;
    try {
        sitemapExisting = (await s3.getObject({Key: `${urlBase}/sitemap.xml`}).promise()).Body;
    } catch(e) {
        if (e.code !== 'NoSuchKey') {
            throw e;
        }
    }
    let sitemapMonth = !sitemapExisting
        ? {
            _declaration: {
                _attributes: {
                    version: '1.0',
                    encoding: 'utf-8',
                },
            },
            urlset: {
                _attributes: {
                    xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
                },
                urls: [],
            },
        }
        : xml2js(sitemapExisting, { compact: true });
    if (!Array.isArray(sitemapMonth.urlset.urls)) {
        sitemapMonth.urlset.urls = [sitemapMonth.urlset.urls];
    }

    const urlOrigin = `http://${process.env.BUCKET_NAME}.s3-website.eu-central-1.amazonaws.com/`;
    const sitemapEntry = {
        loc: { '_text': urlOrigin.concat(url) },
        lastmod: { '_text': date.toISOString() },
        changefreq: { '_text': 'never' },
    };
    let replaced = false;
    const updatedUrls = sitemapMonth.urlset.urls.map((entry) => {
        if (!entry.loc._text.startsWith(`${urlOrigin}${urlBase}/${payload.id}-`)) {
            return entry;
        }
        if (entry.loc._text !== urlOrigin.concat(url)) {
            return null;
        }
        replaced = true;
        return {
            ...entry,
            ...sitemapEntry,
        };
    }).filter(e => !!e);
    if (!replaced) {
        updatedUrls.push(sitemapEntry);
    }

    sitemapMonth.urlset.urls = updatedUrls;
    const sitemapMonthXML = js2xml(sitemapMonth, { compact: true });
    await s3.putObject({
        Key: `${urlBase}/sitemap.xml`,
        Body: sitemapMonthXML,
        ContentType: 'application/xml',
        ACL: 'public-read',
    }).promise();
}
