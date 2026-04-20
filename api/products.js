// api/products.js — Amazon PA-API 5 serverless function for Vercel
// Uses HMAC-SHA256 request signing as required by PA-API v5
// Environment variables needed:
//   AMAZON_ACCESS_KEY  — AWS IAM Access Key ID
//   AMAZON_SECRET_KEY  — AWS IAM Secret Access Key
//   AMAZON_PARTNER_TAG — your Associates tag (e.g. moc09c-20)

import crypto from 'crypto';

const HOST = 'webservices.amazon.com';
const REGION = 'us-east-1';
const SERVICE = 'ProductAdvertisingAPI';
const PATH = '/paapi5/searchitems';

function hmac(key, data, enc) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest(enc || 'buffer');
}

function buildSignature(secretKey, dateStamp, region, service, stringToSign) {
  const kDate    = hmac('AWS4' + secretKey, dateStamp);
  const kRegion  = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  return crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
}

function getDateTime() {
  return new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '').replace('T', 'T').slice(0, 15) + 'Z';
}

export default async function handler(req, res) {
  // CORS headers so index.html can fetch
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const accessKey  = process.env.AMAZON_ACCESS_KEY;
  const secretKey  = process.env.AMAZON_SECRET_KEY;
  const partnerTag = process.env.AMAZON_PARTNER_TAG || 'moc09c-20';

  if (!accessKey || !secretKey) {
    return res.status(500).json({ error: 'Missing Amazon credentials in environment variables' });
  }

  // PA-API 5 request payload
  const payload = JSON.stringify({
    Keywords:      'men gadgets',
    Resources: [
      'ItemInfo.Title',
      'ItemInfo.Features',
      'ItemInfo.ByLineInfo',
      'Offers.Listings.Price',
      'Images.Primary.Medium',
      'DetailPageURL'
    ],
    PartnerTag:    partnerTag,
    PartnerType:   'Associates',
    Marketplace:   'www.amazon.com',
    Operation:     'SearchItems',
    ItemCount:     10,
    SortBy:        'Relevance'
  });

  const amzDate  = getDateTime();
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');

  const canonicalHeaders = [
    'content-encoding:amz-1.0',
    'content-type:application/json; charset=utf-8',
    'host:' + HOST,
    'x-amz-date:' + amzDate,
    'x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems'
  ].join('\n') + '\n';

  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';

  const canonicalRequest = [
    'POST',
    PATH,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = [dateStamp, REGION, SERVICE, 'aws4_request'].join('/');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')
  ].join('\n');

  const signature = buildSignature(secretKey, dateStamp, REGION, SERVICE, stringToSign);

  const authHeader = [
    'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + credentialScope,
    'SignedHeaders=' + signedHeaders,
    'Signature=' + signature
  ].join(', ');

  try {
    const apiRes = await fetch('https://' + HOST + PATH, {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json; charset=utf-8',
        'Content-Encoding': 'amz-1.0',
        'X-Amz-Date':       amzDate,
        'X-Amz-Target':     'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
        'Authorization':    authHeader,
        'Host':             HOST
      },
      body: payload
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(502).json({ error: 'PA-API error', status: apiRes.status, detail: errText });
    }

    const json = await apiRes.json();
    const items = (json.SearchResult?.Items || []).map((item, i) => ({
      id:    1000 + i,
      title: item.ItemInfo?.Title?.DisplayValue || 'Amazon Product',
      brand: item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue || 'Amazon',
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount || 'See on Amazon',
      use:   'gadget',
      score: Math.floor(70 + Math.random() * 25),
      thumb: item.Images?.Primary?.Medium?.URL || '',
      desc:  (item.ItemInfo?.Features?.DisplayValues || []).slice(0, 1).join(' ') || 'Click to view on Amazon.',
      link:  item.DetailPageURL || 'https://www.amazon.com?tag=' + partnerTag,
      source: 'amazon'
    }));

    return res.status(200).json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
