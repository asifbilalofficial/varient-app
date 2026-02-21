app.get("/test", async (req, res) => {
  const response = await fetch(
    `https://${SHOP}/admin/api/2025-01/shop.json`,
    {
      headers: {
        "X-Shopify-Access-Token": "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",
        "Content-Type": "application/json",
      },
    }
  );

  const data = await response.json();
  res.json(data);
});


