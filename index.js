app.get("/test", async (req, res) => {
  const response = await fetch(
    `https://${SHOP}/admin/api/2025-01/shop.json`,
    {
      headers: {
        "X-Shopify-Access-Token": ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    }
  );

  const data = await response.json();
  res.json(data);
});
