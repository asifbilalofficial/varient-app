import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Shopify credentials
const SHOP = "6bc1e6-f0.myshopify.com";
const ACCESS_TOKEN = "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";

// Health check
app.get("/", (req, res) => res.send("Server is alive"));

// POST endpoint: create variant, assign package, set inventory
app.post("/create-variant", async (req, res) => {
  try {
    const { product_id, option_name, price, weight, package_name } = req.body;
    if (!product_id || !option_name || !price) {
      return res.status(400).json({ error: "product_id, option_name, and price are required" });
    }

    // 1️⃣ Create unique option name
    const uniqueOptionName = `${option_name}-${Date.now()}`;

    // 2️⃣ Create variant
    const variantResp = await fetch(`https://${SHOP}/admin/api/2025-01/products/${product_id}/variants.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": ACCESS_TOKEN },
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
    });

    const variantData = await variantResp.json();
    if (!variantData.variant) return res.status(500).json({ error: "Variant creation failed", data: variantData });

    const variant = variantData.variant;

    // 3️⃣ Get store location
    const locationResp = await fetch(`https://${SHOP}/admin/api/2025-01/locations.json`, {
      headers: { "X-Shopify-Access-Token": ACCESS_TOKEN },
    });
    const locationData = await locationResp.json();
    const locationId = locationData?.locations?.[0]?.id;
    if (!locationId) return res.status(500).json({ error: "No Shopify location found" });

    // 4️⃣ Set inventory to 10
    const inventoryResp = await fetch(`https://${SHOP}/admin/api/2025-01/inventory_levels/set.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": ACCESS_TOKEN },
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: variant.inventory_item_id,
        available: 10,
      }),
    });
    const inventoryData = await inventoryResp.json();
    if (!inventoryResp.ok) return res.status(inventoryResp.status).json({ error: inventoryData });

    // 5️⃣ Get shipping packages
    const shippingResp = await fetch(`https://${SHOP}/admin/api/2025-01/shipping_profiles.json`, {
      headers: { "X-Shopify-Access-Token": ACCESS_TOKEN },
    });
    const shippingData = await shippingResp.json();

    const shippingProfiles = shippingData?.shipping_profiles || [];
    let packageId = null;

    for (const profile of shippingProfiles) {
      for (const pkg of profile?.packages || []) {
        if (pkg.name === package_name) {
          packageId = pkg.id;
          break;
        }
      }
      if (packageId) break;
    }

    if (!packageId) {
      console.warn(`⚠️ Package "${package_name}" not found.`);
    } else {
      // 6️⃣ Assign package to variant
      await fetch(`https://${SHOP}/admin/api/2025-01/variants/${variant.id}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": ACCESS_TOKEN },
        body: JSON.stringify({ variant: { id: variant.id, package_id: packageId } }),
      });
    }

    // ✅ Return variant + inventory + package info
    res.status(201).json({ variant, stock: inventoryData, packageAssigned: packageId || null });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
