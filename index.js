import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 Shopify credentials
const SHOP = "6bc1e6-f0.myshopify.com";
const ACCESS_TOKEN = "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";

// Health check
app.get("/", (req, res) => res.send("Server is alive"));

// POST endpoint to create a variant and set stock + shipping packages
app.post("/create-variant", async (req, res) => {
  let { product_id, option_name, price, weight, shipping_packages } = req.body;

  if (!product_id || !option_name || !price) {
    return res.status(400).json({
      error: "product_id, option_name, and price are required",
    });
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

    // 3️⃣ Get store location_id (needed for inventory)
    const locationRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/locations.json`,
      {
        headers: { "X-Shopify-Access-Token": ACCESS_TOKEN },
      }
    );
    const locationData = await locationRes.json();
    const locationId = locationData.locations[0].id;

    // 4️⃣ Set inventory to 10
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
    if (!stockRes.ok) {
      return res.status(stockRes.status).json({ error: stockData });
    }

    // 5️⃣ Save shipping package info as variant metafield (optional but powerful)
    if (shipping_packages && Array.isArray(shipping_packages)) {
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
              key: "package_details",
              type: "json",
              owner_id: variant.id,
              owner_resource: "variant",
              value: JSON.stringify(shipping_packages),
            },
          }),
        }
      );

      const metafieldData = await metafieldRes.json();
      if (!metafieldRes.ok) {
        console.warn("⚠️ Failed to save metafield:", metafieldData);
      }
    }

    // ✅ Return variant, stock, and shipping info
    res.status(201).json({
      variant,
      stock: stockData,
      shipping_packages,
      message: "Variant created and shipping details saved",
    });

  } catch (err) {
    console.error("❌ Error creating variant:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
