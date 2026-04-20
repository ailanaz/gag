// api/walmart.js — Walmart Open API serverless function for Vercel
// Uses Walmart Affiliate API (affiliate.api.walmart.com)
// Environment variables needed:
//   WALMART_CLIENT_ID     — from developer.walmart.com
//   WALMART_CLIENT_SECRET — from developer.walmart.com

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const clientId     = process.env.WALMART_CLIENT_ID;
  const clientSecret = process.env.WALMART_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Missing Walmart credentials (WALMART_CLIENT_ID / WALMART_CLIENT_SECRET)' });
  }

  // Step 1: Get OAuth2 token
  let token;
  try {
    const creds   = Buffer.from(clientId + ':' + clientSecret).toString('base64');
    const tokRes  = await fetch('https://marketplace.walmartapis.com/v3/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + creds,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Accept':        'application/json',
        'WM_QOS.CORRELATION_ID': 'gag-' + Date.now(),
        'WM_SVC.NAME': 'Walmart Marketplace'
      },
      body: 'grant_type=client_credentials'
    });
    const tokJson = await tokRes.json();
    token = tokJson.access_token;
  } catch (e) {
    return res.status(500).json({ error: 'Token fetch failed: ' + e.message });
  }

  if (!token) {
    return res.status(502).json({ error: 'Could not obtain Walmart access token' });
  }

  // Step 2: Search Walmart catalog
  const params = new URLSearchParams({
    query:      'men gadget',
    numItems:   '10',
    sort:       'new',
    categoryId: '3944'  // Electronics
  });

  try {
    const apiRes = await fetch('https://developer.api.walmart.com/api-proxy/service/affil/product/v2/search?' + params.toString(), {
      headers: {
        'WM_CONSUMER.ID':          clientId,
        'WM_SEC.ACCESS_TOKEN':     token,
        'WM_QOS.CORRELATION_ID':   'gag-search-' + Date.now(),
        'WM_SVC.NAME':             'Walmart Marketplace',
        'Accept':                  'application/json'
      }
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(502).json({ error: 'Walmart API error', status: apiRes.status, detail: errText });
    }

    const json = await apiRes.json();
    const items = ((json.items || json.Item || [])).map((item, i) => ({
      id:     3000 + i,
      title:  item.name || item.title || 'Walmart Product',
      brand:  item.brandName || 'Walmart',
      price:  item.salePrice ? '$' + item.salePrice : (item.msrp ? '$' + item.msrp : 'See at Walmart'),
      use:    'gadget',
      score:  item.customerRating ? Math.round(parseFloat(item.customerRating) * 20) : Math.floor(60 + Math.random() * 35),
      thumb:  item.largeImage || item.thumbnailImage || item.mediumImage || '',
      desc:   item.shortDescription ? item.shortDescription.replace(/<[^>]+>/g, '').slice(0, 120) : 'Available at Walmart.',
      link:   item.productUrl || item.addToCartUrl || 'https://www.walmart.com',
      source: 'walmart'
    }));

    return res.status(200).json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
