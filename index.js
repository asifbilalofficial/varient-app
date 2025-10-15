app.post("/create-variant", async (req, res) => {
  let { product_id, option_name, price, weight, shipping_package } = req.body;

  if (!product_id || !option_name || !price) {
    return res.status(400).json({ error: "product_id, option_name, and price are required" });
  }

  try {
    // 1️⃣ Create unique option name
    const uniqueOptionName = `${option_name}-${Date.now()}`;

    // 2️⃣ Create variant
    const variantRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/products/${product_id}/variants.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
        body: JSON.stringify({
          variant: {
            option1: uniqueOptionName,
            price: String(price),
            sku: `SKU-${Date.now()}`,
            inventory_management: "shopify",
            weight: weight || 0,
            weight_unit: "g",
          },
        }),
      }
    );

    const variantData = await variantRes.json();
    if (!variantRes.ok) {
      return res.status(variantRes.status).json({ error: variantData });
    }

    const variant = variantData.variant;

    // 3️⃣ Get location ID
    const locRes = await fetch(`https://${SHOP}/admin/api/2025-01/locations.json`, {
      headers: { "X-Shopify-Access-Token": ACCESS_TOKEN },
    });
    const locData = await locRes.json();
    const locationId = locData.locations[0].id;

    // 4️⃣ Set initial inventory
    const stockRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/inventory_levels/set.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
        body: JSON.stringify({
          location_id: locationId,
          inventory_item_id: variant.inventory_item_id,
          available: 10,
        }),
      }
    );

    // 5️⃣ Save shipping package dimensions in metafields (Shopify’s recommended way)
    if (shipping_package) {
      const metafieldRes = await fetch(
        `https://${SHOP}/admin/api/2025-01/metafields.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": ACCESS_TOKEN,
          },
          body: JSON.stringify({
            metafield: {
              namespace: "shipping",
              key: "package_info",
              value: JSON.stringify(shipping_package),
              type: "json",
              owner_resource: "variant",
              owner_id: variant.id,
            },
          }),
        }
      );

      const metaData = await metafieldRes.json();
      console.log("📦 Saved shipping metafield:", metaData);
    }

    // ✅ Return all created info
    res.status(201).json({
      variant,
      message: "Variant created with shipping package metafield",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});
