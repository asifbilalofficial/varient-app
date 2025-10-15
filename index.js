import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 Shopify credentials
const SHOP = "6bc1e6-f0.myshopify.com"; // your shop domain
const ACCESS_TOKEN = "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"; // Admin API token

// Health check
app.get("/", (req, res) => res.send("✅ Server is alive"));

// POST endpoint to create a variant, inventory & package metafield
app.post("/create-variant", async (req, res) => {
  let { product_id, option_name, price, weight, shipping_package } = req.body;

  if (!product_id || !option_name || !price) {
    return res
      .status(400)
      .json({ error: "product_id, option_name, and price are required" });
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
      console.error("❌ Error creating variant:", variantData);
      return res.status(variantRes.status).json({ error: variantData });
    }

    const variant = variantData.variant;
    console.log(`✅ Variant created: ${variant.id}`);

    // 3️⃣ Get location ID
    const locRes = await fetch(`https://${SHOP}/admin/api/2025-01/locations.json`, {
      headers: { "X-Shopify-Access-Token": ACCESS_TOKEN },
    });

    const locData = await locRes.json();
    if (!locRes.ok || !locData.locations?.length) {
      return res.status(500).json({ error: "Unable to fetch location ID" });
    }

    const locationId = locData.locations[0].id;

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
      console.error("❌ Error setting inventory:", stockData);
      return res.status(stockRes.status).json({ error: stockData });
    }

    console.log(`📦 Inventory set for variant: ${variant.id}`);

    // 5️⃣ Save shipping package dimensions as metafield for the variant
    if (shipping_package) {
      try {
        const metafieldRes = await fetch(
          `https://${SHOP}/admin/api/2025-01/variants/${variant.id}/metafields.json`,
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
                type: "json",
                value: JSON.stringify(shipping_package),
              },
            }),
          }
        );

        const metaData = await metafieldRes.json();
        if (!metafieldRes.ok) {
          console.error("❌ Error saving metafield:", metaData);
        } else {
          console.log("📦 Saved shipping metafield:", metaData);
        }
      } catch (metaErr) {
        console.error("Metafield creation error:", metaErr);
      }
    }

    // ✅ Return all created info
    res.status(201).json({
      success: true,
      variant,
      message: "Variant created with shipping package metafield and inventory",
    });
  } catch (err) {
    console.error("🔥 Fatal error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
