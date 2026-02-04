import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// 🔑 Shopify credentials
const SHOP = "6bc1e6-f0.myshopify.com";
const ACCESS_TOKEN = "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";

// ⏪ Older API version (less strict)
const API_VERSION = "2023-07";

const HEADERS = {
  "Content-Type": "application/json",
  "X-Shopify-Access-Token": ACCESS_TOKEN,
};

// Health check
app.get("/", (_, res) => {
  res.send("✅ Server running (Shopify API 2023-07)");
});

/**
 * Body:
 * {
 *   product_id: "123456789",
 *   option_name: "CUSTOM-ORDER-123",
 *   price: "2500",
 *   weight: 400
 * }
 */
app.post("/create-variant", async (req, res) => {
  const { product_id, option_name, price, weight } = req.body;

  if (!product_id || !option_name || !price || !weight) {
    return res.status(400).json({
      error: "product_id, option_name, price, weight required",
    });
  }

  try {
    /* ------------------ CREATE VARIANT ------------------ */
    const variantRes = await fetch(
      `https://${SHOP}/admin/api/${API_VERSION}/products/${product_id}/variants.json`,
      {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          variant: {
            option1: option_name, // dynamic value allowed in old API
            price: String(price),
            sku: `SKU-${Date.now()}`,
            inventory_management: "shopify",
            weight: Math.round(weight),
            weight_unit: "g",
          },
        }),
      }
    );

    const variantData = await variantRes.json();

    if (!variantRes.ok) {
      console.error("SHOPIFY ERROR:", variantData);
      return res.status(400).json({
        error: "Variant creation failed",
        shopify_error: variantData,
      });
    }

    const variant = variantData.variant;

    /* ------------------ GET LOCATION ------------------ */
    const locRes = await fetch(
      `https://${SHOP}/admin/api/${API_VERSION}/locations.json`,
      { headers: HEADERS }
    );
    const locData = await locRes.json();
    const locationId = locData.locations[0].id;

    /* ------------------ SET INVENTORY ------------------ */
    const stockRes = await fetch(
      `https://${SHOP}/admin/api/${API_VERSION}/inventory_levels/set.json`,
      {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          location_id: locationId,
          inventory_item_id: variant.inventory_item_id,
          available: 10,
        }),
      }
    );

    const stockData = await stockRes.json();
    if (!stockRes.ok) {
      return res.status(400).json({
        error: "Inventory set failed",
        shopify_error: stockData,
      });
    }

    /* ------------------ SUCCESS ------------------ */
    res.status(201).json({
      message: "Variant created successfully (old API)",
      variant,
      inventory: stockData,
    });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

// Start server
app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
