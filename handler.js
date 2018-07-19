const handlebars = require('handlebars');
const fs = require('mz/fs');
const request = require('request-promise-native');
const imageSize = require('probe-image-size');
const aws = require('aws-sdk');
const slugify = require('slugify');
const { js2xml, xml2js } = require('xml-js');
const amphtmlValidator = require('amphtml-validator');

const urlOrigin = `http://${process.env.BUCKET_NAME}.s3-website.eu-central-1.amazonaws.com/`;

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

    let apiData;
    try {
        apiData = await getData(payload.id);
    } catch(e) {
        return new BadRequestError(e).toLambdaResponse();
    }

    const { report, fragments } = apiData;

    const dateCreated = new Date(report.created);
    const dateModified = new Date(report.modified);
    const urlBase = `${dateCreated.getFullYear()}/${dateCreated.getMonth()+1}`;
    const url = `${urlBase}/${payload.id}-${slugify(report.headline)}`;

    const template = (await fs.readFile('template.html.handlebars')).toString();
    handlebars.registerHelper( "joinTags", ( tagList ) => tagList.map(( e ) => e.name).join( "," ));
    handlebars.registerHelper( "getImage", report.media ? report.media: 
            fragments.map((fragment) => fragment.media).filter(media=>media) ? 
            fragments.map((fragment) => fragment.media).filter(media=>media)[0] : null)
    const out = handlebars.compile(template)({
        ...apiData,
        url,
    });
    const validator = await amphtmlValidator.getInstance();
    const result = validator.validateString(out);

    ((result.status === 'PASS') ? console.log : console.error)(result.status);
    for (let ii = 0; ii < result.errors.length; ii++) {
      const error = result.errors[ii];
      let msg = 'line ' + error.line + ', col ' + error.col + ': ' + error.message;
      if (error.specUrl !== null) {
        msg += ' (see ' + error.specUrl + ')';
      }
      ((error.severity === 'ERROR') ? console.error : console.warn)(msg);
    }

    await storeArticle(out, urlBase, url, payload.id);

    await storeMonthSitemap(urlBase, url, payload, dateModified);

    await storeIndexSitemap(urlBase);

    if (result.status !== 'PASS') {
        throw 'AMP validation failed';
    }

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

module.exports.deleteReport = async function(event) {
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
    if (!payload.created) {
        return new BadRequestError('Creation date is missing').toLambdaResponse();
    }

    // make sure the report is actually deleted
    try {
        await getData(payload.id);
        return new BadRequestError('Report still exists in API').toLambdaResponse();
    } catch(e) { }

    const dateCreated = new Date(payload.created);
    const urlBase = `${dateCreated.getFullYear()}/${dateCreated.getMonth()+1}`;

    const list = await s3.listObjects({
        Prefix: `${urlBase}/${payload.id}-`,
    }).promise();

    for (e of list.Contents) {
        await storeMonthSitemap(urlBase, e.Key, payload, dateCreated, true);
        await s3.deleteObject({
            Key: e.Key,
        }).promise();
    }

    return {
        body: JSON.stringify({success: true}),
        statusCode: 200,
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

async function loadSitemap(urlBase) {
    let sitemapExisting;
    const sitemapKey = !urlBase ? "sitemap.xml" : `${urlBase}/sitemap.xml`
    try {
        sitemapExisting = (await s3.getObject({Key: sitemapKey}).promise()).Body;
    } catch(e) {
        if (e.code !== 'NoSuchKey') {
            throw e;
        }
    }
    const parentTag = !urlBase ? "sitemapindex" : "urlset";
    const childTag = !urlBase ? "sitemap" : "url";
    let sitemap = !sitemapExisting
        ? {
            _declaration: {
                _attributes: {
                    version: '1.0',
                    encoding: 'utf-8',
                },
            },
            [parentTag]: {
                _attributes: {
                    xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
                },
                [childTag]: [],
            },
        }
        : xml2js(sitemapExisting, { compact: true });
    if (!Array.isArray(sitemap[parentTag][childTag])) {
        sitemap[parentTag][childTag] = [sitemap[parentTag][childTag]];
    }
    return sitemap;
}

async function storeMonthSitemap(urlBase, url, payload, dateModified, deleteUrl) {
    const sitemapMonth = await loadSitemap(urlBase);
    const sitemapEntry = {
        loc: { '_text': urlOrigin.concat(url) },
        lastmod: { '_text': dateModified.toISOString() },
        changefreq: { '_text': 'never' },
    };
    let replaced = false;
    const updatedUrls = sitemapMonth.urlset.url.map((entry) => {
        if (!entry.loc._text.startsWith(`${urlOrigin}${urlBase}/${payload.id}-`)) {
            return entry;
        }
        if (entry.loc._text !== sitemapEntry.loc._text || deleteUrl) {
            return null;
        }
        replaced = true;
        return {
            ...entry,
            ...sitemapEntry,
        };
    }).filter(e => !!e);
    if (!replaced && !deleteUrl) {
        updatedUrls.push(sitemapEntry);
    }

    if (updatedUrls.length === 0) {
        storeIndexSitemap(urlBase, true);
        await s3.deleteObject({
            Key: `${urlBase}/sitemap.xml`,
        }).promise();
        return;
    }

    sitemapMonth.urlset.url = updatedUrls;
    const sitemapMonthXML = js2xml(sitemapMonth, { compact: true });
    await s3.putObject({
        Key: `${urlBase}/sitemap.xml`,
        Body: sitemapMonthXML,
        ContentType: 'application/xml',
        ACL: 'public-read',
    }).promise();
}

async function storeIndexSitemap(urlBase, deleteSitemap) {
    const sitemapIndex = await loadSitemap();
    const sitemapEntry = {
        loc: { '_text': `${urlOrigin}${urlBase}/sitemap.xml` },
        lastmod: { '_text': new Date().toISOString() },
    };
    let replaced = false;
    const updatedSitemaps = sitemapIndex.sitemapindex.sitemap.map((entry) => {
        if (entry.loc._text !== `${urlOrigin}${urlBase}/sitemap.xml`) {
            return entry;
        }
        if (deleteSitemap) {
            return null;
        }
        replaced = true;
        return {
            ...entry,
            ...sitemapEntry,
        };
    }).filter(e => !!e);
    if (!replaced && !deleteSitemap) {
        updatedSitemaps.push(sitemapEntry);
    }

    sitemapIndex.sitemapindex.sitemap = updatedSitemaps;
    const sitemapIndexXML = js2xml(sitemapIndex, { compact: true });
    await s3.putObject({
        Key: `sitemap.xml`,
        Body: sitemapIndexXML,
        ContentType: 'application/xml',
        ACL: 'public-read',
    }).promise();
}
