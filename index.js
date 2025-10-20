app.post("/create-variant", async (req, res) => {
  const { product_id, option_name, price, weight } = req.body;

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
            weight: weight,
            weight_unit: "g",
          },
        }),
      }
    );

    const variantData = await variantRes.json();
    if (!variantRes.ok) return res.status(variantRes.status).json({ error: variantData });

    const variant = variantData.variant;

    // 3️⃣ Get store shipping profiles to find package ID
    const shippingRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/shipping_profiles.json`,
      { headers: { "X-Shopify-Access-Token": ACCESS_TOKEN } }
    );

    const shippingData = await shippingRes.json();
    console.log("Shipping Data:", JSON.stringify(shippingData, null, 2));

    const shippingProfiles = shippingData.shipping_profiles || [];

    let packageId = null;
    for (const profile of shippingProfiles) {
      if (profile.packages && profile.packages.length > 0) {
        const pkg = profile.packages.find(p => p.name === "Custom Package 24 Inches");
        if (pkg) {
          packageId = pkg.id;
          break;
        }
      }
    }

    if (!packageId) {
      return res.status(400).json({ error: "Package 'Custom Package 24 Inches' not found" });
    }

    // 4️⃣ Set package on the variant
    const variantUpdateRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/variants/${variant.id}.json`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
        body: JSON.stringify({
          variant: {
            id: variant.id,
            package_id: packageId,
          },
        }),
      }
    );

    const variantUpdateData = await variantUpdateRes.json();
    if (!variantUpdateRes.ok) return res.status(variantUpdateRes.status).json({ error: variantUpdateData });

    // 5️⃣ Get store location_id for inventory
    const locationRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/locations.json`,
      { headers: { "X-Shopify-Access-Token": ACCESS_TOKEN } }
    );

    const locationData = await locationRes.json();
    const locationId = locationData.locations[0].id;

    // 6️⃣ Set inventory to 10
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

    const stockData = await stockRes.json();
    if (!stockRes.ok) return res.status(stockRes.status).json({ error: stockData });

    res.status(201).json({ variant: variantUpdateData.variant, stock: stockData, packageId });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});
