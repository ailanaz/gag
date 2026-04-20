// api/ebay.js — eBay Browse API serverless function for Vercel
// Environment variables needed:
//   EBAY_APP_ID — your eBay App ID (Client ID) from developer.ebay.com
//   EBAY_OAUTH_TOKEN — (optional) pre-generated OAuth token; if omitted the
//                      function will fetch one automatically using Client Credentials

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const appId       = process.env.EBAY_APP_ID;
  const certId      = process.env.EBAY_CERT_ID;    // needed only for OAuth auto-fetch
  let   oauthToken  = process.env.EBAY_OAUTH_TOKEN; // optional pre-set token

  if (!appId) {
    return res.status(500).json({ error: 'Missing EBAY_APP_ID environment variable' });
  }

  // --- Auto-fetch OAuth token if not supplied ---
  if (!oauthToken && certId) {
    const creds = Buffer.from(appId + ':' + certId).toString('base64');
    const tokRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + creds
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
    });
    const tokJson = await tokRes.json();
    oauthToken = tokJson.access_token;
  }

  if (!oauthToken) {
    return res.status(500).json({ error: 'No eBay OAuth token available. Set EBAY_OAUTH_TOKEN or EBAY_CERT_ID.' });
  }

  // eBay Browse API — search for newest men gadgets
  const params = new URLSearchParams({
    q:             'men gadget',
    limit:         '10',
    sort:          'newlyListed',
    filter:        'conditionIds:{1000}',  // New items only
    category_ids:  '293'                    // Consumer Electronics
  });

  try {
    const apiRes = await fetch('https://api.ebay.com/buy/browse/v1/item_summary/search?' + params.toString(), {
      headers: {
        'Authorization':   'Bearer ' + oauthToken,
        'X-EBAY-C-ENDUSERCTX': 'affiliateCampaignId=<ePNCampaignId>,affiliateReferenceId=<referenceId>'
      }
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(502).json({ error: 'eBay API error', status: apiRes.status, detail: errText });
    }

    const json = await apiRes.json();
    const items = (json.itemSummaries || []).map((item, i) => ({
      id:     2000 + i,
      title:  item.title || 'eBay Item',
      brand:  (item.brand || 'eBay') ,
      price:  item.price?.value ? '$' + item.price.value : 'See on eBay',
      use:    'gadget',
      score:  Math.floor(65 + Math.random() * 30),
      thumb:  item.image?.imageUrl || '',
      desc:   (item.condition || 'New') + ' · ' + (item.itemLocation?.country || 'US'),
      link:   item.itemWebUrl || 'https://www.ebay.com',
      source: 'ebay'
    }));

    return res.status(200).json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
